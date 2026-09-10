#!/usr/bin/env bash
# One-command ship: tests -> gates+build (once) -> commit -> push -> Vercel prod
# (prebuilt, so Vercel's machine never rebuilds from scratch) -> Pi kiosk refresh.
#
# Usage:
#   scripts/ship.sh ["commit message"]
#   SKIP_KIOSK=1 scripts/ship.sh        # web-only deploy, don't touch the Pi
#   PI_HOST=jake@1.2.3.4 scripts/ship.sh  # override kiosk host
#
# Safe to run from any machine with this repo cloned and `vercel`/`git` auth
# set up (origin push access + `vercel login`). If run ON the kiosk Pi itself,
# it self-bootstraps SSH trust (adds its own key to its own authorized_keys)
# so the refresh step can SSH to itself over the LAN.
set -euo pipefail
cd "$(dirname "$0")/.."

PI_HOST="${PI_HOST:-jake@192.168.86.118}"
PI_IP="${PI_HOST#*@}"
COMMIT_MSG="${1:-}"
LOG="$(mktemp -d)/ship.log"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[1;31m✗ %s\033[0m\n' "$1"
  echo "  ---- last 40 lines of $LOG ----"
  tail -n 40 "$LOG"
  exit 1
}

START=$(date +%s)

step "1/6 Tests (node --test)"
npm test >"$LOG" 2>&1 || fail "tests failed"
ok "tests pass"

step "2/6 Gates + build (tokens/style/certify/types/vite, run once via vercel build)"
npx vercel link --yes --scope casa-projects --project casa-tabor >>"$LOG" 2>&1 || true
npx vercel build --prod --yes >>"$LOG" 2>&1 || fail "gates or build failed"
ok "gates + build passed"

step "3/6 Commit"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "${COMMIT_MSG:-Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)}" >>"$LOG" 2>&1
  ok "committed"
else
  ok "working tree already clean"
fi

step "4/6 Push"
git push origin HEAD:main >>"$LOG" 2>&1 || fail "push to origin failed"
if git remote | grep -q '^deploy$'; then
  git push deploy HEAD:main >>"$LOG" 2>&1 || fail "push to deploy remote failed"
fi
SHA=$(git rev-parse HEAD)
ok "pushed $SHA"

step "5/6 Deploy prebuilt bundle to Vercel production"
DEPLOY_URL=$(npx vercel deploy --prebuilt --prod --yes --scope casa-projects 2>>"$LOG" | tail -1)
[ -n "$DEPLOY_URL" ] || fail "vercel deploy produced no URL"
ok "deployed: $DEPLOY_URL"

step "Verify production is actually serving $SHA"
LIVE=""
for _ in $(seq 1 20); do
  LIVE=$(curl -fsS https://casa-tabor.vercel.app/version.json 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)
  [ "$LIVE" = "$SHA" ] && break
  sleep 3
done
[ "$LIVE" = "$SHA" ] || fail "production is serving $LIVE, expected $SHA (propagation may just be slow — check https://casa-tabor.vercel.app/version.json)"
ok "production live at $SHA"

if [ "${SKIP_KIOSK:-0}" = "1" ]; then
  step "6/6 Kiosk refresh skipped (SKIP_KIOSK=1)"
else
  step "6/6 Refresh Pi kiosk ($PI_HOST)"
  MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ "$MY_IP" = "$PI_IP" ]; then
    # Running on the kiosk itself: trust our own key/host so SSH-to-self works.
    ssh-keygen -F "$PI_IP" >/dev/null 2>&1 || ssh-keyscan -H "$PI_IP" >>~/.ssh/known_hosts 2>/dev/null
    PUBKEY=$(cat ~/.ssh/id_ed25519.pub 2>/dev/null || true)
    if [ -n "$PUBKEY" ] && ! grep -qF "$PUBKEY" ~/.ssh/authorized_keys 2>/dev/null; then
      echo "$PUBKEY" >>~/.ssh/authorized_keys
      chmod 600 ~/.ssh/authorized_keys
      echo "  (trusted this session's own SSH key for self-refresh)"
    fi
  fi
  bash pi/refresh-casa-kiosk.sh >>"$LOG" 2>&1 || fail "kiosk refresh failed"
  ssh "$PI_HOST" "sudo systemctl enable casa-kiosk.service" >>"$LOG" 2>&1 || true
  ok "kiosk refreshed and live"
fi

END=$(date +%s)
echo
echo "🎉 Shipped $SHA to https://casa-tabor.vercel.app in $((END - START))s"
