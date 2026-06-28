# vibefullness — low-cognitive-load output mode for Claude Code

An always-on **communication discipline** for Claude Code that shapes every response to cost the operator the least cognitive power to read and to trust.

It exists because sustained, intense AI-driven work has a real cost the tooling rarely addresses: **verification/review fatigue** — the constant load of reading dense output and judging whether to trust it, response after response, for weeks. That load is the documented #1 drain in long agent sessions. `vibefullness` attacks it at the source: it makes the model's output *cheap to read* and *cheap to verify*.

> Not brevity. That's word choice (see [caveman mode](https://github.com/), which this composes with). `vibefullness` is **information economy** — what goes where, what to omit, and how to make a claim verifiable at a glance.

## The contract

Every response is shaped to this order (parts omitted when they don't apply):

1. **Verdict first (BLUF).** Answer/recommendation in line 1. Never buried under setup or "it depends." If it genuinely depends, line 1 names the default pick + the one variable that flips it.
2. **Support, only if it earns its place.** No restating the question, no narrating intent.
3. **Make it verifiable.** State confidence, mark assumed vs established, show the diff/decision — not prose about it.
4. **One decision, surfaced clean.** A recommendation, not a balanced option-dump to weigh.

## Levels

| level | what it applies |
|---|---|
| `lite` | Verdict first + kill filler/preamble. Nothing else. |
| `full` | lite + verifiability (confidence, assumed-vs-established, show-the-thing) + one-decision-with-a-recommendation + scan structure. **Default.** |
| `ultra` | full + aggressive minimalism: telegraphic, only load-bearing tokens, recommendation-only. |

## Install

```bash
./install.sh
```

Copies the hooks + skill into `~/.claude/`, then wires two hooks into `~/.claude/settings.json` (backup made first). Idempotent — safe to re-run. Takes effect next Claude Code session.

Default level via `VIBEFULLNESS_DEFAULT_MODE` env → `~/.config/vibefullness/config.json` (`{"defaultMode":"full"}`) → `full`.

## Usage

```
/vibefullness lite     # gentlest — BLUF + no filler
/vibefullness full     # full discipline (default)
/vibefullness ultra    # telegraphic
/vibefullness off      # disable for the session
```

`/vibe` is a short alias for `/vibefullness` (e.g. `/vibe ultra`). Natural language works too: "stop vibefullness", "normal mode".

## How it works

Mirrors the caveman-mode architecture:

| file | role |
|---|---|
| `skills/vibefullness/SKILL.md` | single source of truth — the ruleset |
| `hooks/vibefullness-config.js` | mode resolution + symlink-safe, size-capped flag I/O |
| `hooks/vibefullness-activate.js` | SessionStart — writes flag, emits ruleset filtered to active level |
| `hooks/vibefullness-tracker.js` | UserPromptSubmit — parses toggles, emits compact per-turn reminder |

The flag file (`~/.claude/.vibefullness-active`) holds the active level. Reads are whitelist-validated and refuse symlinks, so a swapped flag can never inject untrusted bytes into terminal output or model context.

Edit `SKILL.md` to change behavior — `vibefullness-activate.js` reads it at runtime, no duplication to drift.

## Composition with caveman

Distinct jobs, run together. **caveman** = word choice (drop articles/filler/pleasantries). **vibefullness** = information structure + verifiability. Both on: vibefullness sets the shape, caveman trims the words inside it.

## Why "vibefullness"

Vibe coding intensely for months can quietly burn out the operator — loss of focus, loss of creative drive. The research on it (cognitive offloading, verification fatigue, the perception-vs-reality gap) is thin but directionally clear. This is one small, concrete countermeasure: spend less of the operator's finite attention on every exchange. Mindful vibe coding. Vibefullness.

## License

MIT — see [LICENSE](LICENSE).
