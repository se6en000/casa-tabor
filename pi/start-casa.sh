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

# ── Kiosk toggle ──────────────────────────────────────────────────────────
# Set to "1" for locked-down fullscreen kiosk (production on the wall).
# Set to "0" for a normal windowed browser while testing/building (tabs,
# address bar, and access to the rest of the desktop). Override at launch:
#   KIOSK=0 /home/jake/start-casa.sh
KIOSK="${KIOSK:-1}"

# Bail out loudly if we somehow booted into Wayland — touch will not work.
if [ "${XDG_SESSION_TYPE:-x11}" = "wayland" ]; then
  echo "Casa Tabor: WARNING — running under Wayland; touch gestures will break." >&2
  echo "Run: sudo raspi-config nonint do_wayland W1 && sudo reboot" >&2
fi

# Ensure X11 auth is available before any X11 commands
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [ -S "$XDG_RUNTIME_DIR/bus" ]; then
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
fi

# Wait for X11 display to be ready (up to 20 seconds).
DISPLAY_READY=0
for _ in $(seq 1 20); do
  if xset q >/dev/null 2>&1; then
    DISPLAY_READY=1
    break
  fi
  sleep 1
done
if [ "$DISPLAY_READY" -ne 1 ]; then
  echo "Casa Tabor: X11 display ${DISPLAY} was not ready after 20 seconds." >&2
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
if xset q 2>/dev/null | grep -q "DPMS is"; then
  xset -dpms
fi

# Hide the mouse cursor for a tablet-like touch experience.
# unclutter-xfixes (install: sudo apt install unclutter-xfixes) hides the
# cursor the instant the touchscreen is touched (--hide-on-touch) and starts
# hidden, so an arrow only appears if a real USB mouse is moved. Falls back to
# classic unclutter where xfixes isn't available.
for pid in $(pgrep -x unclutter 2>/dev/null) $(pgrep -f unclutter-xfixes 2>/dev/null); do kill "$pid" 2>/dev/null || true; done
if command -v unclutter-xfixes >/dev/null 2>&1; then
  (exec 9>&-; unclutter-xfixes --timeout 1 --jitter 2 --hide-on-touch --start-hidden --fork >/dev/null 2>&1)
else
  (exec 9>&-; unclutter -idle 1 -root &)
fi

# Stop external keyboards; Casa now uses an integrated in-app keyboard.
kill $(pgrep -f "florence" 2>/dev/null) 2>/dev/null
kill $(pgrep -f "matchbox-keyboard" 2>/dev/null) 2>/dev/null

# Wait for network
sleep 3

# ── Voice/sensor bridges are systemd user services ─────────────────────────
WHISPER_ENV="$HOME/.config/casa/whisper-bridge.env"
if [ -r "$WHISPER_ENV" ]; then
  set -a
  . "$WHISPER_ENV"
  set +a
fi

for svc in casa-sensor-bridge.service casa-whisper-bridge.service; do
  if systemctl --user cat "$svc" >/dev/null 2>&1; then
    if ! systemctl --user restart "$svc"; then
      echo "Casa Tabor: failed to restart ${svc}" >&2
    fi
  else
    echo "Casa Tabor: ${svc} not installed; voice/sensor features may be degraded." >&2
  fi
done

# Launch Chromium with full touch support.
# Kiosk flag is added only when KIOSK=1; otherwise launch a normal window.
KIOSK_FLAG=""
if [ "$KIOSK" = "1" ]; then
  KIOSK_FLAG="--kiosk"
fi

# Debian's chromium wrapper currently injects an obsolete V8 flag on 16K-page
# Raspberry Pi systems. Launch the packaged binary directly when available.
CHROMIUM_BIN="${CHROMIUM_BIN:-/usr/lib/chromium/chromium}"
if [ ! -x "$CHROMIUM_BIN" ]; then
  CHROMIUM_BIN="$(command -v chromium-browser || command -v chromium || true)"
fi
if [ -z "$CHROMIUM_BIN" ]; then
  echo "Casa Tabor: Chromium executable not found." >&2
  exit 1
fi

"$CHROMIUM_BIN" \
  $KIOSK_FLAG \
  --password-store=basic \
  --no-sandbox \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --num-raster-threads=2 \
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
  'https://casa-tabor.vercel.app?density=kiosk' \
  9>&-
