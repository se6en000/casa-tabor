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

# ── Kiosk toggle ──────────────────────────────────────────────────────────
# Set to "1" for locked-down fullscreen kiosk (production on the wall).
# Set to "0" for a normal windowed browser while testing/building (tabs,
# address bar, and access to the rest of the desktop). Override at launch:
#   KIOSK=0 /home/jake/start-casa.sh
KIOSK="${KIOSK:-0}"

# Bail out loudly if we somehow booted into Wayland — touch will not work.
if [ "${XDG_SESSION_TYPE:-x11}" = "wayland" ]; then
  echo "Casa Tabor: WARNING — running under Wayland; touch gestures will break." >&2
  echo "Run: sudo raspi-config nonint do_wayland W1 && sudo reboot" >&2
fi

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor after 1 second of inactivity (install: sudo apt install unclutter)
unclutter -idle 1 -root &

# Wait for network
sleep 3

# ── Sensor bridge ──────────────────────────────────────────────────────────
# Reads AS7343 via I²C and serves Room Tone data on 127.0.0.1:8765.
# Starts in background; Chromium polls it for CCT/lux. Safe to run even if
# sensor isn't wired yet — bridge starts in simulation mode.
BRIDGE_DIR="$HOME/sensor-bridge"
if [ -f "$BRIDGE_DIR/main.py" ]; then
  cd "$BRIDGE_DIR" && python3 main.py &>> "$HOME/sensor-bridge.log" &
  cd "$HOME"
fi

# Launch Chromium with full touch support.
# Kiosk flag is added only when KIOSK=1; otherwise launch a normal window.
KIOSK_FLAG=""
if [ "$KIOSK" = "1" ]; then
  KIOSK_FLAG="--kiosk"
fi

# Ensure X11 auth is available when script is called from SSH or autostart
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

chromium-browser \
  $KIOSK_FLAG \
  --password-store=basic \
  --no-sandbox \
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
  --start-maximized \
  --window-position=0,0 \
  https://casa-tabor.vercel.app

