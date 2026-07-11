#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
PI_START_SCRIPT="${PI_START_SCRIPT:-/home/jake/start-casa.sh}"
PI_SERVICE="${PI_SERVICE:-casa-kiosk.service}"

echo "[refresh] Syncing launcher to ${PI_HOST}:${PI_START_SCRIPT}"
scp -q "$(dirname "$0")/start-casa.sh" "${PI_HOST}:${PI_START_SCRIPT}"

echo "[refresh] Restarting ${PI_SERVICE} via systemd"
ssh "$PI_HOST" "
  if [ -f /home/jake/.config/autostart/casa-tabor.desktop ]; then
    mv /home/jake/.config/autostart/casa-tabor.desktop /home/jake/.config/autostart/casa-tabor.desktop.disabled
  fi &&
  START_PIDS=\$(ps -eo pid,args | awk '\$0 ~ /\\/home\\/jake\\/start-casa\\.sh\$/ {print \$1}' | tr '\n' ' ') &&
  if [ -n \"\$START_PIDS\" ]; then
    kill \$START_PIDS 2>/dev/null || true
  fi &&
  CHROME_PIDS=\$(ps -eo pid,args | awk '\$0 ~ /[c]hromium --/ {print \$1}' | tr '\n' ' ') &&
  if [ -n \"\$CHROME_PIDS\" ]; then
    kill \$CHROME_PIDS 2>/dev/null || true
  fi &&
  LOCK_PIDS=\$(lsof -t /tmp/casa-kiosk-launch.lock 2>/dev/null | sort -u | tr '\n' ' ') &&
  if [ -n \"\$LOCK_PIDS\" ]; then
    kill \$LOCK_PIDS 2>/dev/null || true
  fi &&
  sleep 3 &&
  rm -f /tmp/casa-kiosk-launch.lock &&
  chmod +x '${PI_START_SCRIPT}' &&
  sudo systemctl daemon-reload &&
  sudo systemctl restart '${PI_SERVICE}' &&
  sleep 8 &&
  systemctl is-active '${PI_SERVICE}' >/dev/null
"

PI_HOST="$PI_HOST" "$(dirname "$0")/check-kiosk-health.sh"
