#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
APP_URL="${APP_URL:-https://casa-tabor.vercel.app}"
EXPECTED_VERSION="${EXPECTED_VERSION:-$(git ls-remote origin refs/heads/main | awk '{print $1}')}"
PI_START_SCRIPT="${PI_START_SCRIPT:-/home/jake/start-casa.sh}"
PI_SERVICE="${PI_SERVICE:-casa-kiosk.service}"

echo "[health] Checking ${PI_HOST}"

REMOTE_STATUS=$(ssh "$PI_HOST" "
  set -eu
  SESSION_TYPE=\$(loginctl show-session \$(loginctl | awk '\$3 == \"jake\" {print \$1; exit}') -p Type --value 2>/dev/null || true)
  for _ in \$(seq 1 30); do
    SERVICE_STATE=\$(systemctl is-active '${PI_SERVICE}' 2>/dev/null || true)
    START_COUNT=\$(ps -eo args | awk '\$0 ~ /\\/home\\/jake\\/start-casa\\.sh\$/ {c++} END {print c+0}')
    KIOSK_COUNT=\$(ps -eo args | awk '\$0 ~ /\\/usr\\/lib\\/chromium\\/chromium .*--kiosk .*casa-tabor\\.vercel\\.app/ {c++} END {print c+0}')
    if [ \"\$SERVICE_STATE\" = active ] && [ \"\$START_COUNT\" -eq 1 ] && [ \"\$KIOSK_COUNT\" -eq 1 ] &&
      DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority xset q >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  test \"\$SERVICE_STATE\" = active
  test \"\$(systemctl is-enabled '${PI_SERVICE}')\" = enabled
  test ! -f /home/jake/.config/autostart/casa-tabor.desktop
  test \"\$START_COUNT\" -eq 1
  test \"\$KIOSK_COUNT\" -eq 1
  DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority xset q >/dev/null 2>&1
  test \"\$SESSION_TYPE\" = x11

  SENSOR_STATE=not-installed
  if [ -f /home/jake/sensor-bridge/main.py ]; then
    curl -fsS http://127.0.0.1:8765/health | grep -q '\"ok\":true'
    SENSOR_STATE=healthy
  fi
  WHISPER_STATE=not-installed
  if [ -f /home/jake/whisper-bridge/main.py ]; then
    ss -ltn | awk '\$4 ~ /:8766$/ {found=1} END {exit !found}'
    WHISPER_STATE=listening
  fi

  REMOTE_SHA=\$(sha256sum '${PI_START_SCRIPT}' | awk '{print \$1}')
  LIVE_VERSION=\$(curl -fsS '${APP_URL}/version.json' | sed -n 's/.*\"version\":\"\\([^\"]*\\)\".*/\\1/p')
  test -n \"\$LIVE_VERSION\"

  printf 'service=active enabled=yes session=%s launcher=%s kiosk=%s sensor=%s whisper=%s launcher_sha=%s live_version=%s\\n' \
    \"\$SESSION_TYPE\" \"\$START_COUNT\" \"\$KIOSK_COUNT\" \"\$SENSOR_STATE\" \"\$WHISPER_STATE\" \"\$REMOTE_SHA\" \"\$LIVE_VERSION\"
")

LOCAL_SHA=$(sha256sum "$(dirname "$0")/start-casa.sh" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$(dirname "$0")/start-casa.sh" | awk '{print $1}')
REMOTE_SHA=$(printf '%s\n' "$REMOTE_STATUS" | sed -n 's/.*launcher_sha=\([^ ]*\).*/\1/p')
LIVE_VERSION=$(printf '%s\n' "$REMOTE_STATUS" | sed -n 's/.*live_version=\([^ ]*\).*/\1/p')

if [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
  echo "[health] Launcher mismatch: local=${LOCAL_SHA} Pi=${REMOTE_SHA}" >&2
  exit 1
fi
if [ "$LIVE_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "[health] Revision mismatch: expected=${EXPECTED_VERSION} live=${LIVE_VERSION}" >&2
  exit 1
fi

echo "[health] ${REMOTE_STATUS}"
echo "[health] Healthy"
