#!/bin/bash
# Casa Tabor — Chromium kiosk launcher for Raspberry Pi 5
# Place this at: /home/pi/start-casa.sh
# chmod +x /home/pi/start-casa.sh
#
# Add to autostart:
#   mkdir -p ~/.config/autostart
#   nano ~/.config/autostart/casa-tabor.desktop
#
# [Desktop Entry]
# Type=Application
# Name=Casa Tabor
# Exec=/home/pi/start-casa.sh
# X-GNOME-Autostart-enabled=true

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor after 1 second of inactivity (install: sudo apt install unclutter)
unclutter -idle 1 -root &

# Wait for network
sleep 3

# Launch Chromium in kiosk mode with full touch support
chromium-browser \
  --kiosk \
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
