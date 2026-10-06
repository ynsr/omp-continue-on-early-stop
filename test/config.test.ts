import { describe, expect, test } from "bun:test";
import { resolveConfig, DEFAULT_MAX_NUDGES, DEFAULT_MIN_TOOLS } from "../src/core/config";

describe("resolveConfig", () => {
  test("defaults are 20/2", () => {
    expect(DEFAULT_MAX_NUDGES).toBe(20);
    expect(DEFAULT_MIN_TOOLS).toBe(2);
    const c = resolveConfig({}, {});
    expect(c).toEqual({ maxNudges: 20, minTools: 2 });
  });
  test("env fallback", () => {
    const c = resolveConfig({}, { OMP_CONTINUE_MAX_NUDGES: "7", OMP_CONTINUE_MIN_TOOLS: "2" });
    expect(c).toEqual({ maxNudges: 7, minTools: 2 });
  });
  test("flag wins over env", () => {
    const c = resolveConfig({ maxNudges: 3 }, { OMP_CONTINUE_MAX_NUDGES: "7" });
    expect(c.maxNudges).toBe(3);
    expect(c.minTools).toBe(2);
  });
  test("maxNudges=0 means unbounded (kept, not defaulted)", () => {
    expect(resolveConfig({ maxNudges: 0 }, {}).maxNudges).toBe(0);
  });
  test("garbage env falls back to default", () => {
    expect(resolveConfig({}, { OMP_CONTINUE_MAX_NUDGES: "abc" }).maxNudges).toBe(20);
  });
});
