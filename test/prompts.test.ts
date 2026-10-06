import { describe, expect, test } from "bun:test";
import { buildContract, buildNudge, COMPLETION_TOKEN } from "../src/core/prompts";
describe("prompts", () => {
  test("contract teaches token", () => {
    expect(COMPLETION_TOKEN).toBe("ALL_TASKS_DONE");
    expect(buildContract()).toContain("ALL_TASKS_DONE");
  });
  test("nudge carries counter", () => {
    const n = buildNudge(2, 20);
    expect(n).toContain("2/20");
    expect(n).toContain("ALL_TASKS_DONE");
  });
});
