#!/bin/sh
# vibefullness — statusline badge segment.
# Prints a colored [VIBE] / [VIBE:LEVEL] badge by reading the active-level flag.
# Emits nothing when off (flag absent) or the flag is unreadable/untrusted.
#
# Claude Code has no plugin statusline API — the statusline is a single
# user-owned command. Wire this into your aggregator (see README), e.g.:
#   vibe_text=$(sh "$HOME/.claude/vibefullness-statusline.sh")
#   printf '%s ... %s' "...your line..." "$vibe_text"
#
# Reads ~/.claude/.vibefullness-active (stable path, independent of plugin dir).

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.vibefullness-active"

# Refuse symlinks — a swapped flag could render attacker bytes (incl. ANSI
# escapes) to the terminal on every keystroke.
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0

# Cap at 64 bytes, lowercase, strip to [a-z] — blocks escape/OSC injection.
MODE=$(head -c 64 "$FLAG" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z')

# Single active mode 'on' (and legacy lite/full/ultra) all render [VIBE].
case "$MODE" in
  on|full|lite|ultra|"") printf '\033[38;5;111m[VIBE]\033[0m' ;;
  *) exit 0 ;;
esac
