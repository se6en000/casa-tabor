#!/usr/bin/env bash
# Switch the wall kiosk between the Family Wall (the default) and the old homepage.
#   bash pi/kiosk-view.sh wall    # show https://casa-tabor.vercel.app/wall
#   bash pi/kiosk-view.sh home    # back to the old homepage (instant rollback)
#   bash pi/kiosk-view.sh         # print the current setting
# The choice lives on the Pi (~/.config/casa-kiosk/view), so deploys keep it.
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
VIEW="${1:-}"

if [ -z "$VIEW" ]; then
  ssh "$PI_HOST" "cat ~/.config/casa-kiosk/view 2>/dev/null || echo wall"
  exit 0
fi
case "$VIEW" in
  wall|home) ;;
  *) echo "usage: $0 [wall|home]" >&2; exit 2 ;;
esac

ssh "$PI_HOST" "mkdir -p ~/.config/casa-kiosk && echo '$VIEW' > ~/.config/casa-kiosk/view"
echo "[kiosk-view] set to '$VIEW'; restarting the kiosk"
# The refresh script syncs the launcher (which reads the setting) and restarts Chromium.
"$(dirname "$0")/refresh-casa-kiosk.sh"
