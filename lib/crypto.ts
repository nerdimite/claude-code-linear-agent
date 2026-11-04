import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function sign(purpose: string, value: string): string {
  return createHmac("sha256", env.signingSecret).update(`${purpose}:${value}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function newRunId(): string {
  return `run_${randomBytes(12).toString("base64url")}`;
}

/** Bearer token the cloud session presents on every callback for one run. */
export function callbackToken(runId: string): string {
  return sign("callback", runId);
}

export function verifyCallbackToken(runId: string, token: string): boolean {
  return safeEqual(callbackToken(runId), token);
}

/** OAuth state: a nonce plus its signature, so the callback can reject forged installs. */
export function newOAuthState(): string {
  const nonce = randomBytes(16).toString("base64url");
  return `${nonce}.${sign("oauth", nonce)}`;
}

export function verifyOAuthState(state: string | null): boolean {
  if (!state) return false;
  const [nonce, sig] = state.split(".");
  return Boolean(nonce && sig) && safeEqual(sign("oauth", nonce), sig);
}
