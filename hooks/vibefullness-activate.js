#!/usr/bin/env node
// vibefullness — Claude Code SessionStart activation hook.
//
// On every session start:
//   1. Writes flag file at $CLAUDE_CONFIG_DIR/.vibefullness-active (statusline/tracker read it)
//   2. Emits the vibefullness ruleset (from SKILL.md, filtered to the active level) as
//      hidden SessionStart context.
//
// SKILL.md is the single source of truth — edits to it propagate automatically,
// no hardcoded duplication to drift.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag } = require('./vibefullness-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.vibefullness-active');
// Resolve SKILL.md relative to this script so it works both as a plugin
// (${CLAUDE_PLUGIN_ROOT}/hooks + /skills) and a manual install (~/.claude/hooks + /skills).
const skillPath = path.join(__dirname, '..', 'skills', 'vibefullness', 'SKILL.md');

const mode = getDefaultMode();

// Detect provider from SessionStart stdin
let provider = '';
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  provider = input.provider || '';
} catch (e) { /* best effort */ }

// Skip if Ollama or explicitly off
if (provider === 'ollama' || mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

safeWriteFlag(flagPath, mode);

let skillContent = '';
try {
  skillContent = fs.readFileSync(skillPath, 'utf8');
} catch (e) { /* fall back below */ }

let output;
if (skillContent) {
  // Strip YAML frontmatter
  const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');

  // Keep everything EXCEPT other levels' rows/examples:
  //  - intensity table rows start with "| **level** |" — keep only active level
  //  - example lines start with "- level:" — keep only active level
  const filtered = body.split('\n').reduce((acc, line) => {
    const tableRow = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
    if (tableRow) {
      if (tableRow[1] === mode) acc.push(line);
      return acc;
    }
    const example = line.match(/^- (\S+?):\s/);
    if (example) {
      if (example[1] === mode) acc.push(line);
      return acc;
    }
    acc.push(line);
    return acc;
  }, []);

  output = 'VIBEFULLNESS MODE ACTIVE — level: ' + mode + '\n\n' + filtered.join('\n');
} else {
  // Minimal fallback if SKILL.md is missing.
  output =
    'VIBEFULLNESS MODE ACTIVE — level: ' + mode + '\n\n' +
    'Shape output for least reader cognitive load. Verdict/recommendation in line 1 (BLUF). ' +
    'Support only if it earns its place — no restating the question, no narrating intent. ' +
    'Make claims verifiable: state confidence, mark assumed vs established, show the diff/decision not prose about it. ' +
    'When the user must choose, give a recommendation — not an option-dump. ' +
    'Bold lead-ins, short chunks, no over-formatting.\n\n' +
    'Persist every response. Code/commits/security: write normally (clarity over brevity). ' +
    'Switch: /vibefullness on|off.';
}

process.stdout.write(output);
