// Tests for vibefullness-audit.lastAssistantProse (the defensive transcript reader)
// plus edge cases for auditResponse. Built-in node:test, zero deps.
// Run: node --test hooks/vibefullness-prose.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lastAssistantProse, auditResponse } = require('./vibefullness-audit');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-'));
}

function writeJsonl(dir, name, entries) {
  const p = path.join(dir, name);
  const lines = entries.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(p, lines, 'utf8');
  return p;
}

function assistantEntry(content) {
  return { type: 'assistant', message: { role: 'assistant', content } };
}

function userEntry(text) {
  return { type: 'human', message: { role: 'user', content: text } };
}

// Cleanup helper — used in finally blocks so failures still clean up.
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// lastAssistantProse — null / missing / bad path
// ---------------------------------------------------------------------------

test('lastAssistantProse: null path -> null', () => {
  assert.strictEqual(lastAssistantProse(null), null);
});

test('lastAssistantProse: undefined path -> null', () => {
  assert.strictEqual(lastAssistantProse(undefined), null);
});

test('lastAssistantProse: empty string -> null', () => {
  assert.strictEqual(lastAssistantProse(''), null);
});

test('lastAssistantProse: missing file -> null', () => {
  const dir = makeTmpDir();
  try {
    const p = path.join(dir, 'nonexistent.jsonl');
    assert.strictEqual(lastAssistantProse(p), null);
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: directory at the path -> null', () => {
  const dir = makeTmpDir();
  try {
    // The temp dir itself is a directory, not a file.
    assert.strictEqual(lastAssistantProse(dir), null);
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// Symlink — refused
// ---------------------------------------------------------------------------

test('lastAssistantProse: symlink at path -> null', () => {
  const dir = makeTmpDir();
  try {
    const target = writeJsonl(dir, 'real.jsonl', [assistantEntry('hello')]);
    const link = path.join(dir, 'link.jsonl');
    try {
      fs.symlinkSync(target, link);
    } catch (e) {
      if (e.code === 'EPERM') {
        // Symlink creation not supported (e.g. non-admin Windows). Skip gracefully.
        return;
      }
      throw e;
    }
    assert.strictEqual(lastAssistantProse(link), null,
      'symlink must be refused and return null');
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// lastAssistantProse — happy paths
// ---------------------------------------------------------------------------

test('lastAssistantProse: assistant entry with STRING content -> returns string', () => {
  const dir = makeTmpDir();
  try {
    const p = writeJsonl(dir, 't.jsonl', [assistantEntry('Hello world')]);
    assert.strictEqual(lastAssistantProse(p), 'Hello world');
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: assistant entry with ARRAY content (text blocks) -> joined by newline', () => {
  const dir = makeTmpDir();
  try {
    const content = [
      { type: 'text', text: 'First block' },
      { type: 'text', text: 'Second block' },
    ];
    const p = writeJsonl(dir, 't.jsonl', [assistantEntry(content)]);
    assert.strictEqual(lastAssistantProse(p), 'First block\nSecond block');
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: array content — non-text blocks (tool_use) are filtered out', () => {
  const dir = makeTmpDir();
  try {
    const content = [
      { type: 'tool_use', id: 'tu1', name: 'bash', input: {} },
      { type: 'text', text: 'Only this matters' },
      { type: 'tool_result', tool_use_id: 'tu1', content: 'done' },
    ];
    const p = writeJsonl(dir, 't.jsonl', [assistantEntry(content)]);
    assert.strictEqual(lastAssistantProse(p), 'Only this matters');
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: trailing user/non-assistant entries after assistant -> returns last assistant', () => {
  const dir = makeTmpDir();
  try {
    const p = writeJsonl(dir, 't.jsonl', [
      assistantEntry('assistant text'),
      userEntry('follow-up user question'),
      { type: 'system', message: { role: 'system', content: 'some system msg' } },
    ]);
    assert.strictEqual(lastAssistantProse(p), 'assistant text');
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: multiple assistant entries -> returns the LAST one', () => {
  const dir = makeTmpDir();
  try {
    const p = writeJsonl(dir, 't.jsonl', [
      assistantEntry('first assistant message'),
      userEntry('user turn'),
      assistantEntry('second assistant message'),
      userEntry('another user turn'),
      assistantEntry('third and final assistant message'),
    ]);
    assert.strictEqual(lastAssistantProse(p), 'third and final assistant message');
  } finally {
    rmrf(dir);
  }
});

test('lastAssistantProse: NO assistant entries (only user lines) -> null', () => {
  const dir = makeTmpDir();
  try {
    const p = writeJsonl(dir, 't.jsonl', [
      userEntry('user question 1'),
      userEntry('user question 2'),
    ]);
    assert.strictEqual(lastAssistantProse(p), null);
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// lastAssistantProse — corrupt / partial first line from tail read
// ---------------------------------------------------------------------------

test('lastAssistantProse: first line is corrupt JSON, valid assistant entry below -> returns text', () => {
  const dir = makeTmpDir();
  try {
    const p = path.join(dir, 't.jsonl');
    // Simulate a tail starting mid-line: the first "line" is partial/corrupt.
    const corrupt = '{"type":"assistant","mess\n';  // truncated, invalid JSON
    const good = JSON.stringify(assistantEntry('valid content')) + '\n';
    fs.writeFileSync(p, corrupt + good, 'utf8');
    assert.strictEqual(lastAssistantProse(p), 'valid content');
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// lastAssistantProse — tail-read behavior (TAIL_BYTES = 256 KB)
// ---------------------------------------------------------------------------

test('lastAssistantProse: large prefix junk before TAIL_BYTES, assistant in tail -> found', () => {
  const dir = makeTmpDir();
  try {
    const p = path.join(dir, 'large.jsonl');
    // Write ~300 KB of junk lines (not valid assistant JSONL), then an assistant entry
    // within the final 256 KB tail.
    const TAIL_BYTES = 256 * 1024;
    // Each junk line: ~100 bytes. We need enough to push total beyond TAIL_BYTES.
    // 3500 lines * ~100 bytes = ~350 KB total prefix, then the valid entry at the end.
    // But we want the assistant entry to be WITHIN the tail — so keep its distance
    // from EOF less than TAIL_BYTES.
    const junkLine = JSON.stringify({ type: 'junk', data: 'x'.repeat(80) }) + '\n';
    // Write ~310 KB of junk so the file is bigger than TAIL_BYTES.
    const junkRepeat = Math.ceil((TAIL_BYTES + 60 * 1024) / junkLine.length);
    const fd = fs.openSync(p, 'w');
    for (let i = 0; i < junkRepeat; i++) {
      fs.writeSync(fd, junkLine);
    }
    // The assistant entry goes last — well within the final 256 KB.
    const assistLine = JSON.stringify(assistantEntry('found in tail')) + '\n';
    fs.writeSync(fd, assistLine);
    fs.closeSync(fd);

    // Confirm the file is larger than TAIL_BYTES.
    const stat = fs.statSync(p);
    assert.ok(stat.size > TAIL_BYTES,
      `file should exceed ${TAIL_BYTES} bytes, got ${stat.size}`);

    assert.strictEqual(lastAssistantProse(p), 'found in tail');
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// auditResponse — non-string / null / undefined / number inputs
// ---------------------------------------------------------------------------

test('auditResponse: null input -> { callouts: [] }, no throw', () => {
  assert.doesNotThrow(() => {
    const result = auditResponse(null, 'on');
    assert.deepStrictEqual(result, { callouts: [] });
  });
});

test('auditResponse: number input -> { callouts: [] }, no throw', () => {
  assert.doesNotThrow(() => {
    const result = auditResponse(42, 'on');
    assert.deepStrictEqual(result, { callouts: [] });
  });
});

test('auditResponse: undefined input -> { callouts: [] }, no throw', () => {
  assert.doesNotThrow(() => {
    const result = auditResponse(undefined, 'on');
    assert.deepStrictEqual(result, { callouts: [] });
  });
});

// ---------------------------------------------------------------------------
// auditResponse — 'on' level fires no-confidence callout
// ---------------------------------------------------------------------------

test('auditResponse: on level, long prose (>600 chars), no confidence tag -> fires callout', () => {
  // 700+ chars of prose with no confidence language.
  const text = 'The architecture decision here is nuanced. ' +
    'We weigh database scalability, operational overhead, team expertise, and migration cost. ' +
    'Each factor influences the final recommendation in meaningful ways. '.repeat(8);
  const { callouts } = auditResponse(text, 'on');
  assert.ok(callouts.some(c => /no confidence tag/.test(c)),
    'on level should fire confidence callout on long no-confidence prose');
});

// ---------------------------------------------------------------------------
// auditResponse — callouts capped at 2 (preamble + missing-confidence together)
// ---------------------------------------------------------------------------

test('auditResponse: both preamble AND missing-confidence fire -> callouts.length <= 2', () => {
  // Start with preamble opener, then enough prose (>600 chars) with no confidence tag.
  const filler = 'This detailed walkthrough covers every tradeoff involved. '.repeat(12);
  const text = 'Sure! ' + filler;
  const { callouts } = auditResponse(text, 'on');
  // Both checks should fire.
  assert.ok(callouts.some(c => /lead with the verdict/.test(c)), 'preamble callout expected');
  assert.ok(callouts.some(c => /no confidence tag/.test(c)), 'confidence callout expected');
  assert.ok(callouts.length <= 2, `callouts must be capped at 2, got ${callouts.length}`);
});

// ---------------------------------------------------------------------------
// auditResponse — 'off' / unknown level skips confidence callout
// ---------------------------------------------------------------------------

test('auditResponse: "off" level, long no-confidence prose -> does NOT fire confidence callout', () => {
  const text = 'The database choice is PostgreSQL. ' +
    'It handles complex queries reliably and scales horizontally. '.repeat(12);
  const { callouts } = auditResponse(text, 'off');
  assert.ok(!callouts.some(c => /no confidence tag/.test(c)),
    '"off" level must not fire the confidence callout');
});

test('auditResponse: unknown level ("banana"), long no-confidence prose -> does NOT fire confidence callout', () => {
  const text = 'The database choice is PostgreSQL. ' +
    'It handles complex queries reliably and scales horizontally. '.repeat(12);
  const { callouts } = auditResponse(text, 'banana');
  assert.ok(!callouts.some(c => /no confidence tag/.test(c)),
    'unknown level must not fire the confidence callout');
});
