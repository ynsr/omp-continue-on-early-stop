# omp-continue-on-early-stop

Detects premature LLM turn endings and nudges the model to continue (omp / Pi).

## Why

The model sometimes ends its turn early — no tool call, work half-done — leaving
tasks incomplete. This extension watches for that and sends a follow-up prompt so
the model resumes where it stopped.

## Behavior

- **Completion contract.** Every turn's system prompt teaches the model to end its
  final message with `ALL_TASKS_DONE` on its own line, only when all work is done.
- **Arming gate.** Detection arms only when the turn made `minTools` (default 1)
  successful tool calls — pure Q&A never nudges.
- **Nudge.** On `turn_end`/`agent_end` with no token, enough successful calls, no
  provider-level error, and budget left, the extension sends a `<system-notice>`
  follow-up (`attempt n/max`) via `sendUserMessage`.
- **Token strip.** `message_end` removes the token line so it never reaches the transcript.
- **Tool errors ignored.** Failed tool results are the harness's business (it forwards
  them to the model); they don't count toward the gate and aren't logged.
- **Provider errors suppress.** HTTP 4xx/5xx or abort means the model isn't continuable:
  no nudge, one `provider-error` log line.
- **Logs.** `ctx.logger.warn`: `premature-end`, `turn-settled` (≤1/turn),
  `provider-error`, `suspect-token`.

## Config

Precedence: CLI flag > env var > default.

| Setting | Flag | Env | Default |
|---|---|---|---|
| Max nudges/intent (0=unbounded) | `--continue-max-nudges` | `OMP_CONTINUE_MAX_NUDGES` | 20 |
| Min successful calls to arm | `--continue-min-tools` | `OMP_CONTINUE_MIN_TOOLS` | 1 |

## Install

Via `config.yml` (recommended, no build needed):
```yaml
extensions:
  - /path/to/omp-continue-on-early-stop/src/index.ts
```

Or one-command bundle install:
```bash
./install.sh                  # build bundle, copy to ~/.omp/agent/extensions/
./install.sh --check          # dry run
```

Zero runtime dependencies (types-only `pi-coding-agent`).

## Development

```bash
bun test            # run the suite (bun:test)
bun x tsc --noEmit  # typecheck
```
