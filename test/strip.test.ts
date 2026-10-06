import { describe, expect, test } from "bun:test";
import { stripToken } from "../src/core/strip";
describe("stripToken", () => {
  test("removes own-line token", () => {
    const r = stripToken("done stuff\nALL_TASKS_DONE\n");
    expect(r).toEqual({ text: "done stuff", found: true });
  });
  test("keeps mid-line occurrence", () => {
    const r = stripToken("mentions ALL_TASKS_DONE inline");
    expect(r.found).toBe(false);
    expect(r.text).toBe("mentions ALL_TASKS_DONE inline");
  });
  test("no token passthrough", () => {
    expect(stripToken("hello")).toEqual({ text: "hello", found: false });
  });
});
