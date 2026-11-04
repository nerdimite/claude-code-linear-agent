import { describe, expect, it } from "vitest";
import { buildFirePayload, FIRE_TEXT_LIMIT, truncate } from "@/lib/payload";

const base = {
  issueIdentifier: "IQP-42",
  issueUrl: "https://linear.app/acme/issue/IQP-42",
  repository: "acme/app",
  baseBranch: "develop",
  callbackUrl: "https://bot.example.com/api/runs/run_abc/events",
  callbackToken: "tok_123",
  promptContext: '<issue identifier="IQP-42"><title>Fix it</title></issue>',
};

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("hello", 10, "x")).toBe("hello");
  });
  it("cuts long text to the budget and marks it", () => {
    const out = truncate("a".repeat(500), 100, "cut");
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toContain("[TRUNCATED: cut]");
  });
});

describe("buildFirePayload", () => {
  it("includes the callback contract, branch rule and issue", () => {
    const text = buildFirePayload(base);
    expect(text).toContain("Authorization: Bearer tok_123");
    expect(text).toContain(base.callbackUrl);
    expect(text).toContain("feat/iqp-42-");
    expect(text).toContain("fix/iqp-42-");
    expect(text).toContain("Fixes IQP-42");
    expect(text).toContain("with base develop");
    expect(text).toContain("If the issue explicitly names one of the other attached repositories");
    expect(text).not.toContain("unit tests");
    expect(text).toContain("https://bot.example.com/api/runs/run_abc/wait");
    expect(text).toContain("Waiting for follow-ups");
    expect(text).toContain('{"type":"user_message"');
    expect(text).toContain("read its description back from GitHub");
    expect(text).toContain("<linear-issue>\n" + base.promptContext + "\n</linear-issue>");
    expect(text).not.toContain("TRUNCATED");
  });

  it("stays under the fire limit with a huge issue and marks truncation", () => {
    const text = buildFirePayload({ ...base, promptContext: "x".repeat(200_000) });
    expect(text.length).toBeLessThanOrEqual(FIRE_TEXT_LIMIT);
    expect(text).toContain("read the full issue through the Linear connector");
    expect(text.endsWith("</linear-issue>")).toBe(true);
  });

  it("stays under the limit with a huge continuation as well", () => {
    const text = buildFirePayload({
      ...base,
      promptContext: "y".repeat(100_000),
      continuation: {
        previousSessionUrl: "https://claude.ai/code/cse_1",
        transcript: Array.from({ length: 500 }, (_, i) => ({ role: "agent" as const, kind: "done", body: "z".repeat(200), at: i })),
        message: "m".repeat(50_000),
      },
    });
    expect(text.length).toBeLessThanOrEqual(FIRE_TEXT_LIMIT);
    expect(text).toContain("This is a continuation run");
    expect(text).toContain("<follow-up>");
  });
});
