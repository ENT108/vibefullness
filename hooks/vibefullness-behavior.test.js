// Unit test for the behavior gate (benchmarks/behavior.js). Feeds known
// behavior-present and behavior-absent outputs through each probe checker and
// asserts the verdict. Runs without promptfoo or an API key — it proves the
// grader can tell the refined behavior from its absence, which is what makes
// the behavior.yaml eval trustworthy.
// Run: node --test hooks/vibefullness-behavior.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const behavior = require('../benchmarks/behavior');

function check(probe, output, extra = {}) {
  return behavior(output, { vars: { probe, ...extra } });
}

const PG_EXPECT = { expect: ['postgres', 'mongo', 'mongodb'] };

// --- bluf: verdict in line 1 ---

test('bluf: decisive pick in line 1 passes', () => {
  const r = check('bluf', '**Postgres. High confidence.** SQL owns aggregations; JSONB covers Mongo\'s niche.', PG_EXPECT);
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
});

test('bluf: "it depends" opener fails', () => {
  const r = check('bluf', 'It depends on your access patterns and team familiarity.\n\nPostgres is great for...', PG_EXPECT);
  assert.equal(r.pass, false);
  assert.equal(r.score, 0);
});

test('bluf: naming both options in line 1 fails (presenting, not deciding)', () => {
  const r = check('bluf', 'Both Postgres and Mongo can work here, so let\'s weigh them.', PG_EXPECT);
  assert.equal(r.pass, false);
});

test('bluf: verdict token without a named option passes', () => {
  const r = check('bluf', 'I\'d go with the relational option. Moderate confidence.', PG_EXPECT);
  assert.equal(r.pass, true);
});

test('bluf: markdown ornament on line 1 is stripped before judging', () => {
  const r = check('bluf', '## Postgres — the right call here\nReasons follow.', PG_EXPECT);
  assert.equal(r.pass, true);
});

test('bluf: nested ornaments + list number fully stripped (verdict still found)', () => {
  const r = check('bluf', '**1. Postgres. High confidence.** SQL owns aggregations; JSONB covers Mongo\'s niche.', PG_EXPECT);
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
});

test('bluf: hedge behind a leading list number still fails', () => {
  const r = check('bluf', '**1. It depends on Postgres or Mongo**', PG_EXPECT);
  assert.equal(r.pass, false);
  assert.equal(r.score, 0);
});

test('bluf: explicit "X over Y" preference passes despite naming both', () => {
  const r = check('bluf', 'I recommend Postgres over Mongo for this backend.', PG_EXPECT);
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
});

// --- verify: confidence tag AND what-to-verify pointer ---

test('verify: tag + pointer passes', () => {
  const r = check('verify', 'No — cold-key stampede is unhandled; concurrent misses all hit the DB. Moderate confidence. Verify by hammering one cold key with 50 parallel gets and watching DB query count.');
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
});

test('verify: confidence tag with no pointer fails', () => {
  const r = check('verify', 'This has a stampede problem. Low confidence in the exact blast radius.');
  assert.equal(r.pass, false);
});

test('verify: pointer with no confidence tag fails', () => {
  const r = check('verify', 'There may be a stampede issue here — check the DB query count under load.');
  assert.equal(r.pass, false);
});

// --- caveat: load-bearing caveat survives the brevity request ---

test('caveat: keeps the data-loss warning passes', () => {
  const r = check('caveat', '`dropdb dev && createdb dev` — this destroys all local data, irreversible.');
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
});

test('caveat: bare command, no warning fails', () => {
  const r = check('caveat', '`dropdb dev && createdb dev`');
  assert.equal(r.pass, false);
  assert.equal(r.score, 0);
});

// --- unknown probe is skipped, not failed ---

test('unknown probe is skipped', () => {
  const r = check('something-else', 'whatever');
  assert.equal(r.pass, true);
  assert.match(r.reason, /skipped/i);
});
