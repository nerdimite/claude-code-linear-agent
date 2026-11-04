import { Redis } from "@upstash/redis";

let client: Redis | undefined;

export function redis(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Missing Upstash Redis credentials (KV_REST_API_URL / KV_REST_API_TOKEN)");
  client = new Redis({ url, token });
  return client;
}

export type Install = {
  organizationId: string;
  appUserId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. Absent for non-expiring tokens. */
  expiresAt?: number;
};

/** "issue" runs serve a Linear agent session; "test" runs come from the connect page's test button. */
export type RunKind = "issue" | "test";

/** "idle": the session finished its work but is still waiting for follow-ups until `idleUntil`. */
export type RunStatus = "starting" | "live" | "idle" | "finished" | "stopped" | "failed";

export type Run = {
  runId: string;
  kind?: RunKind;
  agentSessionId: string;
  organizationId: string;
  issueId: string;
  issueIdentifier: string;
  linearUserId: string;
  status: RunStatus;
  sessionUrl?: string;
  createdAt: number;
  lastCallbackAt?: number;
  watchdogNotifiedAt?: number;
  /** Epoch ms when an idle session stops waiting for follow-ups. */
  idleUntil?: number;
  /** Last plan the session sent, so the bot can close it out on done. */
  plan?: { content: string; status: "pending" | "inProgress" | "completed" | "canceled" }[];
};

/** One line of the conversation for an agent session, used to brief continuation runs. */
export type TranscriptEntry = { role: "user" | "agent"; kind: string; body: string; at: number };

const DAY = 60 * 60 * 24;
const RUN_TTL = DAY * 30;

export const store = {
  async claimWebhook(key: string): Promise<boolean> {
    const result = await redis().set(`dedupe:${key}`, 1, { nx: true, ex: DAY });
    return result === "OK";
  },

  async saveInstall(install: Install): Promise<void> {
    await redis().set(`install:${install.organizationId}`, install);
  },
  async getInstall(organizationId: string): Promise<Install | null> {
    return redis().get<Install>(`install:${organizationId}`);
  },

  async saveRun(run: Run): Promise<void> {
    const r = redis();
    await r.set(`run:${run.runId}`, run, { ex: RUN_TTL });
    await r.set(`session:${run.agentSessionId}`, run.runId, { ex: RUN_TTL });
    if (run.status === "live" || run.status === "starting" || run.status === "idle") await r.sadd("runs:live", run.runId);
    else await r.srem("runs:live", run.runId);
  },
  async getRun(runId: string): Promise<Run | null> {
    return redis().get<Run>(`run:${runId}`);
  },
  async getRunForSession(agentSessionId: string): Promise<Run | null> {
    const runId = await redis().get<string>(`session:${agentSessionId}`);
    return runId ? this.getRun(runId) : null;
  },
  async liveRunIds(): Promise<string[]> {
    return redis().smembers("runs:live");
  },

  async pushInbox(runId: string, message: string): Promise<void> {
    await redis().rpush(`inbox:${runId}`, message);
    await redis().expire(`inbox:${runId}`, RUN_TTL);
  },
  async inboxLength(runId: string): Promise<number> {
    return redis().llen(`inbox:${runId}`);
  },
  async drainInbox(runId: string): Promise<string[]> {
    const r = redis();
    const [items] = await r.multi().lrange<string>(`inbox:${runId}`, 0, -1).del(`inbox:${runId}`).exec<[string[], number]>();
    return items ?? [];
  },

  async appendTranscript(agentSessionId: string, entry: TranscriptEntry): Promise<void> {
    await redis().rpush(`transcript:${agentSessionId}`, entry);
    await redis().expire(`transcript:${agentSessionId}`, RUN_TTL);
  },
  async getTranscript(agentSessionId: string): Promise<TranscriptEntry[]> {
    return redis().lrange<TranscriptEntry>(`transcript:${agentSessionId}`, 0, -1);
  },
};
