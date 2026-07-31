#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
PI_START_SCRIPT="${PI_START_SCRIPT:-/home/jake/start-casa.sh}"
PI_WHISPER_DIR="${PI_WHISPER_DIR:-/home/jake/whisper-bridge}"
PI_SERVICE="${PI_SERVICE:-casa-kiosk.service}"
echo "[refresh] Syncing launcher to ${PI_HOST}:${PI_START_SCRIPT}"
scp -q "$(dirname "$0")/start-casa.sh" "${PI_HOST}:${PI_START_SCRIPT}"
echo "[refresh] Syncing watchdog script"
scp -q "$(dirname "$0")/casa-watchdog.sh" "${PI_HOST}:/home/jake/casa-watchdog.sh"
echo "[refresh] Syncing STT bridge modules to ${PI_HOST}:${PI_WHISPER_DIR}"
ssh "$PI_HOST" "mkdir -p '${PI_WHISPER_DIR}'"
scp -q \
  "$(dirname "$0")/whisper-bridge-main.py" \
  "${PI_HOST}:${PI_WHISPER_DIR}/main.py"
scp -q \
  "$(dirname "$0")/stt_flux_shadow.py" \
  "${PI_HOST}:${PI_WHISPER_DIR}/stt_flux_shadow.py"
echo "[refresh] Syncing service unit files"
ssh "$PI_HOST" "mkdir -p /home/jake/.config/systemd/user"
scp -q \
  "$(dirname "$0")/casa-whisper-bridge.service" \
  "${PI_HOST}:/home/jake/.config/systemd/user/casa-whisper-bridge.service"
scp -q \
  "$(dirname "$0")/casa-sensor-bridge.service" \
  "${PI_HOST}:/home/jake/.config/systemd/user/casa-sensor-bridge.service"
scp -q \
  "$(dirname "$0")/casa-watchdog.service" \
  "${PI_HOST}:/tmp/casa-watchdog.service"
scp -q \
  "$(dirname "$0")/casa-watchdog.timer" \
  "${PI_HOST}:/tmp/casa-watchdog.timer"

echo "[refresh] Restarting ${PI_SERVICE} via systemd"
ssh "$PI_HOST" "
  chmod +x /home/jake/casa-watchdog.sh &&
  XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user daemon-reload &&
  XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user enable --now casa-sensor-bridge.service casa-whisper-bridge.service &&
  sudo install -m 0644 /tmp/casa-watchdog.service /etc/systemd/system/casa-watchdog.service &&
  sudo install -m 0644 /tmp/casa-watchdog.timer /etc/systemd/system/casa-watchdog.timer &&
  rm -f /tmp/casa-watchdog.service /tmp/casa-watchdog.timer &&
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
  sudo systemctl enable --now casa-watchdog.timer &&
  sudo systemctl restart '${PI_SERVICE}' &&
  sleep 8 &&
  systemctl is-active '${PI_SERVICE}' >/dev/null
"

PI_HOST="$PI_HOST" "$(dirname "$0")/check-kiosk-health.sh"
