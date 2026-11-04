import { verifyOAuthState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeToken, gqlWithToken, installFromToken } from "@/lib/linear";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!verifyOAuthState(url.searchParams.get("state"))) return new Response("Invalid OAuth state", { status: 400 });
  if (!code) return new Response(`Install failed: ${url.searchParams.get("error") ?? "no code"}`, { status: 400 });

  const token = await exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${env.publicBaseUrl}/api/linear/callback`,
  });
  const me = await gqlWithToken<{ viewer: { id: string; organization: { id: string; name: string } } }>(
    token.access_token,
    `query { viewer { id organization { id name } } }`,
  );
  await store.saveInstall(installFromToken(token, me.viewer.organization.id, me.viewer.id));
  console.log(JSON.stringify({ event: "install", organizationId: me.viewer.organization.id, appUserId: me.viewer.id }));
  return new Response(`Installed in ${me.viewer.organization.name}. You can close this tab.`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
