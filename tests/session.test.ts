import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

beforeAll(() => {
  process.env.BOT_SIGNING_SECRET = "test-secret";
});

const viewer = { linearUserId: "u1", organizationId: "o1", organizationName: "Org", name: "Ada" };

describe("session cookie", () => {
  it("round-trips a signed viewer", async () => {
    const { encodeSession, decodeSession } = await import("@/lib/session");
    const decoded = decodeSession(encodeSession(viewer));
    expect(decoded).toMatchObject(viewer);
  });

  it("rejects a tampered payload", async () => {
    const { encodeSession, decodeSession } = await import("@/lib/session");
    const [, sig] = encodeSession(viewer).split(".");
    const forged = Buffer.from(JSON.stringify({ ...viewer, linearUserId: "attacker", exp: Date.now() + 1e6 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects garbage", async () => {
    const { decodeSession } = await import("@/lib/session");
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("nope")).toBeNull();
  });
});

describe("credential formats", () => {
  it("accepts a real fire URL and token shape only", async () => {
    const { FIRE_URL_RE, TOKEN_RE } = await import("@/lib/credentials");
    expect(FIRE_URL_RE.test("https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire")).toBe(true);
    expect(FIRE_URL_RE.test("https://evil.example/v1/claude_code/routines/trig_01ABC/fire")).toBe(false);
    expect(TOKEN_RE.test("sk-ant-oat01-" + "a".repeat(40))).toBe(true);
    expect(TOKEN_RE.test("sk-ant-api03-" + "a".repeat(40))).toBe(false);
  });
});
