#!/bin/bash
# Casa Tabor — TRIAL touch optimization launcher for Raspberry Pi 5
# This is an experimental version with touch latency optimizations.
# Compare with: /home/jake/start-casa.sh (current/stable version)
#
# To launch trial: TRIAL=1 /home/jake/start-casa-trial.sh
# Or manually: /home/jake/start-casa-trial.sh

# Single-instance guard: prevent duplicate launcher runs from autostart/manual restarts.
LOCK_FILE="/tmp/casa-kiosk-launch-trial.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Casa Tabor (TRIAL): launcher already running; skipping duplicate start."
  exit 0
fi

# ── Kiosk toggle ──────────────────────────────────────────────────────────
KIOSK="${KIOSK:-1}"

# Bail out loudly if we somehow booted into Wayland — touch will not work.
if [ "${XDG_SESSION_TYPE:-x11}" = "wayland" ]; then
  echo "Casa Tabor (TRIAL): WARNING — running under Wayland; touch gestures will break." >&2
  echo "Run: sudo raspi-config nonint do_wayland W1 && sudo reboot" >&2
fi

# Ensure X11 auth is available before any X11 commands
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

# Wait for X11 display to be ready (up to 20 seconds)
for i in $(seq 1 20); do xdpyinfo >/dev/null 2>&1 && break; sleep 1; done

# Restore QHD resolution — xrandr --auto can drop it to 1024x768 on reconnect.
# This custom mode matches the Pisichen 23.8" 2560x1440 panel via HDMI-2.
xrandr --newmode "2560x1440_60" 241.50 2560 2608 2640 2720 1440 1443 1448 1481 -hsync +vsync 2>/dev/null || true
xrandr --addmode HDMI-2 "2560x1440_60" 2>/dev/null || true
xrandr --output HDMI-2 --mode "2560x1440_60" 2>/dev/null || true

# Disable screen blanking and DPMS power management AFTER display is ready
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor for a tablet-like touch experience.
# unclutter-xfixes (install: sudo apt install unclutter-xfixes) hides the
# cursor the instant the touchscreen is touched (--hide-on-touch) and starts
# hidden, so an arrow only appears if a real USB mouse is moved. Falls back to
# classic unclutter where xfixes isn't available.
for pid in $(pgrep -x unclutter 2>/dev/null) $(pgrep -f unclutter-xfixes 2>/dev/null); do kill "$pid" 2>/dev/null || true; done
if command -v unclutter-xfixes >/dev/null 2>&1; then
  unclutter-xfixes --timeout 1 --jitter 2 --hide-on-touch --start-hidden --fork >/dev/null 2>&1
else
  unclutter -idle 1 -root &
fi

# Stop external keyboards; Casa now uses an integrated in-app keyboard.
kill $(pgrep -f "florence" 2>/dev/null) 2>/dev/null
kill $(pgrep -f "matchbox-keyboard" 2>/dev/null) 2>/dev/null

# Wait for network
sleep 3

# ── Kill stale bridges before starting new ones ─────────────────────────────
# Prevents port conflicts and socket hang-ups when restarting
kill $(pgrep -f "sensor-bridge.*main.py" 2>/dev/null) 2>/dev/null
kill $(pgrep -f "whisper-bridge.*main.py" 2>/dev/null) 2>/dev/null
sleep 3  # Wait for sockets to close (TIME_WAIT state)

# ── Sensor bridge ──────────────────────────────────────────────────────────
# Reads AS7343 via I²C and serves Room Tone data on 127.0.0.1:8765.
# Starts in background; Chromium polls it for CCT/lux. Safe to run even if
# sensor isn't wired yet — bridge starts in simulation mode.
BRIDGE_DIR="$HOME/sensor-bridge"
if [ -f "$BRIDGE_DIR/main.py" ]; then
  python3 "$BRIDGE_DIR/main.py" &>> "$HOME/sensor-bridge.log" &
  sleep 1
fi

# ── Whisper speech-to-text bridge ─────────────────────────────────────────
# Listens on 127.0.0.1:8766; Chromium POSTs audio blobs, gets transcript back.
WHISPER_DIR="$HOME/whisper-bridge"
if [ -f "$WHISPER_DIR/main.py" ]; then
  WHISPER_ENV="$HOME/.config/casa/whisper-bridge.env"
  if [ -r "$WHISPER_ENV" ]; then
    set -a
    . "$WHISPER_ENV"
    set +a
  fi
  PATH="$HOME/.local/bin:$PATH" python3 "$WHISPER_DIR/main.py" &>> "$HOME/whisper-bridge.log" &
  sleep 1
fi

# Launch Chromium with full touch support.
# Kiosk flag is added only when KIOSK=1; otherwise launch a normal window.
KIOSK_FLAG=""
if [ "$KIOSK" = "1" ]; then
  KIOSK_FLAG="--kiosk"
fi

echo "Casa Tabor (TRIAL): Launching with touch optimization flags..."
echo "  - Raw touch events enabled"
echo "  - GPU vsync disabled (lower latency)"
echo "  - Touch move throttling reduced"

chromium-browser \
  $KIOSK_FLAG \
  --password-store=basic \
  --no-sandbox \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --use-gl=angle \
  --use-angle=gles \
  --disable-gpu-sandbox \
  --touch-events=enabled \
  --enable-touch-drag-drop \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --enable-features=ElasticOverscroll \
  --disable-features=TranslateUI,Translate \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-background-networking \
  --check-for-update-interval=31536000 \
  --start-maximized \
  --window-position=0,0 \
  --enable-raw-touch-events \
  --disable-gpu-vsync \
  --disable-renderer-backgrounding \
  'https://casa-tabor.vercel.app?density=kiosk'
