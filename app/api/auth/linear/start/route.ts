import { cookies } from "next/headers";
import { newOAuthState } from "@/lib/crypto";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Sign in with Linear (actor=user, read only) so the connect page knows whose routine it is saving. */
export async function GET() {
  const state = newOAuthState();
  (await cookies()).set("cla_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://linear.app/oauth/authorize");
  url.searchParams.set("client_id", env.linearClientId);
  url.searchParams.set("redirect_uri", `${env.publicBaseUrl}/api/auth/linear/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return Response.redirect(url.toString(), 302);
}
