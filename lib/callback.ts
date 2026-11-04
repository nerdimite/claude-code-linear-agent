import { emitActivity, updateSession, userDisplayName, type PlanStep } from "./linear";
import { env } from "./env";
import { store, type Run } from "./store";

/** A finished session keeps listening for follow-ups for a while, so a reply lands in the same session. */
export function enterIdle(run: Run): void {
  const minutes = env.idleWindowMinutes;
  if (minutes > 0) {
    run.status = "idle";
    run.idleUntil = Date.now() + minutes * 60_000;
  } else {
    run.status = "finished";
    run.idleUntil = undefined;
  }
}

function idleNote(run: Run): string {
  if (run.status !== "idle" || !run.idleUntil) return "";
  const until = new Date(run.idleUntil).toISOString().slice(11, 16);
  return `\n\n_Reply here before ${until} UTC to continue in this same session. After that, a reply starts a new session._`;
}

const PLAN_STATUSES = new Set(["pending", "inProgress", "completed", "canceled"]);
const MAX_BODY = 20_000;

export type CallbackEvent =
  | { type: "plan"; steps: PlanStep[] }
  | { type: "thought"; body: string }
  | { type: "action"; action: string; parameter?: string; result?: string }
  | { type: "pr_opened"; url: string }
  | { type: "elicitation"; body: string }
  | { type: "done"; body: string }
  | { type: "failed"; body: string }
  | { type: "user_message"; body: string };

function str(v: unknown, max = MAX_BODY): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Validates an untrusted callback body. Returns null when it isn't a known, well-formed event. */
export function parseEvent(raw: unknown): CallbackEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "plan": {
      if (!Array.isArray(e.steps)) return null;
      const steps = e.steps
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({ content: str(s.content, 500), status: PLAN_STATUSES.has(String(s.status)) ? s.status : "pending" }) as PlanStep)
        .filter((s) => s.content)
        .slice(0, 30);
      return steps.length ? { type: "plan", steps } : null;
    }
    case "thought":
    case "elicitation":
    case "done":
    case "user_message":
    case "failed": {
      const body = str(e.body);
      return body ? ({ type: e.type, body } as CallbackEvent) : null;
    }
    case "action": {
      const action = str(e.action, 200);
      return action ? { type: "action", action, parameter: str(e.parameter, 1000), result: str(e.result, 4000) || undefined } : null;
    }
    case "pr_opened": {
      const url = str(e.url, 500);
      return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url) ? { type: "pr_opened", url } : null;
    }
    default:
      return null;
  }
}

/** Applies one event from the cloud session to Linear and returns the run's new state. */
export async function applyEvent(run: Run, event: CallbackEvent): Promise<Run> {
  const { organizationId: org, agentSessionId: sid } = run;
  switch (event.type) {
    case "plan":
      run.plan = event.steps;
      await updateSession(org, sid, { plan: event.steps });
      break;
    case "thought":
      await emitActivity(org, sid, { type: "thought", body: event.body });
      break;
    case "user_message": {
      // Someone typed to the session directly in claude.ai. Linear only lets people create prompts, so mirror it as a quote.
      const who = await userDisplayName(org, run.linearUserId);
      const quoted = event.body.split("\n").map((line) => `> ${line}`).join("\n");
      await emitActivity(org, sid, { type: "thought", body: `**${who}, in Claude Code:**\n\n${quoted}` });
      await store.appendTranscript(sid, { role: "user", kind: "chat", body: event.body, at: Date.now() });
      break;
    }
    case "action":
      await emitActivity(org, sid, { type: "action", action: event.action, parameter: event.parameter ?? "", result: event.result });
      break;
    case "pr_opened":
      await updateSession(org, sid, { addedExternalUrls: [{ label: "Pull request", url: event.url }] });
      await emitActivity(org, sid, { type: "action", action: "Opened pull request", parameter: event.url });
      break;
    case "elicitation":
      enterIdle(run);
      await emitActivity(org, sid, { type: "elicitation", body: `${event.body}${idleNote(run)}` });
      await store.appendTranscript(sid, { role: "agent", kind: "question", body: event.body, at: Date.now() });
      break;
    case "done":
      enterIdle(run);
      if (run.plan?.some((s) => s.status === "pending" || s.status === "inProgress")) {
        const closed = run.plan.map((s) => (s.status === "canceled" ? s : { ...s, status: "completed" as const }));
        await updateSession(org, sid, { plan: closed });
        run.plan = closed;
      }
      await emitActivity(org, sid, { type: "response", body: `${event.body}${idleNote(run)}` });
      await store.appendTranscript(sid, { role: "agent", kind: "summary", body: event.body, at: Date.now() });
      break;
    case "failed":
      run.status = "failed";
      await emitActivity(org, sid, { type: "error", body: event.body });
      await store.appendTranscript(sid, { role: "agent", kind: "failed", body: event.body, at: Date.now() });
      break;
  }
  run.lastCallbackAt = Date.now();
  run.watchdogNotifiedAt = undefined;
  await store.saveRun(run);
  return run;
}
