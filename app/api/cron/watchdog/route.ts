import { env } from "@/lib/env";
import { emitActivity } from "@/lib/linear";
import { store } from "@/lib/store";

export const runtime = "nodejs";

const MINUTE = 60_000;
const QUIET_AFTER = 10 * MINUTE;
const GIVE_UP_AFTER = 120 * MINUTE;

/** Flags live runs that stopped reporting, so a stuck session never sits silently in Linear. */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const results: Record<string, string> = {};
  for (const runId of await store.liveRunIds()) {
    const run = await store.getRun(runId);
    if (!run) continue;
    const lastSeen = run.lastCallbackAt ?? run.createdAt;
    const quietFor = now - lastSeen;
    if (run.status === "idle") {
      // Waiting for follow-ups is quiet by design. Close it once the window (plus a grace period) has passed.
      if ((run.idleUntil ?? 0) + 10 * MINUTE < now) {
        run.status = "finished";
        await store.saveRun(run);
        results[runId] = "idle_closed";
      } else {
        results[runId] = "idle";
      }
      continue;
    }
    if (run.kind === "test") {
      if (quietFor > 15 * MINUTE) {
        run.status = "failed";
        await store.saveRun(run);
        results[runId] = "test_expired";
      }
      continue;
    }
    const link = run.sessionUrl ? ` ${run.sessionUrl}` : "";
    try {
      if (quietFor > GIVE_UP_AFTER) {
        run.status = "failed";
        await store.saveRun(run);
        await emitActivity(run.organizationId, run.agentSessionId, {
          type: "error",
          body: `No progress report for ${Math.round(quietFor / MINUTE)} minutes, so the bot stopped tracking this session. Check it at${link}.`,
        });
        results[runId] = "gave_up";
      } else if (quietFor > QUIET_AFTER && (!run.watchdogNotifiedAt || now - run.watchdogNotifiedAt > QUIET_AFTER)) {
        run.watchdogNotifiedAt = now;
        await store.saveRun(run);
        await emitActivity(run.organizationId, run.agentSessionId, {
          type: "thought",
          body: `No progress report for ${Math.round(quietFor / MINUTE)} minutes. The session may be waiting for your approval:${link}`,
        });
        results[runId] = "nudged";
      } else {
        results[runId] = "ok";
      }
    } catch (err) {
      results[runId] = `error: ${(err as Error).message}`;
    }
  }
  return Response.json({ checked: Object.keys(results).length, results });
}
