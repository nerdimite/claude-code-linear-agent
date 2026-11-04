import { credentials, FIRE_URL_RE, TOKEN_RE } from "@/lib/credentials";
import { getViewer } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in with Linear first." }, { status: 401 });
  return Response.json(await credentials.status(viewer.linearUserId));
}

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in with Linear first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { fireUrl?: string; token?: string };
  const fireUrl = body.fireUrl?.trim() ?? "";
  const token = body.token?.trim() ?? "";
  const errors: Record<string, string> = {};
  if (!FIRE_URL_RE.test(fireUrl)) errors.fireUrl = "Paste the full URL from the API trigger. It looks like https://api.anthropic.com/v1/claude_code/routines/trig_…/fire";
  if (!TOKEN_RE.test(token)) errors.token = "Paste the token shown when you generated it. It starts with sk-ant-oat01-";
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });
  await credentials.save(viewer.linearUserId, fireUrl, token);
  console.log(JSON.stringify({ event: "connect.saved", linearUserId: viewer.linearUserId }));
  return Response.json(await credentials.status(viewer.linearUserId));
}

export async function DELETE() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in with Linear first." }, { status: 401 });
  await credentials.remove(viewer.linearUserId);
  console.log(JSON.stringify({ event: "connect.removed", linearUserId: viewer.linearUserId }));
  return Response.json(await credentials.status(viewer.linearUserId));
}
