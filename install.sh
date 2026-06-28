#!/usr/bin/env bash
# vibefullness — install vibefullness mode into ~/.claude
#
# Copies hooks + skill, then wires SessionStart + UserPromptSubmit hooks into
# settings.json (backup made first). Idempotent — safe to re-run.
set -euo pipefail

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing vibefullness mode into $CLAUDE_DIR"

mkdir -p "$CLAUDE_DIR/hooks" "$CLAUDE_DIR/skills/vibefullness"
cp "$SRC/hooks/vibefullness-config.js"   "$CLAUDE_DIR/hooks/"
cp "$SRC/hooks/vibefullness-activate.js" "$CLAUDE_DIR/hooks/"
cp "$SRC/hooks/vibefullness-tracker.js"  "$CLAUDE_DIR/hooks/"
cp "$SRC/skills/vibefullness/SKILL.md"   "$CLAUDE_DIR/skills/vibefullness/SKILL.md"
echo "  files copied"

SETTINGS="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi
cp "$SETTINGS" "$SETTINGS.bak.$(date +%s)"

python3 - "$SETTINGS" "$CLAUDE_DIR" <<'PY'
import json, sys, os
settings, claude_dir = sys.argv[1], sys.argv[2]
d = json.load(open(settings))
h = d.setdefault("hooks", {})

act = 'node "%s"' % os.path.join(claude_dir, "hooks", "vibefullness-activate.js")
trk = 'node "%s"' % os.path.join(claude_dir, "hooks", "vibefullness-tracker.js")

ss = h.setdefault("SessionStart", [])
if not any(act in json.dumps(g) for g in ss):
    ss.append({"matcher": "*", "hooks": [
        {"type": "command", "command": act, "timeout": 10,
         "statusMessage": "Loading vibefullness mode..."}]})
    print("  SessionStart: added")
else:
    print("  SessionStart: already present")

ups = h.setdefault("UserPromptSubmit", [])
if not any(trk in json.dumps(g) for g in ups):
    if not ups:
        ups.append({"hooks": []})
    ups[0].setdefault("hooks", []).append(
        {"type": "command", "command": trk, "timeout": 5,
         "statusMessage": "Tracking vibefullness mode..."})
    print("  UserPromptSubmit: added")
else:
    print("  UserPromptSubmit: already present")

json.dump(d, open(settings, "w"), indent=2)
PY

python3 -c "import json; json.load(open('$SETTINGS')); print('  settings.json valid')"
echo "Done. Takes effect next Claude Code session. Toggle: /vibefullness lite|full|ultra|off"
