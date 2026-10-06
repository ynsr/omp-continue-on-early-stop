# Repository Guidelines

## Project Overview

Bun/TypeScript extension for **omp** (oh-my-pi) that detects premature LLM turn
endings and nudges the model to continue. Pure logic in `src/core/` (zero
harness imports); thin adapter in `src/index.ts`. Zero runtime dependencies.

## Development Commands

```bash
bun test                 # unit suite (bun:test, test/*.test.ts)
bun x tsc --noEmit       # typecheck (strict)
bun run build:omp        # → omp-continue-on-early-stop.ts (bundled, gitignored artifact)
./install.sh             # build + copy bundle to ~/.omp/agent/extensions/
./install.sh --check     # dry run
bun run e2e              # optional live test against real `omp -p` (see below)
```

## Testing & QA

- **Unit (`bun test`):** deterministic; covers config precedence
  (flag > env > default), detect/strip/prompts core, and adapter behavior via
  `makePi` mock (sequential awaited `emit`, last-handler result). 23 tests.
- **e2e (`bun run e2e`, file `e2e/run.ts`):** optional, manual-only, NOT part of
  `bun test` (filename deliberately lacks `.test.ts`). Spawns a real `omp -p`
  session against a live model over 7 scratch `.txt` files and asserts:
  1. a `premature-end` log fired (nudge loop armed + sent),
  2. extension logs present at all (extension loaded),
  3. `ALL_TASKS_DONE` persists in no session-jsonl `text` part (strip guarantee;
     the nudge prompt itself is exempt).
- **e2e usage:**
  - `bun run e2e -- --keep` — keep scratch dir + session jsonl for debugging
    (default: deleted on pass, kept on fail).
  - `OMP_CONTINUE_MIN_TOOLS=1 bun run e2e` — env passthrough (also
    `OMP_CONTINUE_MAX_NUDGES`); defaults 2/2 so a small task crosses the gate.
  - No `omp` on PATH → exits 0 with skip message (never fails CI/unit runs).
  - Exit 1 on FAIL with artifact path printed.
- **e2e is non-deterministic (real model).** A FAIL means "debug with the kept
  artifacts," not "regression." Do not gate merges on it.

## Conventions

- ESM, strict TS, extensionless relative imports.
- Handlers never throw into the harness; `turn_end`/`agent_end` observe-only.
- `assistant_message` hook = primary token strip (returns `{ content }` only);
  `message_end` = detect-only fallback for older hosts.
- Tool errors (`tool_result.isError`) fully ignored; only provider-level errors
  suppress nudges.
