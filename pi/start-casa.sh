#!/bin/bash
# Casa Tabor — Chromium kiosk launcher for Raspberry Pi 5
# Place this at: /home/jake/start-casa.sh
# chmod +x /home/jake/start-casa.sh
#
# ⚠️ CRITICAL: This Pi MUST run an X11/Xorg session, NOT Wayland.
# Chromium on Wayland (labwc/wayfire) SILENTLY DROPS touch events — a finger
# drag arrives as a mouse drag, so scrolling and swipe gestures break. On X11
# (Openbox), Chromium receives native XInput2 touch and everything works.
# Set X11 once with:   sudo raspi-config nonint do_wayland W1   (then reboot)
# Verify with:         echo $XDG_SESSION_TYPE   # must print: x11
#
# Add to autostart (X11/LXDE):
#   mkdir -p ~/.config/autostart
#   nano ~/.config/autostart/casa-tabor.desktop
#
# [Desktop Entry]
# Type=Application
# Name=Casa Tabor
# Exec=/home/jake/start-casa.sh
# X-GNOME-Autostart-enabled=true

# Single-instance guard: prevent duplicate launcher runs from autostart/manual restarts.
LOCK_FILE="/tmp/casa-kiosk-launch.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Casa Tabor: launcher already running; skipping duplicate start."
  exit 0
fi

echo "$(date): Casa Tabor launcher starting (kiosk hard-lock enabled)" >> "$HOME/launcher.log"

# ── Kiosk hard-lock ───────────────────────────────────────────────────────
# Production wall mode: always launch locked fullscreen kiosk.
# Intentionally ignore any KIOSK env override so accidental windowed launches
# cannot happen from SSH, autostart races, or manual commands.
if [ "${KIOSK:-1}" != "1" ]; then
  echo "$(date): ignoring KIOSK=${KIOSK}; forcing kiosk mode" >> "$HOME/launcher.log"
fi

# Bail out loudly if we somehow booted into Wayland — touch will not work.
if [ "${XDG_SESSION_TYPE:-x11}" = "wayland" ]; then
  echo "Casa Tabor: WARNING — running under Wayland; touch gestures will break." >&2
  echo "Run: sudo raspi-config nonint do_wayland W1 && sudo reboot" >&2
fi

# Ensure X11 auth is available before any X11 commands
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

is_x11_ready() {
  if command -v xdpyinfo >/dev/null 2>&1; then
    xdpyinfo >/dev/null 2>&1
    return $?
  fi
  xset q >/dev/null 2>&1
  return $?
}

# If current Xauthority does not work, fall back to common lightdm cookie path.
if ! is_x11_ready; then
  for candidate in "$HOME/.Xauthority" "/var/run/lightdm/root/:0"; do
    [ -f "$candidate" ] || continue
    export XAUTHORITY="$candidate"
    is_x11_ready && break
  done
fi

# Wait for X11 display to be ready (up to 20 seconds), then fail loudly.
DISPLAY_READY=0
for i in $(seq 1 20); do
  if is_x11_ready; then
    DISPLAY_READY=1
    break
  fi
  sleep 1
done
if [ "$DISPLAY_READY" != "1" ]; then
  echo "Casa Tabor: X11 display not ready (DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY)" >&2
  exit 1
fi

# Restore QHD resolution — xrandr --auto can drop it to 1024x768 on reconnect.
# This custom mode matches the Pisichen 23.8" 2560x1440 panel via HDMI-2.
xrandr --newmode "2560x1440_60" 241.50 2560 2608 2640 2720 1440 1443 1448 1481 -hsync +vsync 2>/dev/null || true
xrandr --addmode HDMI-2 "2560x1440_60" 2>/dev/null || true
xrandr --output HDMI-2 --mode "2560x1440_60" 2>/dev/null || true

# Disable screen blanking and DPMS power management AFTER display is ready
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor after 1 second of inactivity (install: sudo apt install unclutter)
kill $(pgrep -f "unclutter -idle 1 -root" 2>/dev/null) 2>/dev/null
unclutter -idle 1 -root &

# Stop external keyboards; Casa now uses an integrated in-app keyboard.
kill $(pgrep -f "florence" 2>/dev/null) 2>/dev/null
kill $(pgrep -f "matchbox-keyboard" 2>/dev/null) 2>/dev/null

# Wait for network
sleep 3

# Ensure only one Chromium browser instance is active before launch.
# Without this, a stale previous root process can survive and create a
# second half-initialized kiosk window.
for pid in $(pgrep -f "[/]usr/lib/chromium/chromium --" 2>/dev/null); do
  kill "$pid" 2>/dev/null || true
done
sleep 2

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
  PATH="$HOME/.local/bin:$PATH" python3 "$WHISPER_DIR/main.py" &>> "$HOME/whisper-bridge.log" &
  sleep 1
fi

# Launch Chromium with full touch support in locked kiosk mode.

/usr/lib/chromium/chromium \
  --kiosk \
  --force-device-scale-factor=1 \
  --password-store=basic \
  --touch-events=enabled \
  --enable-touch-drag-drop \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=TranslateUI,Translate \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-background-networking \
  --check-for-update-interval=31536000 \
  --enable-logging=stderr \
  --log-level=0 \
  --v=1 \
  --start-maximized \
  --window-position=0,0 \
  https://casa-tabor.vercel.app 2>&1 | tee -a "$HOME/chromium.log"
