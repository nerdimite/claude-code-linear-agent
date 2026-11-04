import { newOAuthState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { APP_SCOPES } from "@/lib/linear";

export const runtime = "nodejs";

/** Starts the workspace install of the bot as a Linear app user (actor=app). */
export async function GET() {
  const url = new URL("https://linear.app/oauth/authorize");
  url.searchParams.set("client_id", env.linearClientId);
  url.searchParams.set("redirect_uri", `${env.publicBaseUrl}/api/linear/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", APP_SCOPES);
  url.searchParams.set("actor", "app");
  url.searchParams.set("state", newOAuthState());
  return Response.redirect(url.toString(), 302);
}
