import { describe, expect, test } from "bun:test";
import { stripToken } from "../src/core/strip";
describe("stripToken", () => {
  test("removes own-line token", () => {
    const r = stripToken("done stuff\nDONE_WAITING_USER_PROMPT\n");
    expect(r).toEqual({ text: "done stuff", found: true });
  });
  test("keeps mid-line occurrence", () => {
    const r = stripToken("mentions DONE_WAITING_USER_PROMPT inline");
    expect(r.found).toBe(false);
    expect(r.text).toBe("mentions DONE_WAITING_USER_PROMPT inline");
  });
  test("no token passthrough", () => {
    expect(stripToken("hello")).toEqual({ text: "hello", found: false });
  });
});
