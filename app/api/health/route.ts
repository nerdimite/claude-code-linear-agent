export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true });
}

/** Echo endpoint used to prove a cloud session can reach this deployment. */
export async function POST(req: Request) {
  const body = await req.text();
  console.log(JSON.stringify({ event: "health.post", body: body.slice(0, 500) }));
  return Response.json({ ok: true, received: body.length });
}
