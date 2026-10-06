export const COMPLETION_TOKEN = "DONE_WAITING_USER_PROMPT";
export function buildContract(): string {
  return `<completion-contract>\nWhen the current task is finished and you are ready for the user's next prompt, end your final message with the line ${COMPLETION_TOKEN} on its own line.\nEmit it ONLY when this unit of work is closed \u2014 never as a placeholder, never mid-work.\nIf work remains, just continue working; do not emit the token.\n</completion-contract>`;
}
export function buildNudge(n: number, max: number): string {
  return `<system-notice>\nContinue (attempt ${n}/${max}). MUST resume most recent intent; complete unfinished work from where it stopped.\nNEVER summarize progress, re-confirm plan, or ask whether to proceed \u2014 just continue.\nWhen this unit of work is closed and you are ready for the user's next prompt, end your message with ${COMPLETION_TOKEN} on its own line.\n</system-notice>`;
}
