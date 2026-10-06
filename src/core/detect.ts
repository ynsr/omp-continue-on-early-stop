export type Reason = "ok" | "has-token" | "below-min-tools" | "error-state" | "budget-exhausted";
export function shouldContinue(_a: { toolCalls: number; minTools: number; hasToken: boolean; errorFlag: boolean; nudges: number; maxNudges: number }): { fire: boolean; reason: Reason } {
  return { fire: false, reason: "below-min-tools" };
}
