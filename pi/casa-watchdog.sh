#!/usr/bin/env bash
set -euo pipefail

LOG=/home/jake/casa-watchdog.log
TS=$(date "+%Y-%m-%d %H:%M:%S")
RECOVERY_COOLDOWN_FILE=/tmp/casa-audio-recovery.last
RECOVERY_COOLDOWN_SECS=120
MAX_WAKE_FAILURE_LINES=25

user_systemctl() {
  if [ "$(id -un)" = "jake" ]; then
    systemctl --user "$@"
  else
    sudo -u jake env \
      XDG_RUNTIME_DIR=/run/user/1000 \
      DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
      systemctl --user "$@"
  fi
}

user_journalctl() {
  if [ "$(id -un)" = "jake" ]; then
    journalctl --user "$@"
  else
    sudo -u jake env \
      XDG_RUNTIME_DIR=/run/user/1000 \
      DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
      journalctl --user "$@"
  fi
}

maybe_recover_audio_stack() {
  local reason="$1"
  local now last elapsed
  now=$(date +%s)
  last=0
  if [ -f "$RECOVERY_COOLDOWN_FILE" ]; then
    last=$(cat "$RECOVERY_COOLDOWN_FILE" 2>/dev/null || echo 0)
  fi
  elapsed=$((now - last))
  if [ "$elapsed" -lt "$RECOVERY_COOLDOWN_SECS" ]; then
    echo "[$TS] Audio recovery skipped (cooldown ${RECOVERY_COOLDOWN_SECS}s, elapsed=${elapsed}s): ${reason}" >> "$LOG"
    return
  fi

  echo "$now" > "$RECOVERY_COOLDOWN_FILE"
  echo "[$TS] Audio recovery triggered: ${reason}" >> "$LOG"
  if ! user_systemctl restart pipewire.service pipewire-pulse.service wireplumber.service; then
    echo "[$TS] ERROR: audio service restart failed" >> "$LOG"
  fi
  sleep 2
  if ! user_systemctl restart casa-sensor-bridge.service casa-whisper-bridge.service; then
    echo "[$TS] ERROR: bridge service restart failed" >> "$LOG"
  fi
}

# Single source of truth: keep kiosk + audio services healthy.
KIOSK_STATE=$(systemctl is-active casa-kiosk.service 2>/dev/null || true)
case "$KIOSK_STATE" in
  active|activating|deactivating|reloading)
    ;;
  *)
    echo "[$TS] Kiosk service is '$KIOSK_STATE' — starting via systemd" >> "$LOG"
    sudo systemctl start casa-kiosk.service
    ;;
esac

BRIDGE_ERRORS=()

for svc in casa-sensor-bridge.service casa-whisper-bridge.service; do
  SVC_STATE=$(user_systemctl is-active "$svc" 2>/dev/null || true)
  if [ "$SVC_STATE" != "active" ]; then
    BRIDGE_ERRORS+=("${svc}=${SVC_STATE}")
  fi
done

WHISPER_STATUS="$(curl -sS --max-time 2 http://127.0.0.1:8766/status 2>/dev/null || true)"
if [ -z "$WHISPER_STATUS" ]; then
  BRIDGE_ERRORS+=("whisper_status=unreachable")
elif ! printf '%s' "$WHISPER_STATUS" | grep -q '"error": null'; then
  BRIDGE_ERRORS+=("whisper_status=error")
fi

WAKE_FAILURE_LINES=$( (tail -n 180 /home/jake/whisper-bridge.log 2>/dev/null || true) | grep -Ec 'arecord exited early|short read' || true)
if [ "${WAKE_FAILURE_LINES:-0}" -gt "$MAX_WAKE_FAILURE_LINES" ]; then
  BRIDGE_ERRORS+=("wake_failures=${WAKE_FAILURE_LINES}")
fi

PULSE_CONN_REFUSED=$( (user_journalctl -u pipewire-pulse.service --since "2 minutes ago" --no-pager 2>/dev/null || true) | grep -Ec 'too many client application connections|Connection refused' || true)
if [ "${PULSE_CONN_REFUSED:-0}" -gt 0 ]; then
  BRIDGE_ERRORS+=("pulse_connection_refused=${PULSE_CONN_REFUSED}")
fi

if [ "${#BRIDGE_ERRORS[@]}" -gt 0 ]; then
  maybe_recover_audio_stack "$(IFS=', '; echo "${BRIDGE_ERRORS[*]}")"
else
  echo "[$TS] Audio health OK" >> "$LOG"
fi

tail -500 "$LOG" > /tmp/cwt.log 2>/dev/null && mv /tmp/cwt.log "$LOG" 2>/dev/null || true
