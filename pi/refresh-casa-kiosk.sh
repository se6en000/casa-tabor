#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
PI_START_SCRIPT="${PI_START_SCRIPT:-/home/jake/start-casa.sh}"
PI_SERVICE="${PI_SERVICE:-casa-kiosk.service}"

echo "[refresh] Syncing launcher to ${PI_HOST}:${PI_START_SCRIPT}"
scp -q "$(dirname "$0")/start-casa.sh" "${PI_HOST}:${PI_START_SCRIPT}"

echo "[refresh] Restarting ${PI_SERVICE} via systemd"
ssh "$PI_HOST" "
  START_PIDS=\$(ps -eo pid,args | awk '\$0 ~ /\\/home\\/jake\\/start-casa\\.sh\$/ {print \$1}' | tr '\n' ' ') &&
  if [ -n \"\$START_PIDS\" ]; then
    kill \$START_PIDS 2>/dev/null || true
  fi &&
  CHROME_PIDS=\$(ps -eo pid,args | awk '\$0 ~ /[c]hromium --/ {print \$1}' | tr '\n' ' ') &&
  if [ -n \"\$CHROME_PIDS\" ]; then
    kill \$CHROME_PIDS 2>/dev/null || true
  fi &&
  sleep 3 &&
  chmod +x '${PI_START_SCRIPT}' &&
  sudo systemctl daemon-reload &&
  sudo systemctl restart '${PI_SERVICE}' &&
  sleep 8 &&
  systemctl is-active '${PI_SERVICE}' >/dev/null
"

echo "[refresh] Verifying single launcher + kiosk process"
ssh "$PI_HOST" '
  START_COUNT=$(ps -eo args | awk '"'"'$0 ~ /\/home\/jake\/start-casa\.sh$/ {c++} END {print c+0}'"'"')
  KIOSK_COUNT=0
  for _ in $(seq 1 20); do
    KIOSK_COUNT=$(ps -eo args | grep "[c]hromium --" | grep -c -- "--kiosk" || true)
    [ "$KIOSK_COUNT" -ge 1 ] && break
    sleep 2
  done
  if [ "$START_COUNT" -ne 1 ]; then
    echo "Expected 1 start-casa.sh process, found $START_COUNT" >&2
    exit 1
  fi
  if [ "$KIOSK_COUNT" -lt 1 ]; then
    echo "Expected at least 1 Chromium kiosk process, found $KIOSK_COUNT" >&2
    exit 1
  fi
  echo "START_COUNT=$START_COUNT KIOSK_COUNT=$KIOSK_COUNT"
  ps -eo pid,args | grep "[c]hromium --" | head -n 1
'

echo "[refresh] Success"
