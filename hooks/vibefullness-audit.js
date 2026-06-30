#!/usr/bin/env node
// vibefullness — closed-loop drift audit.
//   auditResponse(): PURE high-precision heuristics over the previous assistant
//     prose. ONLY two checks, intentionally — false positives erode trust in
//     the callout, so precision beats recall here.
//   lastAssistantProse(): bounded, defensive transcript tail reader. Never
//     throws; returns null on any anomaly. Only fixed callout strings ever
//     reach the model — never transcript text.

const fs = require('fs');

// Strip fenced code spans so length/heuristics measure PROSE, not code.
function stripFences(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

// Tight, anchored opener regex. High precision: only canonical assistant
// preamble, not arbitrary sentences that happen to start with these words.
const PREAMBLE_RE = /^(sure|certainly|of course|great question|happy to|i'd be happy|let me\b|let's\b|to begin|to start|absolutely|i'll help|i will help|i can help|i'd recommend starting)/i;

// Any confidence signal — a single match suppresses the "no confidence" callout.
const CONFIDENCE_RE = /\b(high|moderate|low)\s+confidence\b|\bconfidence\b\s*[:\-]|\b(highly|fairly|reasonably)?\s*confident\b/i;

// First non-empty line is structural (heading/list/fence/quote/table) → not preamble.
const STRUCTURAL_RE = /^(#|-\s|\*\s|\d+\.\s|```|>|\|)/;

function firstNonEmptyLine(text) {
  for (const line of text.split('\n')) {
    if (line.trim()) return line.trim();
  }
  return '';
}

// PURE. Returns { callouts: string[] }, capped at 2.
function auditResponse(proseText, level) {
  const callouts = [];
  const text = typeof proseText === 'string' ? proseText : '';

  // Exemption: short/code-dominated turns (prose sans code < 200 chars).
  const sansCode = stripFences(text);
  if (sansCode.trim().length < 200) return { callouts };

  // 1. Preamble opener — all levels. Skip if first line is structural.
  const first = firstNonEmptyLine(text);
  if (first && !STRUCTURAL_RE.test(first) && PREAMBLE_RE.test(first)) {
    callouts.push('lead with the verdict, not preamble');
  }

  // 2. Missing confidence on a long answer — active ('on') only.
  if (level === 'on' &&
      sansCode.length > 600 && !CONFIDENCE_RE.test(sansCode)) {
    callouts.push('long reply, no confidence tag — tag major claims + a what-to-verify pointer');
  }

  return { callouts: callouts.slice(0, 2) };
}

// Read only the tail; transcripts can be many MB.
const TAIL_BYTES = 256 * 1024;

// Bounded, defensive. Returns the most recent assistant text, '' if found but
// empty, or null on anything anomalous. Never throws.
function lastAssistantProse(transcriptPath) {
  try {
    if (!transcriptPath) return null;

    let st;
    try {
      st = fs.lstatSync(transcriptPath);
    } catch (e) {
      return null;
    }
    if (st.isSymbolicLink() || !st.isFile()) return null;

    const start = Math.max(0, st.size - TAIL_BYTES);
    const len = st.size - start;
    let buf;
    let fd;
    try {
      fd = fs.openSync(transcriptPath, fs.constants.O_RDONLY);
      buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, start);
      buf = buf.slice(0, n);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    // JSONL — walk from the end. Tail may start mid-line, so parse failures are
    // expected and skipped.
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (e) {
        continue;
      }
      const msg = entry && (entry.type === 'assistant') && entry.message;
      if (!msg || msg.role !== 'assistant') continue;

      const content = msg.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const text = content
          .filter(b => b && b.type === 'text' && typeof b.text === 'string')
          .map(b => b.text)
          .join('\n');
        return text;
      }
      // Assistant entry without usable content — keep looking backward.
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { auditResponse, lastAssistantProse };
