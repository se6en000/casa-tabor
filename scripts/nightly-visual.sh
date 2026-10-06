#!/usr/bin/env bash
# The full Wall + phone screen suite (~13 min), run every night on the Pi at 3:30 AM by cron (Jake, Oct 5: "make
# shipping much much faster"). A ship only runs the 14 key screens (@smoke); this catches the rest. The result is kept
# in ~/.casa-nightly/last.txt, and scripts/ship.sh shows it at the start of the next ship.
#   crontab: 30 3 * * * bash /home/jake/casa-tabor/scripts/nightly-visual.sh
set -u
cd "$(dirname "$0")/.." || exit 1
OUT="$HOME/.casa-nightly"
mkdir -p "$OUT"
LOG="$OUT/visual-$(date +%Y%m%d).log"
# Never alongside a ship or a test run already using the screenshot port.
if lsof -ti tcp:4175 >/dev/null 2>&1; then
  echo "$(date '+%a %b %-d %-I:%M %p') skipped — the screenshot port was busy" > "$OUT/last.txt"
  exit 0
fi
if PATH="/usr/local/bin:/usr/bin:/bin:$PATH" npm run test:visual:wall >"$LOG" 2>&1; then
  echo "$(date '+%a %b %-d %-I:%M %p') passed — $(grep -oE '[0-9]+ passed' "$LOG" | tail -1)" > "$OUT/last.txt"
else
  failed=$(grep -E '^\s+[0-9]+\) ' "$LOG" | sed -E 's/^\s+[0-9]+\) //' | sort -u | head -8)
  { echo "$(date '+%a %b %-d %-I:%M %p') FAILED — $(grep -oE '[0-9]+ failed' "$LOG" | tail -1) (log: $LOG)"; echo "$failed"; } > "$OUT/last.txt"
fi
# For the morning email (nightly_checks; the routine emails Jake only when something failed).
if head -1 "$OUT/last.txt" | grep -q ' passed'; then ok=true; else ok=false; fi
PATH="/usr/local/bin:/usr/bin:/bin:$PATH" node scripts/nightly-record.mjs screens "$ok" "$(head -1 "$OUT/last.txt")" "$OUT/last.txt" >/dev/null 2>&1 || true
# Keep two weeks of logs.
find "$OUT" -name 'visual-*.log' -mtime +14 -delete 2>/dev/null
