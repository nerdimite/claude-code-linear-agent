import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const SESSION_COOKIE = "cla_session";
const MAX_AGE_S = 60 * 60 * 24 * 7;

/** Who is signed in to the connect page, as proven by Linear OAuth. */
export type Viewer = {
  linearUserId: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", env.signingSecret).update(`session:${payload}`).digest("base64url");
}

export function encodeSession(viewer: Omit<Viewer, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...viewer, exp: Date.now() + MAX_AGE_S * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string | undefined): Viewer | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const viewer = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Viewer;
    return viewer.exp > Date.now() ? viewer : null;
  } catch {
    return null;
  }
}

export async function getViewer(): Promise<Viewer | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_S,
};
