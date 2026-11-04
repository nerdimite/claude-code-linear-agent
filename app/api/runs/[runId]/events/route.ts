import { applyEvent, parseEvent } from "@/lib/callback";
import { credentials } from "@/lib/credentials";
import { verifyCallbackToken } from "@/lib/crypto";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!verifyCallbackToken(runId, token)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const run = await store.getRun(runId);
  if (!run) return Response.json({ error: "unknown run" }, { status: 404 });
  if (run.status !== "live" && run.status !== "starting") {
    return Response.json({ inbox: [], stop: true, reason: `run is ${run.status}` }, { status: 410 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const event = parseEvent(raw);
  if (!event) return Response.json({ error: "unknown or malformed event" }, { status: 400 });

  if (run.kind === "test") {
    run.lastCallbackAt = Date.now();
    if (event.type === "done" || event.type === "failed") {
      run.status = event.type === "done" ? "finished" : "failed";
      if (event.type === "done") await credentials.markVerified(run.linearUserId, run.sessionUrl);
    }
    await store.saveRun(run);
    console.log(JSON.stringify({ event: "callback.test", runId, type: event.type, status: run.status }));
    return Response.json({ inbox: [], stop: false });
  }

  try {
    const updated = await applyEvent(run, event);
    const inbox = updated.status === "live" ? await store.drainInbox(runId) : [];
    console.log(JSON.stringify({ event: "callback", runId, type: event.type, status: updated.status, inbox: inbox.length }));
    return Response.json({ inbox, stop: false });
  } catch (err) {
    console.error(JSON.stringify({ event: "callback.failed", runId, type: event.type, error: (err as Error).message }));
    return Response.json({ error: "failed to relay to Linear" }, { status: 502 });
  }
}
