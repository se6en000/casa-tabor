#!/usr/bin/env bash
set -euo pipefail

LOG=/home/jake/casa-watchdog.log
TS=$(date "+%Y-%m-%d %H:%M:%S")

# Single source of truth: only manage the kiosk service.
# start-casa.sh is responsible for launching/owning sensor + whisper bridges.
KIOSK_STATE=$(systemctl is-active casa-kiosk.service 2>/dev/null || true)
case "$KIOSK_STATE" in
  active|activating|deactivating|reloading)
    ;;
  *)
    echo "[$TS] Kiosk service is '$KIOSK_STATE' — starting via systemd" >> "$LOG"
    sudo systemctl start casa-kiosk.service
    ;;
esac

tail -500 "$LOG" > /tmp/cwt.log 2>/dev/null && mv /tmp/cwt.log "$LOG" 2>/dev/null || true
