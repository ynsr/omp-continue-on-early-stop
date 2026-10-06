export const DEFAULT_MAX_NUDGES = 20;
export const DEFAULT_MIN_TOOLS = 1;

function toNum(v: unknown, fb: number): number {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return fb;
}

export interface ResolvedConfig { maxNudges: number; minTools: number; }

export function resolveConfig(
  flags: { maxNudges?: unknown; minTools?: unknown } = {},
  env: Record<string, string | undefined> = Bun.env as Record<string, string | undefined>,
): ResolvedConfig {
  return {
    maxNudges: flags.maxNudges !== undefined ? toNum(flags.maxNudges, DEFAULT_MAX_NUDGES)
      : toNum(env.OMP_CONTINUE_MAX_NUDGES, DEFAULT_MAX_NUDGES),
    minTools: flags.minTools !== undefined ? toNum(flags.minTools, DEFAULT_MIN_TOOLS)
      : toNum(env.OMP_CONTINUE_MIN_TOOLS, DEFAULT_MIN_TOOLS),
  };
}
