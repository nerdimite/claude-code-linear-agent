import { callbackToken, newRunId } from "@/lib/crypto";
import { credentials } from "@/lib/credentials";
import { env } from "@/lib/env";
import { buildTestPayload } from "@/lib/payload";
import { fireRoutine, RoutineFireError } from "@/lib/routine";
import { getViewer } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

/** Starts one no-op session on the viewer's routine. It passes when the session calls back. */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in with Linear first." }, { status: 401 });
  const cred = await credentials.get(viewer.linearUserId);
  if (!cred) return Response.json({ error: "Save your routine first." }, { status: 400 });

  const runId = newRunId();
  await store.saveRun({
    runId,
    kind: "test",
    agentSessionId: `test:${runId}`,
    organizationId: viewer.organizationId,
    issueId: "",
    issueIdentifier: "TEST",
    linearUserId: viewer.linearUserId,
    status: "starting",
    createdAt: Date.now(),
  });
  try {
    const fired = await fireRoutine(cred, buildTestPayload(`${env.publicBaseUrl}/api/runs/${runId}/events`, callbackToken(runId)));
    const run = await store.getRun(runId);
    if (run) await store.saveRun({ ...run, status: "live", sessionUrl: fired.sessionUrl });
    await credentials.setLastTest(viewer.linearUserId, fired.sessionUrl);
    return Response.json({ runId, sessionUrl: fired.sessionUrl });
  } catch (err) {
    const run = await store.getRun(runId);
    if (run) await store.saveRun({ ...run, status: "failed" });
    const status = err instanceof RoutineFireError ? err.status : 500;
    const message =
      status === 401
        ? "Claude rejected the token. Generate a new one on the task's API trigger and save it again."
        : status === 404
          ? "Claude couldn't find that routine. Check the fire URL."
          : status === 429
            ? "This routine has hit its hourly start limit. Try again later."
            : status === 400
              ? "Claude refused the start. The task may be paused: turn it back on at claude.ai/code/routines."
              : `Couldn't start the test session: ${(err as Error).message}`;
    return Response.json({ error: message }, { status: 400 });
  }
}

/** Polls a test run: pending until the session calls back. */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in with Linear first." }, { status: 401 });
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  const run = await store.getRun(runId);
  if (!run || run.kind !== "test" || run.linearUserId !== viewer.linearUserId) return Response.json({ error: "Unknown test run." }, { status: 404 });
  const state = run.status === "finished" ? "passed" : run.status === "failed" ? "failed" : run.lastCallbackAt ? "reporting" : "starting";
  return Response.json({ state, sessionUrl: run.sessionUrl });
}
