import { cookies } from "next/headers";
import { verifyOAuthState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeToken, gqlWithToken } from "@/lib/linear";
import { encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

type Me = {
  viewer: { id: string; name: string; displayName: string; email: string; avatarUrl: string | null; organization: { id: string; name: string } };
};

function back(error?: string) {
  const url = new URL("/connect", env.publicBaseUrl);
  if (error) url.searchParams.set("error", error);
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = url.searchParams.get("state");
  const expected = jar.get("cla_oauth_state")?.value;
  jar.delete("cla_oauth_state");
  if (!state || state !== expected || !verifyOAuthState(state)) return back("state");
  const code = url.searchParams.get("code");
  if (!code) return back("denied");

  try {
    const token = await exchangeToken({ grant_type: "authorization_code", code, redirect_uri: `${env.publicBaseUrl}/api/auth/linear/callback` });
    const me = await gqlWithToken<Me>(token.access_token, `query { viewer { id name displayName email avatarUrl organization { id name } } }`);
    // Revoke right away: the page only needed to learn who you are.
    await fetch("https://api.linear.app/oauth/revoke", { method: "POST", headers: { Authorization: `Bearer ${token.access_token}` } }).catch(() => {});
    const v = me.viewer;
    if (!(await store.getInstall(v.organization.id))) return back("workspace");
    jar.set(
      SESSION_COOKIE,
      encodeSession({
        linearUserId: v.id,
        organizationId: v.organization.id,
        organizationName: v.organization.name,
        name: v.displayName || v.name,
        email: v.email,
        avatarUrl: v.avatarUrl ?? undefined,
      }),
      sessionCookieOptions,
    );
    console.log(JSON.stringify({ event: "connect.sign_in", linearUserId: v.id, organizationId: v.organization.id }));
    return back();
  } catch (err) {
    console.error(JSON.stringify({ event: "connect.sign_in_failed", error: (err as Error).message }));
    return back("linear");
  }
}
