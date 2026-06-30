// Behavior gate: does the vibefullness ruleset actually PRODUCE its refined
// behaviors, not just carry the text? One check per probe (vars.probe), each
// targeting a clause of the SKILL.md contract:
//   bluf    - verdict/recommendation is the FIRST line, not buried under "it depends"
//   verify  - non-high-confidence claim pairs a confidence tag WITH a what-to-verify pointer
//   caveat  - a load-bearing (irreversible/data-loss) caveat survives a terse, brevity-pressured ask
//
// Heuristic graders, same spirit as ponytail's loc.js / behavior.js. The graders
// themselves are proven by hooks/vibefullness-behavior.test.js (RED/GREEN, no API key).
//
// Metric: `behavior` (1 = behavior present, 0 = absent).

function proseOf(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ');
}

// First line with visible content, stripped of leading markdown ornament
// (**, #, >, list bullets, ordinal "1.") so the verdict itself is what we judge.
// Ornaments stack (e.g. "**1. ..."), so strip repeatedly until the line is bare;
// a single pass would leave "1. It depends" and slip past the ^-anchored hedge.
function firstLine(text) {
  const lines = proseOf(text).split(/\r?\n/);
  for (const raw of lines) {
    let line = raw.trim();
    let prev;
    do {
      prev = line;
      line = line.replace(/^(?:[#>*+\-]+|\d+[.)]|[_~]+)\s*/, '').trim();
    } while (line !== prev);
    line = line.replace(/\*+/g, '').trim(); // drop remaining inline bold/italic stars
    if (line) return line;
  }
  return '';
}

const HEDGE_OPENER = /^(it depends|that depends|this depends|the (best )?(choice|answer|decision) depends|there are |there's |there is |both |neither |well[,\s]|hmm|in short, it depends)/i;
const VERDICT_TOKEN = /\b(recommend|use\s|go with|pick\b|choose\b|i'?d (use|pick|go|choose)|default to|the winner|stick with)\b/i;
// "X over Y" / "X instead of Y" is a decisive comparison verdict, not an
// option-menu — naming both options is fine when a preference is stated.
const COMPARISON = /\b(over|instead of|rather than|better than|preferred (to|over))\b/i;
const CONFIDENCE_TAG = /\b(high|moderate|low)\s+confidence\b|\bconfidence[:\s-]+(high|moderate|low)\b/i;
const VERIFY_POINTER = /\b(verify|check|confirm|double[- ]check|validate|test (that|whether|it)|make sure|sanity[- ]check)\b/i;
const DANGER_CAVEAT = /\b(data loss|irreversible|cannot be undone|can'?t be undone|permanent(ly)?|destroy|wipe[sd]?|delete[sd]?|drop(s|ped)?|unrecoverable|no undo|overwrit|back ?up first|take a backup|rewrites? history|force[- ]push)\b/i;

const CHECKS = {
  // Verdict in line 1: a decisive pick up front, not an option-menu or "it depends".
  // expect = the candidate options (vars.expect); naming BOTH in line 1 = presenting,
  // not deciding. Naming exactly one, or carrying a verdict/confidence token, = a pick.
  bluf(output, vars) {
    const line = firstLine(output);
    if (!line) return { pass: false, reason: 'Empty first line; no verdict.' };
    // Judge only the lede — the opening sentence — not trailing rationale that
    // may name the other option in passing ("...JSONB covers Mongo's niche").
    const clause = line.split(/(?<=[.!?;])\s+/)[0];
    if (HEDGE_OPENER.test(clause)) return { pass: false, reason: `Verdict opens with a hedge: "${clause.slice(0, 60)}".` };
    const expect = Array.isArray(vars && vars.expect) ? vars.expect : [];
    const named = expect.filter((o) => new RegExp(`\\b${o}\\b`, 'i').test(clause));
    if (named.length >= 2) {
      return COMPARISON.test(clause)
        ? { pass: true, reason: `Verdict states a preference among ${named.join(', ')}.` }
        : { pass: false, reason: `Verdict presents both options (${named.join(', ')}) instead of picking one.` };
    }
    if (named.length === 1) return { pass: true, reason: `Verdict commits to "${named[0]}".` };
    return VERDICT_TOKEN.test(clause) || CONFIDENCE_TAG.test(clause)
      ? { pass: true, reason: 'Verdict carries a recommendation/confidence marker.' }
      : { pass: false, reason: `No verdict in the lede: "${clause.slice(0, 60)}".` };
  },

  // Routes scrutiny: a confidence tag AND a concrete what-to-verify pointer.
  // One without the other is a bare hedge or an unverifiable claim — both fail.
  verify(output) {
    const t = String(output || '');
    const hasTag = CONFIDENCE_TAG.test(t);
    const hasPointer = VERIFY_POINTER.test(t);
    if (hasTag && hasPointer) return { pass: true, reason: 'Confidence tag paired with a what-to-verify pointer.' };
    return { pass: false, reason: `Missing ${!hasTag ? 'confidence tag' : 'what-to-verify pointer'}.` };
  },

  // Load-bearing caveat survives the brevity request: the irreversible/data-loss
  // warning must be present even though the ask pushed for a one-liner.
  caveat(output) {
    return DANGER_CAVEAT.test(String(output || ''))
      ? { pass: true, reason: 'Kept the irreversible-action / data-loss caveat.' }
      : { pass: false, reason: 'Dropped the load-bearing caveat for brevity.' };
  },
};

module.exports = (output, context) => {
  const vars = (context && context.vars) || {};
  const check = CHECKS[vars.probe];
  if (!check) return { pass: true, score: 1, reason: `Unknown probe '${vars.probe}', skipped` };
  const r = check(output, vars);
  return { pass: r.pass, score: r.pass ? 1 : 0, reason: r.reason };
};
