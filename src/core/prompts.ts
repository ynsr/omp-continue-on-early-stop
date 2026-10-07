export const COMPLETION_TOKEN = "DONE_WAITING_USER_PROMPT";
export function buildContract(): string {
  return `<completion-contract>\nWhen this unit of work is fully done, end your final message with ${COMPLETION_TOKEN} on its own line. Never emit it mid-work; if work remains, keep going.\n</completion-contract>`;
}
export function buildNudge(n: number, max: number): string {
  return `<system-notice>\nContinue (attempt ${n}/${max}): resume the most recent intent and finish the unfinished work from where it stopped. Don't summarize progress, re-confirm the plan, or ask whether to proceed. When the unit of work is closed, end with ${COMPLETION_TOKEN} on its own line.\n</system-notice>`;
}
