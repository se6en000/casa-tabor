#!/usr/bin/env bash
# The one full assistant check a night, 3:00 AM by cron (before the 3:30 screens; see nightly-assistant-check.mjs).
#   crontab: 0 3 * * * bash /home/jake/casa-tabor/scripts/nightly-assistant.sh
set -u
cd "$(dirname "$0")/.." || exit 1
OUT="$HOME/.casa-nightly"
mkdir -p "$OUT"
PATH="/usr/local/bin:/usr/bin:/bin:$PATH" node scripts/nightly-assistant-check.mjs > "$OUT/assistant-$(date +%Y%m%d).log" 2>&1 \
  || PATH="/usr/local/bin:/usr/bin:/bin:$PATH" node scripts/nightly-record.mjs assistant false "The assistant check didn't finish (log: $OUT/assistant-$(date +%Y%m%d).log)" "$OUT/assistant-$(date +%Y%m%d).log"
find "$OUT" -name 'assistant-*.log' -mtime +14 -delete 2>/dev/null
