export type Reason = "ok" | "has-token" | "below-min-tools" | "error-state" | "budget-exhausted";
export interface AdjudicationInput { toolCalls: number; minTools: number; hasToken: boolean; errorFlag: boolean; nudges: number; maxNudges: number; }
export function shouldContinue(a: AdjudicationInput): { fire: boolean; reason: Reason } {
  if (a.hasToken) return { fire: false, reason: "has-token" };
  if (a.errorFlag) return { fire: false, reason: "error-state" };
  if (a.toolCalls < a.minTools) return { fire: false, reason: "below-min-tools" };
  if (a.maxNudges !== 0 && a.nudges >= a.maxNudges) return { fire: false, reason: "budget-exhausted" };
  return { fire: true, reason: "ok" };
}
