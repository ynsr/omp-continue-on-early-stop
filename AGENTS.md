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
  3. `DONE_WAITING_USER_PROMPT` persists in no session-jsonl `text` part (strip guarantee;
     the nudge prompt itself is exempt).
- **e2e usage:**
  - `bun run e2e -- --keep` — keep scratch dir + session jsonl for debugging
    (default: deleted on pass, kept on fail).
  - `OMP_CONTINUE_MIN_TOOLS=2 bun run e2e` — env passthrough to raise the gate
    for the probe (also `OMP_CONTINUE_MAX_NUDGES`); e2e default 2/2.
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

## The full end-of-turn event picture

(Harness: pi-coding-agent 0.84.4 / omp 18.5.1. References: `ExtensionAPI.on`
overloads in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`.)

```mermaid
prompt submitted
  │
  ▼
before_agent_start ──► extension appends CONTRACT to systemPrompt
  │
  ▼
agent_start ──► loop begins
  │
  ▼
┌─ per TURN ──────────────────────────────
│ turn_start
│   │  model streams: message_start → message_update* ──► assistant_message hook
│   │                      (awaited rewrite BEFORE history/context persistence)
│   │  tool batch: tool_call → tool_execution_* → tool_result (+extension tool_call/tool_result)
│   │  model text finalizes: message_end (OBSERVE-ONLY result — no rewrite path)
│ turn_end ──► extension adjudicates (nudge? log?)
│   │  harness drains STEERING queue → injected before next LLM call
│   └──► more turns, or loop would exit ──► harness drains FOLLOWUP queue
│                                         └──► still nothing? exit loop
└─────────────────────────────────────────
  │
  ▼
agent_end (messages snapshot; observe-only)
  │
  ▼
retry / compaction / queued-continuation checks
  │
  ▼
agent_settled ──► "fully done, nothing pending anywhere"
```

### Confusing pairs

- **`turn_end` vs `agent_end`**: per-turn vs once-per-run. The adjudicator
  listens to both: premature stops surface as a stalled last turn
  (`agent_end`) or a mid-run stall (`turn_end`). Neither means "task complete".
- **`message_end` is NOT the rewrite hook.** It looks like one (returns
  `MessageEndEventResult`), but the harness ignores the return for
  history/transcript — proven live (token persisted verbatim). The awaited
  **`assistant_message`** hook (PR #13769, newer than bundled 0.84.4 types, so
  registered untyped) rewrites content before persistence. `message_end`
  stays as detect-only fallback for older hosts.
- **`agent_end` vs `agent_settled`**: `agent_end` = loop exited, but
  retry/compaction/queued-continuation may re-enter. `agent_settled` = truly
  terminal. Nudging uses `turn_end`/`agent_end` (must catch the stall *before*
  settle); queue-hold release uses `agent_settled` (releasing at `agent_end`
  could inject into a compaction retry).
- **`after_provider_response` (status) vs `tool_result` (isError)**:
  provider 4xx/5xx/abort = model not continuable → suppress nudge. Tool
  `isError` = normal harness→model feedback → fully ignored. Different
  layers, different handling.
- **`input` vs `sendUserMessage`**: `input` = harness→extension gate on
  *incoming* user text (`{action:"continue"|"transform"|"handled"}`, sees
  `streamingBehavior: steer|followUp`). `sendUserMessage` = extension→harness
  injection (nudge path, `deliverAs:"followUp"`). Queue-hold uses both: veto
  on `input`, release via `sendUserMessage`.
- **Extension `tool_call` vs `tool_execution_*`**: intent-to-call vs execution
  progress. The net-success counter uses `tool_call`/`tool_result`
  (intent + outcome), not execution internals.

### Role assignment

The completion token (`DONE_WAITING_USER_PROMPT`) is model-uttered text,
observed at the `assistant_message` hook (strip + `hasToken` flag). Harness
events don't carry it — `turn_end`/`agent_end` are where we *adjudicate
using* the flag, and `agent_settled` is where the queue-hold *releases*.
Each event has its role; the token doesn't move, only its name did
(`ALL_TASKS_DONE` → `DONE_WAITING_USER_PROMPT`: the token announces "this
unit of work is closed, ready for your next prompt", not global completion).

### Queued messages: harness-owned, extension does not re-queue (verdict)

- The agent loop drains steering only after `turn_end` + tool batch, and
  followUp only at loop-exit (`pi-agent-core/dist/agent-loop.js` runLoop).
  Queued prompts cannot land mid-task; `steeringMode`/`followUpMode`
  (`one-at-a-time`|`all`) control drain batching at the boundary only.
- The extension therefore implements NO hold-until-settled gate. A second
  extension-side queue (veto `input` → buffer → release at `agent_settled`)
  was considered and rejected: it risks lost input (compaction re-entry,
  runner invalidation, crash between hold and release), perturbs blind
  harness-internal drain ordering against our own followUp nudge, and
  depends on every client marking `streamingBehavior` correctly.
- The nudge already races correctly: it fires at `turn_end`/`agent_end`
  adjudication, i.e. before the loop-exit followUp drain, so completion
  pressure lands before queued intents do.
