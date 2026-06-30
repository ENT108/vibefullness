// Tests for vibefullness-audit.auditResponse (the pure heuristic fn).
// Built-in node:test, zero deps. Run: node --test hooks/

const { test } = require('node:test');
const assert = require('node:assert');
const { auditResponse } = require('./vibefullness-audit');

// Filler to push prose past the 600-char confidence threshold (and past the
// 200-char exemption floor). Repeated benign prose with no confidence token.
const LONG = 'This explanation walks through the tradeoffs in detail. '.repeat(15);

test('preamble opener fires', () => {
  const { callouts } = auditResponse('Sure! Let me help you with that. ' + LONG, 'on');
  assert.ok(callouts.some(c => /lead with the verdict/.test(c)), 'expected preamble callout');
});

test('clean BLUF does not fire (long, with confidence)', () => {
  const text = 'Postgres. High confidence. ' + LONG;
  const { callouts } = auditResponse(text, 'on');
  assert.deepStrictEqual(callouts, []);
});

test('heading first line does not trip preamble', () => {
  const { callouts } = auditResponse('# Verdict\nsure thing, here is the answer', 'on');
  assert.ok(!callouts.some(c => /lead with the verdict/.test(c)), 'heading must not be preamble');
});

test('long answer no confidence fires at on', () => {
  const text = 'Postgres is the pick here. ' + LONG;
  const { callouts } = auditResponse(text, 'on');
  assert.ok(callouts.some(c => /no confidence tag/.test(c)), 'expected confidence callout');
});

test('same long answer does NOT fire confidence at off', () => {
  const text = 'Postgres is the pick here. ' + LONG;
  const { callouts } = auditResponse(text, 'off');
  assert.ok(!callouts.some(c => /no confidence tag/.test(c)), 'off must skip confidence check');
});

test('short/code-dominated prose is exempt even with preamble-looking text in a fence', () => {
  const text = 'Sure, here:\n```js\nlet x = 1;\nconsole.log("certainly a lot of code here padding it out");\n```';
  const { callouts } = auditResponse(text, 'on');
  assert.deepStrictEqual(callouts, [], 'prose sans code < 200 chars must be exempt');
});

test('list / code-fence / blockquote first line is not flagged as preamble', () => {
  for (const first of ['- sure thing', '* certainly', '1. let me explain', '```', '> let me quote', '| col |']) {
    const text = first + '\n' + LONG;
    const { callouts } = auditResponse(text, 'on');
    assert.ok(!callouts.some(c => /lead with the verdict/.test(c)), `"${first}" must not be preamble`);
  }
});
