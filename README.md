# vibefullness

**Always-on output discipline for Claude Code that makes every response cheap to read and cheap to verify.** Install: `./install.sh`, restart, done. Toggle `/vibe on|off`.

Cuts verification/review fatigue — the load of reading dense AI output and judging whether to trust it, turn after turn, that accumulates across long sessions. Not brevity (that's word-choice); **information economy** — what goes where, what to omit, how to make a claim verifiable at a glance.

## The contract (every response, in this order)

1. **Verdict first (BLUF).** Answer in line 1 — never buried under setup or "it depends." If it depends, line 1 gives the default + the one variable that flips it.
2. **Support only if it earns its place.** No restating the question, no narrating intent. Explanation goes to the *few* non-obvious points, not what a senior already knows (redundancy harms experts).
3. **Route the scrutiny.** Confidence on major claims + a concrete *what-to-verify* pointer — counters automation bias. Show the diff/decision, not prose about it.
4. **One decision, clean.** A recommendation (+1–2 characterized alternatives), never an option-menu to weigh.

## Modes

| mode | applies |
|---|---|
| `on` | Maximum cognitive saving: verdict first, routed verifiability, recommendation-only, expertise-stripping, telegraphic density. Hard guard: never drops a load-bearing caveat to be short. **Default.** |
| `off` | Discipline disabled. |

Legacy `lite`/`full`/`ultra` are still accepted and map to `on`.

## Install

```bash
claude plugin marketplace add ENT108/vibefullness
claude plugin install vibefullness@vibefullness
```

Takes effect next session (or `/reload-plugins` now). **Update across machines:**

```bash
claude plugin marketplace update vibefullness && claude plugin update vibefullness
```

No `version` in `plugin.json` → every push is a new version (auto-update on pull). Default mode: `VIBEFULLNESS_DEFAULT_MODE` env → `~/.config/vibefullness/config.json` → `on`.

> **Legacy manual install:** `./install.sh` copies files into `~/.claude` and hand-wires `settings.json`. Use only without the plugin system — running it **alongside** the installed plugin double-fires the hooks. Pick one.

## Usage

```
/vibefullness on|off      # /vibe is an alias: /vibe on
```

Natural language also works: "stop vibefullness", "normal mode".

## How it works

Mirrors caveman-mode architecture.

| file | role |
|---|---|
| `skills/vibefullness/SKILL.md` | single source of truth — the ruleset (edit this to change behavior) |
| `hooks/vibefullness-config.js` | mode resolution + symlink-safe, size-capped flag I/O |
| `hooks/vibefullness-activate.js` | SessionStart — writes flag, emits ruleset when mode is `on` |
| `hooks/vibefullness-tracker.js` | UserPromptSubmit — parses toggles, emits ≤3-line per-turn reminder |

Flag file `~/.claude/.vibefullness-active` holds the mode. Reads are whitelist-validated and refuse symlinks — a swapped flag can't inject bytes into terminal output or model context.

**Composition with caveman:** distinct jobs, run together. caveman = word choice; vibefullness = information structure + verifiability. Both on → vibefullness sets the shape, caveman trims the words inside it.

## Statusline badge (optional)

Claude Code has no plugin statusline API — the statusline is a single user-owned command — so the badge must live in **your** statusline script. It only reads `~/.claude/.vibefullness-active` (stable path), so it needs no plugin files.

Copy `statusline-segment.sh` to a stable path and call it from your aggregator:
```sh
cp statusline-segment.sh ~/.claude/vibefullness-statusline.sh
```
```sh
# inside your statusLine command script:
vibe_text=$(sh "$HOME/.claude/vibefullness-statusline.sh")
printf '%s ... %s' "$your_existing_line" "$vibe_text"
```
Renders `[VIBE]` when on; nothing when off. Or inline the ~10-line block from `statusline-segment.sh` directly.

## Evidence

Rules are grounded, not invented (confidence: rules well-supported; magnitudes vary):

- **Cognitive Load Theory + signaling** — Sweller; Cambridge Handbook.
- **Expertise-reversal** — explanation that helps novices measurably *degrades* experts (Kalyuga et al.). This is why scaffolding is stripped.
- **Split-attention → code adjacency** — Tarmizi-Sweller.
- **BLUF / inverted-pyramid / serial-position / F-pattern** — Nielsen Norman + comms practice (applied evidence, thin lab RCTs — verify before citing as proof).
- **Choice overload** under complex/high-stakes conditions — Iyengar-Lepper.
- **Trust calibration / automation bias** — conditional on consistent, calibrated confidence display.
- **Not used:** ego-depletion (failed replication). Long sessions are taxing without a willpower-tank model.

## Why the name

Mindful vibe coding. Vibe coding hard for months quietly drains focus and creative drive; spending less of the operator's finite attention per exchange is one concrete countermeasure.

## License

MIT — see [LICENSE](LICENSE).
