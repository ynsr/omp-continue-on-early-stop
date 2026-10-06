export function stripToken(text: string): { text: string; found: boolean } {
  const lines = text.split("\n");
  const kept = lines.filter((l) => l.trim() !== "DONE_WAITING_USER_PROMPT");
  const found = kept.length !== lines.length;
  return { text: found ? kept.join("\n").trimEnd() : text, found };
}
