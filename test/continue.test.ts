import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import continueOnEarlyStop from "../src/index";

type Handler = (...args: unknown[]) => unknown;
function makePi() {
  const reg = new Map<string, Handler[]>();
  const sent: unknown[] = [];
  const pi = {
    on: (n: string, h: Handler) => { reg.set(n, [...(reg.get(n) ?? []), h]); },
    emit: async (n: string, ...a: unknown[]) => {
      let r: unknown;
      for (const h of reg.get(n) ?? []) r = await h(...a);
      return r;
    },
    sendUserMessage: (c: unknown, _o?: unknown) => { sent.push(c); },
    registerFlag: (_n: string, _o?: unknown) => {},
    getFlag: (_n: string) => undefined,
    _sent: sent,
  };
  return pi as unknown as ExtensionAPI & { _sent: unknown[]; emit(n: string, ...a: unknown[]): Promise<unknown> };
}
function sess(pi: { emit(n: string, ...a: unknown[]): Promise<unknown> }, cwd = "/tmp") {
  return pi.emit("session_start", {}, { cwd, logger: undefined });
}
describe("continue-on-early-stop", () => {
  test("no systemPrompt override on empty base", async () => {
    const pi = makePi();
    continueOnEarlyStop(pi);
    await sess(pi);
    expect(await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "" })).toEqual({});
    expect(await pi.emit("before_agent_start", { prompt: "do x" })).toEqual({});
    const r = await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "sys" }) as { systemPrompt?: string };
    expect(r.systemPrompt).toContain("sys");
    expect(r.systemPrompt).toContain("DONE_WAITING_USER_PROMPT");
  });
  test("nudges at agent_end after run-scoped successes without token", async () => {
    const pi = makePi();
    continueOnEarlyStop(pi);
    await sess(pi);
    await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "sys" });
    // two turns, 1 tool each: per-turn counting would see toolCalls=1 and stay silent
    for (let t = 0; t < 2; t++) {
      await pi.emit("turn_start", {});
      await pi.emit("tool_call", { toolName: "read", input: { path: "a" } });
      await pi.emit("tool_result", { toolName: "read", content: [] });
      await pi.emit("turn_end", { turnIndex: t, message: {}, toolResults: [] });
    }
    expect(pi._sent.length).toBe(0);
    await pi.emit("agent_end", { messages: [] });
    expect(pi._sent.length).toBe(1);
  });
  test("silent with token / below gate / net-3-after-errors / provider-5xx", async () => {
    const p1 = makePi(); continueOnEarlyStop(p1); await sess(p1);
    await p1.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) { await p1.emit("tool_call", { toolName: "read", input: { path: "a" } }); await p1.emit("tool_result", { toolName: "read", content: [] }); }
    await p1.emit("message_end", { message: { role: "assistant", content: [{ type: "text", text: "done\nDONE_WAITING_USER_PROMPT" }] } });
    await p1.emit("agent_end", { messages: [] });
    expect(p1._sent.length).toBe(0);
    const p2 = makePi(); continueOnEarlyStop(p2);
    (p2 as unknown as { getFlag: (n: string) => unknown }).getFlag = (n: string) => n === "continue-min-tools" ? 5 : undefined;
    await sess(p2);
    await p2.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 4; i++) { await p2.emit("tool_call", { toolName: "read", input: { path: "a" } }); await p2.emit("tool_result", { toolName: "read", content: [] }); }
    await p2.emit("agent_end", { messages: [] });
    expect(p2._sent.length).toBe(0);
    const p3 = makePi(); continueOnEarlyStop(p3);
    (p3 as unknown as { getFlag: (n: string) => unknown }).getFlag = (n: string) => n === "continue-min-tools" ? 5 : undefined;
    await sess(p3);
    await p3.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) {
      await p3.emit("tool_call", { toolName: "read", input: { path: "a" } });
      await p3.emit("tool_result", { toolName: "read", content: [], isError: i < 2 });
    }
    await p3.emit("agent_end", { messages: [] });
    expect(p3._sent.length).toBe(0);
    const p4 = makePi(); continueOnEarlyStop(p4); await sess(p4);
    await p4.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) { await p4.emit("tool_call", { toolName: "read", input: { path: "a" } }); await p4.emit("tool_result", { toolName: "read", content: [] }); }
    await p4.emit("after_provider_response", { status: 500, headers: {} });
    await p4.emit("agent_end", { messages: [] });
    expect(p4._sent.length).toBe(0);
  });
  test("message_end fallback still detects token (no rewrite)", async () => {
    const pi = makePi();
    continueOnEarlyStop(pi);
    await sess(pi);
    await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) { await pi.emit("tool_call", { toolName: "read", input: { path: "a" } }); await pi.emit("tool_result", { toolName: "read", content: [] }); }
    await pi.emit("message_end", { message: { role: "assistant", content: [{ type: "text", text: "work summary\nDONE_WAITING_USER_PROMPT\n" }] } });
    await pi.emit("agent_end", { messages: [] });
    expect(pi._sent.length).toBe(0);
  });
  test("budget: no 21st send", async () => {
    const pi = makePi();
    continueOnEarlyStop(pi);
    await sess(pi);
    await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) { await pi.emit("tool_call", { toolName: "read", input: { path: "a" } }); await pi.emit("tool_result", { toolName: "read", content: [] }); }
    for (let t = 0; t < 21; t++) {
      for (let i = 0; i < 5; i++) { await pi.emit("tool_call", { toolName: "read", input: { path: "a" } }); await pi.emit("tool_result", { toolName: "read", content: [] }); }
      await pi.emit("agent_end", { messages: [] });
    }
    expect(pi._sent.length).toBe(20);
  });
  test("failed async send does not consume budget", async () => {
    const pi = makePi();
    let calls = 0;
    (pi as unknown as { sendUserMessage: (c: unknown, o?: unknown) => Promise<void> }).sendUserMessage = (_c: unknown, _o?: unknown) => {
      calls++;
      return calls === 1 ? Promise.reject(new Error("queue full")) : Promise.resolve();
    };
    continueOnEarlyStop(pi);
    await sess(pi);
    await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    for (let i = 0; i < 5; i++) { await pi.emit("tool_call", { toolName: "read", input: { path: "a" } }); await pi.emit("tool_result", { toolName: "read", content: [] }); }
    await pi.emit("agent_end", { messages: [] });
    await pi.emit("agent_end", { messages: [] });
    expect(calls).toBe(2);
  });
  test("strips token via assistant_message content channel", async () => {
    const pi = makePi();
    continueOnEarlyStop(pi);
    await sess(pi);
    await pi.emit("before_agent_start", { prompt: "do x", systemPrompt: "s" });
    const r = await pi.emit("assistant_message", { message: { role: "assistant", content: [{ type: "text", text: "summary\nDONE_WAITING_USER_PROMPT\n" }] } }) as { content?: { text?: string }[] } | undefined;
    expect(r?.content?.[0]?.text).toBe("summary");
  });
});
