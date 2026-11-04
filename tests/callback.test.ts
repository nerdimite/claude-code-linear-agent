import { describe, expect, it } from "vitest";
import { parseEvent } from "@/lib/callback";

describe("parseEvent", () => {
  it("accepts a plan and coerces unknown statuses to pending", () => {
    expect(parseEvent({ type: "plan", steps: [{ content: "a", status: "inProgress" }, { content: "b", status: "weird" }] })).toEqual({
      type: "plan",
      steps: [
        { content: "a", status: "inProgress" },
        { content: "b", status: "pending" },
      ],
    });
  });
  it("rejects unknown types and empty bodies", () => {
    expect(parseEvent({ type: "rm -rf" })).toBeNull();
    expect(parseEvent({ type: "done", body: "" })).toBeNull();
    expect(parseEvent("nope")).toBeNull();
  });
  it("only accepts GitHub pull request URLs for pr_opened", () => {
    expect(parseEvent({ type: "pr_opened", url: "https://github.com/acme/app/pull/12" })).not.toBeNull();
    expect(parseEvent({ type: "pr_opened", url: "https://evil.example/pull/12" })).toBeNull();
  });
});

describe("enterIdle", () => {
  it("keeps a finished run listening for the configured window", async () => {
    process.env.IDLE_WINDOW_MINUTES = "30";
    const { enterIdle } = await import("@/lib/callback");
    const run = { status: "live" } as Parameters<typeof enterIdle>[0];
    const before = Date.now();
    enterIdle(run);
    expect(run.status).toBe("idle");
    expect(run.idleUntil).toBeGreaterThanOrEqual(before + 30 * 60_000);
  });
  it("finishes straight away when the window is 0", async () => {
    process.env.IDLE_WINDOW_MINUTES = "0";
    const { enterIdle } = await import("@/lib/callback");
    const run = { status: "live" } as Parameters<typeof enterIdle>[0];
    enterIdle(run);
    expect(run.status).toBe("finished");
    expect(run.idleUntil).toBeUndefined();
  });
});
