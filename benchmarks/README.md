# Behavior benchmark

Does the vibefullness ruleset actually **produce** its refined behaviors, or just
carry the text? This is a behavior gate, not a code-size benchmark: it checks
whether real model output obeys the SKILL.md contract.

Two arms (no skill, vibefullness), three probes, graded by a JS checker:

| probe | SKILL.md clause | passes when… |
|---|---|---|
| `bluf` | Verdict first (BLUF) | the verdict is in line 1, not buried under "it depends" / an option-menu |
| `verify` | Route the scrutiny | a confidence tag is paired with a concrete what-to-verify pointer |
| `caveat` | Verifiability over brevity | the irreversible/data-loss caveat survives a terse, brevity-pressured ask |

`baseline` is the **control**: the no-skill arm should mostly FAIL these gates,
the vibefullness arm should pass them. That delta is the point — it turns the
Evidence section's "research says" into "measured here."

## Reproduce

Requires an Anthropic API key and **Node.js ≥ 22.22.0** (promptfoo's engine
constraint — check `node --version`, upgrade if below).

```bash
cp ../.env.example ../.env          # add your ANTHROPIC_API_KEY
cd benchmarks
npx promptfoo@latest eval -c behavior.yaml --env-file ../.env --repeat 10
npx promptfoo@latest view
```

`--env-file ../.env` is required because promptfoo reads `.env` from the current
directory (`benchmarks/`), not the repo root where the file lives.

## Trust the grader first

The grader (`behavior.js`) is proven offline by `hooks/vibefullness-behavior.test.js`
— it feeds known behavior-present and behavior-absent strings through each probe
and asserts the verdict, with **no API key and no promptfoo**. Run it before
spending on a live eval:

```bash
node --test hooks/vibefullness-behavior.test.js
```

## Files

| File | Role |
|---|---|
| `behavior.yaml` | promptfoo config: providers, the two arms, the three probes |
| `arms/baseline.js` | control arm — task only, no skill |
| `arms/vibefullness.js` | treatment arm — full `skills/vibefullness/SKILL.md` as system prompt |
| `behavior.js` | the grader (metric `behavior`: 1 = behavior present, 0 = absent) |

## Notes

- Single-shot generations at default temperature. In a real session the rules
  re-inject every turn, so per-session behavior can differ — treat these as
  generation-time signal, not a session promise.
- Heuristic graders catch the **presence** of the behavior, not its full quality.
  A response can pass `bluf` and still bury a caveat later; the probes are gates,
  not a grade. Tighten the regexes in `behavior.js` (and their offline test) when
  a probe lets through an output it shouldn't.
- `--repeat 10` and report the pass-rate per arm; one run is noisy at temperature 1.
