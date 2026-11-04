import { LinearWebhookClient, LINEAR_WEBHOOK_SIGNATURE_HEADER, type AgentSessionEventWebhookPayload } from "@linear/sdk/webhooks";
import { after } from "next/server";
import { handleCreated, handlePrompted } from "@/lib/agent";
import { env } from "@/lib/env";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER) ?? "";
  try {
    if (!new LinearWebhookClient(env.linearWebhookSecret).verify(raw, signature)) throw new Error("bad signature");
  } catch (err) {
    return Response.json({ error: `invalid webhook: ${(err as Error).message}` }, { status: 401 });
  }

  const payload = JSON.parse(raw.toString("utf8")) as { type: string; action?: string; webhookId?: string };
  console.log(JSON.stringify({ event: "webhook", type: payload.type, action: payload.action, webhookId: payload.webhookId }));
  if (payload.type !== "AgentSessionEvent") return Response.json({ ok: true });

  const p = payload as unknown as AgentSessionEventWebhookPayload;
  // `webhookId` identifies the webhook subscription, not the delivery, so it can't dedupe.
  // A retried delivery repeats the same action on the same session and activity.
  const dedupeKey = `${p.action}:${p.agentSession.id}:${p.agentActivity?.id ?? "-"}`;
  if (!(await store.claimWebhook(dedupeKey))) return Response.json({ ok: true, duplicate: true });

  after(async () => {
    try {
      if (p.action === "created") await handleCreated(p);
      else if (p.action === "prompted") await handlePrompted(p);
    } catch (err) {
      console.error(JSON.stringify({ event: "webhook.handler_failed", action: p.action, agentSessionId: p.agentSession?.id, error: (err as Error).stack }));
    }
  });
  return Response.json({ ok: true });
}
