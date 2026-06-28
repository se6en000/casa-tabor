#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"

echo "==> Deploying to GitHub"
git push origin main

echo "==> Deploying to Vercel production"
npx vercel --prod

echo "==> Refreshing Pi kiosk session (${PI_HOST})"
ssh "$PI_HOST" "bash -lc '
for pid in \$(lsof -t /tmp/casa-kiosk-launch.lock 2>/dev/null | sort -u); do kill \$pid 2>/dev/null || true; done
for pid in \$(pgrep -f \"/home/jake/start-casa.sh\" 2>/dev/null); do kill \$pid 2>/dev/null || true; done
for pid in \$(pgrep -f \"/usr/lib/chromium/chromium --\" 2>/dev/null); do kill \$pid 2>/dev/null || true; done
sleep 4
rm -f /tmp/casa-kiosk-launch.lock
export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000
nohup /home/jake/start-casa.sh > /home/jake/casa.log 2>&1 < /dev/null & disown
'"

echo "==> Verifying Chromium is running"
ssh "$PI_HOST" "ps -eo pid,lstart,args | grep '[/]usr/lib/chromium/chromium --'"

echo "==> Done"
