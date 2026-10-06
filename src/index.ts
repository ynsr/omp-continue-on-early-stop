import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "./core/config";
import { shouldContinue } from "./core/detect";
import { stripToken } from "./core/strip";
import { buildContract, buildNudge } from "./core/prompts";

function isOmp(): boolean {
  if (typeof Bun !== "undefined" && (Bun as unknown as { env?: Record<string, string> }).env?.OMPCODE === "1") return true;
  const e = typeof process !== "undefined" ? process.env : {} as Record<string, string | undefined>;
  const d = e.PI_CODING_AGENT_DIR ?? e.PI_CONFIG_DIR ?? "";
  return /(?:^|[/])\.omp(?:[/]|$)/.test(d);
}

type Logger = { warn(m: string, c?: Record<string, unknown>): void };
let log: Logger["warn"] = () => {};

export default function continueOnEarlyStop(pi: ExtensionAPI): void {
  try { pi.registerFlag("continue-max-nudges", { description: "Max continue nudges per intent (0=unbounded)", type: "string" }); } catch { /* host without flags */ }
  try { pi.registerFlag("continue-min-tools", { description: "Min successful tool calls to arm detection", type: "string" }); } catch { /* host without flags */ }

  let maxNudges = 20, minTools = 2;
  let toolCalls = 0, hasToken = false, errorFlag = false, nudges = 0;
  let settledLogged = false;

  pi.on("session_start", async (_e, ctx) => {
    const c = ctx as unknown as { logger?: Logger };
    log = c.logger?.warn ? c.logger.warn.bind(c.logger) : console.warn;
    try {
      const f = pi.getFlag("continue-max-nudges");
      const f2 = pi.getFlag("continue-min-tools");
      const r = resolveConfig({ maxNudges: f, minTools: f2 });
      maxNudges = r.maxNudges; minTools = r.minTools;
    } catch { /* keep defaults */ }
  });
  pi.on("before_agent_start", async (e) => {
    nudges = 0; toolCalls = 0; hasToken = false; errorFlag = false; settledLogged = false;
    const raw = typeof e === "object" && e !== null && "systemPrompt" in e ? e.systemPrompt : undefined;
    // Host sends systemPrompt as string[] (single 17K-char entry in omp 18.5.1),
    // despite bundled 0.84.4 types claiming string. Join defensively.
    const parts = typeof raw === "string" ? [raw] : Array.isArray(raw) ? (raw as unknown[]).filter((p): p is string => typeof p === "string") : [];
    const base = parts.join("\n\n");
    // Never override on empty/missing base: returning { systemPrompt: <contract-only> }
    // would replace the whole session prompt instead of appending to it.
    if (!base) return {};
    return { systemPrompt: [...parts, buildContract()].join("\n\n") };
  });
  pi.on("turn_start", async () => { settledLogged = false; });
  pi.on("tool_call", async () => { toolCalls++; });
  pi.on("tool_result", async (e) => {
    if (typeof e === "object" && e !== null && "isError" in e && e.isError === true && toolCalls > 0) toolCalls--;
  });
  pi.on("after_provider_response", async (e) => {
    const s = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 200;
    if (s >= 400) { errorFlag = true; try { log("continue-on-early-stop provider-error", { status: s }); } catch { /* ignore */ } }
  });
  // Primary strip: awaited content rewrite before history/transcript persistence.
  // "assistant_message" is newer than the bundled 0.84.4 types, so register untyped.
  const stripTextParts = (parts: { type: string; text?: string }[]): { found: boolean; content: { type: string; text?: string }[] } => {
    let found = false;
    const content = parts.map((p) => {
      if (p.type !== "text" || typeof p.text !== "string") return p;
      const r = stripToken(p.text);
      if (r.found) found = true;
      return r.found ? { ...p, text: r.text } : p;
    });
    return { found, content };
  };
  type LooseOn = { on(n: string, h: (e: { message?: { role?: string; content?: { type: string; text?: string }[] } }) => unknown): void };
  (pi as unknown as LooseOn).on("assistant_message", async (e) => {
    try {
      const msg = e.message;
      if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) return;
      const { found, content } = stripTextParts(msg.content);
      if (!found) return;
      hasToken = true;
      // Hook contract: return ONLY { content }; block positions/metadata must be unchanged.
      return { content };
    } catch { /* never throw */ }
  });
  // Fallback: older hosts without the hook still get hasToken detection (no rewrite).
  pi.on("message_end", async (e) => {
    try {
      const orig = e.message;
      if (orig.role !== "assistant") return;
      const { found } = stripTextParts(orig.content as { type: string; text?: string }[]);
      if (!found) return;
      hasToken = true;
    } catch { /* never throw */ }
  });
  const adjudicate = async () => {
    if (toolCalls === 0 && hasToken && nudges === 0) { try { log("continue-on-early-stop suspect-token", {}); } catch { /* ignore */ } }
    const { fire, reason } = shouldContinue({ toolCalls, minTools, hasToken, errorFlag, nudges, maxNudges });
    if (!fire) {
      if (!settledLogged) { settledLogged = true; try { log("continue-on-early-stop turn-settled", { reason, toolCalls }); } catch { /* ignore */ } }
      return;
    }
    const n = nudges + 1;
    try {
      const sender = pi as unknown as { sendUserMessage(c: string, o?: unknown): Promise<void> | void };
      await sender.sendUserMessage(buildNudge(n, maxNudges), { deliverAs: "followUp" });
      nudges = n;
      log("continue-on-early-stop premature-end", { reason: "ok", toolCalls, nudges });
    } catch { /* send failed: budget untouched, stop nudging this turn */ }
  };
  // Adjudicate ONLY at agent_end: per-turn adjudication double-nudges healthy
  // multi-turn runs (each turn_end fires before the next turn starts working).
  pi.on("agent_end", async () => { await adjudicate(); });
  void isOmp;
}
