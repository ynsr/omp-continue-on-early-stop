export interface ResolvedConfig { maxNudges: number; minTools: number; }
export function resolveConfig(_flags?: { maxNudges?: unknown; minTools?: unknown }): ResolvedConfig {
  return { maxNudges: 20, minTools: 5 };
}
