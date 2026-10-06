/**
 * e2e: real `omp -p` session against a live model.
 *
 * NOT part of `bun test` (name doesn't match test/*.test.ts). Run manually:
 *   bun run e2e
 *   bun run e2e -- --keep          keep session dir + probe files for debugging
 *   OMP_CONTINUE_MIN_TOOLS=1 bun run e2e   (env overrides)
 *
 * Proves against a real harness:
 *   1. premature turn end is detected and nudged (followUp re-prompts)
 *   2. DONE_WAITING_USER_PROMPT never persists in assistant text parts (strip works)
 *   3. extension logs (premature-end / turn-settled / suspect-token) appear
 *
 * Model output is non-deterministic: a failing run is a debugging artifact
 * (stdout + session jsonl are saved under the scratch dir), not proof of a bug.
 */
import { $ } from "bun";
// Requires: omp on PATH (bundled binary works; just needs -p/--no-ui/-e support).
const omp = (await $`which omp`.quiet().nothrow()).stdout.toString().trim();
if (!omp) {
  console.error("e2e: `omp` binary not found on PATH; skipping (not a failure)");
  process.exit(0);
}
if (Bun.argv.includes("--help") || Bun.argv.includes("-h")) {
  console.log("usage: bun run e2e [--keep]");
  process.exit(0);
}

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// args: --keep
const keep = Bun.argv.includes("--keep");
const scratch = await $`mktemp -d /tmp/omp-continue-e2e-XXXX`.quiet().then((r) => r.stdout.toString().trim());

// minimal gate so the model can cross it in a small task
const minTools = Bun.env.OMP_CONTINUE_MIN_TOOLS ?? "2";
const maxNudges = Bun.env.OMP_CONTINUE_MAX_NUDGES ?? "2";

// 7 small files: forces several successful read calls, satisfying the gate.
for (let i = 1; i <= 7; i++) {
  await Bun.write(`${scratch}/notes/file${i}.txt`, `note ${i} content alpha beta gamma delta\n`);
}

const prompt =
  "Read every .txt file in notes/ and report back each filename with its first three words. " +
  "Stop after reading, do not write anything.";

console.log(`e2e: scratch=${scratch} minTools=${minTools} maxNudges=${maxNudges}`);

const proc = Bun.spawn({
  cmd: [
    omp, "-p",
    "--auto-approve",
    "--thinking", "minimal",
    "--session-dir", `${scratch}/sess`,
    "-e", `${REPO}/omp-continue-on-early-stop.ts`,
    prompt,
  ],
  cwd: scratch,
  env: { ...Bun.env, OMPCODE: "1", OMP_CONTINUE_MIN_TOOLS: minTools, OMP_CONTINUE_MAX_NUDGES: maxNudges },
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
await proc.exited;

const log = stdout + stderr;
await Bun.write(`${scratch}/run.log`, log);

// ---- assertions on real output ----
const failures: string[] = [];

const hasNudge = /premature-end/.test(log);
const hasTokenEcho = /suspect-token/.test(log);

if (!hasNudge) failures.push("expected at least one 'premature-end' log (model didn't stop early, or gate too high)");
if (!hasTokenEcho && !/turn-settled/.test(log)) failures.push("no extension logs at all — extension may not have loaded");

// session file: no token in any assistant/user 'text' part
const sessionFiles = Array.from(new Bun.Glob("*.jsonl").scanSync({ cwd: `${scratch}/sess` }));
if (sessionFiles.length === 0) {
  failures.push("no session jsonl written");
} else {
  const path = `${scratch}/sess/${sessionFiles[0]}`;
  const lines = (await Bun.file(path).text()).split("\n").filter(Boolean);
  for (const line of lines) {
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { continue; }
    const m = rec as { type?: string; content?: unknown; message?: { content?: unknown } };
    const parts = (m.content ?? m.message) as { content?: { type?: string; text?: string }[] } | undefined;
    const arr = Array.isArray(parts) ? parts : Array.isArray(parts?.content) ? parts.content : [];
    for (const p of arr) {
      if (p?.type === "text" && typeof p.text === "string" && p.text.includes("DONE_WAITING_USER_PROMPT")) {
        const isNudge = p.text.includes("Continue (attempt");
        if (!isNudge) failures.push(`token leaked into persisted ${m.type ?? "?"} text part: ${JSON.stringify(p.text.slice(0, 120))}`);
      }
    }
  }
}

// report
if (failures.length) {
  console.error(`e2e: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`e2e: artifacts kept at ${scratch}${keep ? "" : " (re-run with --keep to preserve next time)"}`);
  process.exit(1);
}
console.log(`e2e: PASS — nudged premature end, no token leak in persisted text parts`);
console.log(`e2e: artifacts at ${scratch}${keep ? " (kept)" : " (delete with: rm -rf " + scratch + ")"}`);

if (!keep) await $`rm -rf ${scratch}`.quiet();
