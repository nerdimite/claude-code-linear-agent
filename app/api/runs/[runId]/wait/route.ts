import { enterIdle } from "@/lib/callback";
import { verifyCallbackToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { emitActivity } from "@/lib/linear";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const POLL_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Long-poll for follow-ups. A session that has finished calls this in a loop while it is idle:
 * - "message": follow-ups arrived; act on them in this same session
 * - "timeout": nothing yet; call again
 * - "closed": the idle window is over; end the session
 * - "stop": the person pressed Stop; end the session
 */
export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!verifyCallbackToken(runId, token)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let run = await store.getRun(runId);
  if (!run) return Response.json({ error: "unknown run" }, { status: 404 });
  if (run.kind === "test") return Response.json({ status: "closed" });
  // Calling wait means the session has nothing left to do: make sure it is in the idle window, so it closes on time
  // even if a direct-chat report reopened the run.
  if (run.status === "live" || run.status === "starting") {
    enterIdle(run);
    await store.saveRun(run);
    if (env.idleWindowMinutes <= 0) return Response.json({ status: "closed" });
  }

  const deadline = Date.now() + Math.max(5, env.waitSeconds) * 1000;
  while (true) {
    run = await store.getRun(runId);
    if (!run) return Response.json({ status: "closed" });
    if (run.status === "stopped") return Response.json({ status: "stop" });

    if ((await store.inboxLength(runId)) > 0) {
      const inbox = await store.drainInbox(runId);
      run.status = "live";
      run.idleUntil = undefined;
      run.lastCallbackAt = Date.now();
      run.watchdogNotifiedAt = undefined;
      await store.saveRun(run);
      await emitActivity(run.organizationId, run.agentSessionId, {
        type: "thought",
        body: "Picked up your follow-up in the same session.",
      }).catch((err) => console.error(JSON.stringify({ event: "wait.emit_failed", runId, error: (err as Error).message })));
      console.log(JSON.stringify({ event: "wait.message", runId, count: inbox.length }));
      return Response.json({ status: "message", inbox });
    }

    if (run.status === "idle" && run.idleUntil && Date.now() >= run.idleUntil) {
      run.status = "finished";
      await store.saveRun(run);
      console.log(JSON.stringify({ event: "wait.closed", runId }));
      return Response.json({ status: "closed" });
    }
    if (run.status === "finished" || run.status === "failed") return Response.json({ status: "closed" });

    if (Date.now() + POLL_MS >= deadline) {
      const fresh = await store.getRun(runId);
      if (fresh?.status === "stopped") return Response.json({ status: "stop" });
      if (fresh) {
        fresh.lastCallbackAt = Date.now();
        await store.saveRun(fresh);
      }
      return Response.json({ status: "timeout" });
    }
    await sleep(POLL_MS);
  }
}
