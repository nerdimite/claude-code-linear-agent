import type { AgentSessionEventWebhookPayload } from "@linear/sdk/webhooks";
import { callbackToken, newRunId } from "./crypto";
import { env } from "./env";
import { emitActivity, moveToStarted, updateSession } from "./linear";
import { buildFirePayload } from "./payload";
import { credentials } from "./credentials";
import { fireRoutine, RoutineFireError } from "./routine";
import { store, type Run } from "./store";

/** Where sessions work unless the issue names another attached repo. Set per deployment. */
export const DEFAULT_REPOSITORY = process.env.DEFAULT_REPOSITORY ?? "";
export const DEFAULT_BASE_BRANCH = process.env.DEFAULT_BASE_BRANCH ?? "main";

function connectHelp(): string {
  return `Your Claude account isn't connected yet, so there's no Claude Code session to start for you. Connect it at ${env.publicBaseUrl}/connect (takes about two minutes), then delegate the issue again.`;
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

type StartRunArgs = {
  organizationId: string;
  agentSessionId: string;
  issueId: string;
  issueIdentifier: string;
  issueUrl?: string;
  linearUserId: string;
  promptContext: string;
  continuation?: { previousSessionUrl?: string; message: string };
};

async function startRun(args: StartRunArgs): Promise<void> {
  const { organizationId, agentSessionId } = args;
  const cred = await credentials.get(args.linearUserId);
  if (!cred) {
    await emitActivity(organizationId, agentSessionId, { type: "error", body: connectHelp() });
    log("run.no_credentials", { agentSessionId, linearUserId: args.linearUserId });
    return;
  }

  if (!DEFAULT_REPOSITORY) {
    await emitActivity(organizationId, agentSessionId, { type: "error", body: "The agent has no DEFAULT_REPOSITORY configured. Ask whoever hosts it to set one." });
    return;
  }

  const run: Run = {
    runId: newRunId(),
    kind: "issue",
    agentSessionId,
    organizationId,
    issueId: args.issueId,
    issueIdentifier: args.issueIdentifier,
    linearUserId: args.linearUserId,
    status: "starting",
    createdAt: Date.now(),
  };
  await store.saveRun(run);

  const text = buildFirePayload({
    issueIdentifier: args.issueIdentifier,
    issueUrl: args.issueUrl,
    repository: DEFAULT_REPOSITORY,
    baseBranch: DEFAULT_BASE_BRANCH,
    callbackUrl: `${env.publicBaseUrl}/api/runs/${run.runId}/events`,
    callbackToken: callbackToken(run.runId),
    promptContext: args.promptContext,
    continuation: args.continuation
      ? { ...args.continuation, transcript: await store.getTranscript(agentSessionId) }
      : undefined,
  });

  try {
    const fired = await fireRoutine(cred, text);
    run.status = "live";
    run.sessionUrl = fired.sessionUrl;
    await store.saveRun(run);
    log("run.fired", { runId: run.runId, agentSessionId, sessionUrl: fired.sessionUrl, textLength: text.length });
    await updateSession(organizationId, agentSessionId, {
      addedExternalUrls: [{ label: args.continuation ? "Claude Code session (continued)" : "Claude Code session", url: fired.sessionUrl }],
    });
    await emitActivity(organizationId, agentSessionId, {
      type: "action",
      action: args.continuation ? "Started a continuation session" : "Started Claude Code session",
      parameter: fired.sessionUrl,
    });
  } catch (err) {
    run.status = "failed";
    await store.saveRun(run);
    const detail =
      err instanceof RoutineFireError && err.status === 429
        ? `Your Claude routine hit its hourly start limit. Try again after ${err.retryAfter ?? "a while"}.`
        : `Couldn't start the Claude Code session: ${(err as Error).message}`;
    log("run.fire_failed", { runId: run.runId, agentSessionId, error: (err as Error).message });
    await emitActivity(organizationId, agentSessionId, { type: "error", body: detail });
  }
}

export async function handleCreated(p: AgentSessionEventWebhookPayload): Promise<void> {
  const s = p.agentSession;
  await emitActivity(p.organizationId, s.id, { type: "thought", body: "Starting a Claude Code session…" }, { ephemeral: true });

  const issue = s.issue;
  const linearUserId = s.creatorId ?? s.creator?.id;
  if (!issue || !s.issueId) {
    await emitActivity(p.organizationId, s.id, { type: "error", body: "This bot only works on issues. Delegate an issue to it or mention it in an issue." });
    return;
  }
  if (!linearUserId) {
    await emitActivity(p.organizationId, s.id, { type: "error", body: "Couldn't tell who started this session, so there's no Claude account to run it on." });
    return;
  }

  try {
    await moveToStarted(p.organizationId, s.issueId);
  } catch (err) {
    log("issue.move_failed", { issueId: s.issueId, error: (err as Error).message });
  }

  await store.appendTranscript(s.id, { role: "user", kind: "delegated", body: `Delegated ${issue.identifier}`, at: Date.now() });
  await startRun({
    organizationId: p.organizationId,
    agentSessionId: s.id,
    issueId: s.issueId,
    issueIdentifier: issue.identifier,
    issueUrl: issue.url,
    linearUserId,
    promptContext: p.promptContext ?? `<issue identifier="${issue.identifier}"><title>${issue.title}</title></issue>`,
  });
}

export async function handlePrompted(p: AgentSessionEventWebhookPayload): Promise<void> {
  const s = p.agentSession;
  const activity = p.agentActivity;
  if (!activity) return;
  const run = await store.getRunForSession(s.id);

  if (activity.signal === "stop") {
    if (run && (run.status === "live" || run.status === "starting" || run.status === "idle")) {
      run.status = "stopped";
      await store.saveRun(run);
    }
    await emitActivity(p.organizationId, s.id, {
      type: "response",
      body: run?.sessionUrl
        ? `Stop requested. The session halts at its next progress report. To stop it right away, open ${run.sessionUrl} and stop it there.`
        : "Stopped.",
    });
    return;
  }

  const message = String((activity.content as { body?: string }).body ?? "").trim();
  if (!message) return;
  await store.appendTranscript(s.id, { role: "user", kind: "follow-up", body: message, at: Date.now() });

  const listening = run && run.status === "idle" && (run.idleUntil ?? 0) > Date.now();
  if (run && (run.status === "live" || listening)) {
    await store.pushInbox(run.runId, message);
    await emitActivity(p.organizationId, s.id, {
      type: "thought",
      body: listening
        ? "Sending this to the same session, which is waiting for follow-ups. It picks it up within seconds."
        : "Passed your message to the running session. It picks it up at its next progress report.",
    });
    return;
  }

  const issue = s.issue;
  if (!issue || !s.issueId) return;
  await emitActivity(p.organizationId, s.id, { type: "thought", body: "The earlier session has ended. Starting a continuation session…" }, { ephemeral: true });
  await startRun({
    organizationId: p.organizationId,
    agentSessionId: s.id,
    issueId: s.issueId,
    issueIdentifier: issue.identifier,
    issueUrl: issue.url,
    linearUserId: activity.userId ?? s.creatorId ?? "",
    promptContext: p.promptContext ?? `<issue identifier="${issue.identifier}"><title>${issue.title}</title></issue>`,
    continuation: { previousSessionUrl: run?.sessionUrl, message },
  });
}
