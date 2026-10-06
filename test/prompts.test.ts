import { describe, expect, test } from "bun:test";
import { buildContract, buildNudge, COMPLETION_TOKEN } from "../src/core/prompts";
describe("prompts", () => {
  test("contract teaches token", () => {
    expect(COMPLETION_TOKEN).toBe("DONE_WAITING_USER_PROMPT");
    expect(buildContract()).toContain("DONE_WAITING_USER_PROMPT");
  });
  test("nudge carries counter", () => {
    const n = buildNudge(2, 20);
    expect(n).toContain("2/20");
    expect(n).toContain("DONE_WAITING_USER_PROMPT");
  });
});
