import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";
import type { RoutineCredential } from "./routine";
import { redis } from "./store";

/** A person's routine, as stored. The token is AES-256-GCM encrypted at rest. */
type StoredRoutine = {
  fireUrl: string;
  tokenCiphertext: string;
  tokenHint: string;
  connectedAt: number;
  verifiedAt?: number;
  lastTestSessionUrl?: string;
};

export type RoutineStatus = {
  connected: boolean;
  fireUrl?: string;
  routineId?: string;
  tokenHint?: string;
  connectedAt?: number;
  verifiedAt?: number;
  lastTestSessionUrl?: string;
  source?: "connect" | "env";
};

export const FIRE_URL_RE = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/(trig_[A-Za-z0-9]+)\/fire$/;
export const TOKEN_RE = /^sk-ant-oat01-[A-Za-z0-9_-]{20,}$/;

function key(): Buffer {
  return createHash("sha256").update(`credentials:${env.encryptionKey}`).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

function decrypt(blob: string): string {
  const [iv, tag, body] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

const k = (linearUserId: string) => `routine:${linearUserId}`;

function envCredentials(): Record<string, RoutineCredential> {
  try {
    return JSON.parse(env.routinesJson);
  } catch {
    return {};
  }
}

export const credentials = {
  async save(linearUserId: string, fireUrl: string, token: string): Promise<void> {
    const stored: StoredRoutine = {
      fireUrl,
      tokenCiphertext: encrypt(token),
      tokenHint: `${token.slice(0, 18)}…${token.slice(-4)}`,
      connectedAt: Date.now(),
    };
    await redis().set(k(linearUserId), stored);
  },

  async remove(linearUserId: string): Promise<void> {
    await redis().del(k(linearUserId));
  },

  async markVerified(linearUserId: string, sessionUrl?: string): Promise<void> {
    const stored = await redis().get<StoredRoutine>(k(linearUserId));
    if (!stored) return;
    await redis().set(k(linearUserId), { ...stored, verifiedAt: Date.now(), lastTestSessionUrl: sessionUrl ?? stored.lastTestSessionUrl });
  },

  async setLastTest(linearUserId: string, sessionUrl: string): Promise<void> {
    const stored = await redis().get<StoredRoutine>(k(linearUserId));
    if (!stored) return;
    await redis().set(k(linearUserId), { ...stored, lastTestSessionUrl: sessionUrl, verifiedAt: undefined });
  },

  /** Connect-page credentials win; ROUTINES_JSON stays as the bootstrap fallback. */
  async get(linearUserId: string): Promise<RoutineCredential | null> {
    const stored = await redis().get<StoredRoutine>(k(linearUserId));
    if (stored) return { fireUrl: stored.fireUrl, token: decrypt(stored.tokenCiphertext) };
    return envCredentials()[linearUserId] ?? null;
  },

  async status(linearUserId: string): Promise<RoutineStatus> {
    const stored = await redis().get<StoredRoutine>(k(linearUserId));
    if (stored) {
      return {
        connected: true,
        source: "connect",
        fireUrl: stored.fireUrl,
        routineId: stored.fireUrl.match(FIRE_URL_RE)?.[1],
        tokenHint: stored.tokenHint,
        connectedAt: stored.connectedAt,
        verifiedAt: stored.verifiedAt,
        lastTestSessionUrl: stored.lastTestSessionUrl,
      };
    }
    const fromEnv = envCredentials()[linearUserId];
    if (fromEnv) return { connected: true, source: "env", fireUrl: fromEnv.fireUrl, routineId: fromEnv.fireUrl.match(FIRE_URL_RE)?.[1] };
    return { connected: false };
  },
};
