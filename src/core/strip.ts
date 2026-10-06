export function stripToken(text: string): { text: string; found: boolean } {
  const lines = text.split("\n");
  const kept = lines.filter((l) => l.trim() !== "ALL_TASKS_DONE");
  const found = kept.length !== lines.length;
  return { text: found ? kept.join("\n").trimEnd() : text, found };
}
