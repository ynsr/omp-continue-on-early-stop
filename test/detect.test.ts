import { describe, expect, test } from "bun:test";
import { shouldContinue } from "../src/core/detect";
const base = { toolCalls: 5, minTools: 5, hasToken: false, errorFlag: false, nudges: 0, maxNudges: 20 };
describe("shouldContinue", () => {
  test("fires at gate", () => expect(shouldContinue(base)).toEqual({ fire: true, reason: "ok" }));
  test("silent below gate", () => expect(shouldContinue({ ...base, toolCalls: 4 }).reason).toBe("below-min-tools"));
  test("silent on token", () => expect(shouldContinue({ ...base, hasToken: true }).reason).toBe("has-token"));
  test("silent on error", () => expect(shouldContinue({ ...base, errorFlag: true }).reason).toBe("error-state"));
  test("silent at budget", () => expect(shouldContinue({ ...base, nudges: 20 }).reason).toBe("budget-exhausted"));
  test("fires at 19/20", () => expect(shouldContinue({ ...base, nudges: 19 }).fire).toBe(true));
  test("unbounded maxNudges=0 always fires", () => expect(shouldContinue({ ...base, maxNudges: 0, nudges: 999 }).fire).toBe(true));
});
