#!/usr/bin/env node
// vibefullness — UserPromptSubmit hook.
//   1. Parses /vibefullness commands + natural-language toggles, updates the flag.
//   2. Emits a compact per-turn reminder when vibefullness is active (keeps the
//      discipline in the model's attention as other plugins inject competing
//      style instructions). Reminder is intentionally <=3 lines — injecting a
//      wall to enforce minimalism would be self-defeating.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag, readFlag } = require('./vibefullness-config');
const { auditResponse, lastAssistantProse } = require('./vibefullness-audit');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.vibefullness-active');

// Per-level reminder essence. Kept terse on purpose.
const REMINDERS = {
  lite: 'VIBEFULLNESS MODE (lite). Verdict in line 1 (BLUF). Kill preamble/filler.',
  full: 'VIBEFULLNESS MODE (full). Verdict line 1 (BLUF). Strip what a senior already knows — redundancy harms experts. ' +
        'Confidence on major claims + a concrete what-to-verify pointer. One recommendation, not an option-menu. ' +
        'Bold only critical; density not brevity — never drop load-bearing caveats. Code/security: clarity over brevity.',
  ultra: 'VIBEFULLNESS MODE (ultra). Verdict line 1. Telegraphic — only load-bearing tokens. Recommendation-only. ' +
         'Strip what a senior knows; keep caveats + what-to-verify (density, not word-count). Code/security: clarity over brevity.'
};

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Natural-language activation
    if (/\b(activate|enable|turn on|start)\b.*\bvibefullness\b/i.test(prompt) ||
        /\bvibefullness\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt)) {
      if (!/\b(stop|disable|turn off|deactivate)\b/i.test(prompt)) {
        const m = getDefaultMode();
        if (m !== 'off') safeWriteFlag(flagPath, m);
      }
    }

    // /vibefullness [lite|full|ultra|off]  (/vibe is a short alias)
    const cmd = prompt.split(/\s+/)[0];
    if (cmd === '/vibefullness' || cmd === '/vibe') {
      const arg = prompt.split(/\s+/)[1] || '';
      let mode = null;
      if (arg === 'lite' || arg === 'full' || arg === 'ultra') mode = arg;
      else if (arg === 'off') mode = 'off';
      else mode = getDefaultMode();

      if (mode && mode !== 'off') safeWriteFlag(flagPath, mode);
      else if (mode === 'off') { try { fs.unlinkSync(flagPath); } catch (e) {} }
    }

    // Deactivation — natural language
    if (/\b(stop|disable|deactivate|turn off)\b.*\bvibefullness\b/i.test(prompt) ||
        /\bvibefullness\b.*\b(stop|disable|deactivate|turn off)\b/i.test(prompt) ||
        /\bnormal mode\b/i.test(prompt)) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }

    // Per-turn reinforcement. readFlag is symlink-safe, size-capped, whitelisted —
    // returns null on any anomaly, so nothing untrusted is injected.
    const active = readFlag(flagPath);
    if (active && REMINDERS[active]) {
      // Closed loop: audit the PREVIOUS assistant prose for drift and, when
      // detected, prepend a sharp one-line callout. Degrades silently to the
      // plain reminder on any error — never blocks the turn, never injects
      // transcript text (only the fixed callout strings reach the model).
      let additionalContext = REMINDERS[active];
      try {
        const prose = lastAssistantProse(data.transcript_path);
        if (prose !== null) {
          const { callouts } = auditResponse(prose, active);
          if (callouts.length) {
            additionalContext = '⚠ vibefullness drift — ' + callouts.join('; ') + '\n' + REMINDERS[active];
          }
        }
      } catch (e) {
        // audit is best-effort — fall back to the plain reminder
      }

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext
        }
      }));
    }
  } catch (e) {
    // silent fail
  }
});
