import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.redirect(new URL("/connect", env.publicBaseUrl).toString(), 303);
}
