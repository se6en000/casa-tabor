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

STEP_START=$(date +%s)
step() { STEP_START=$(date +%s); printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[1;32m✓\033[0m %s \033[2m(%ss)\033[0m\n' "$1" "$(( $(date +%s) - STEP_START ))"; }
fail() {
  printf '  \033[1;31m✗ %s\033[0m\n' "$1"
  echo "  ---- last 40 lines of $LOG ----"
  tail -n 40 "$LOG"
  exit 1
}

START=$(date +%s)
PRE_BUILD_SHA=$(git rev-parse HEAD)

step "1-2/6 Tests + gates/build, side by side (tokens/style/certify/types/vite via vercel build)"
# Tests don't depend on the build, so they run in the background while the
# build runs; either failing stops the ship before anything is committed.
TEST_LOG="$(dirname "$LOG")/tests.log"
npm test >"$TEST_LOG" 2>&1 &
TEST_PID=$!
# Family Wall screenshot guard (P2.6), alongside. Baselines are per platform;
# on a machine without them (e.g. a Mac) it's skipped with a notice.
WALL_LOG="$(dirname "$LOG")/wall-visual.log"
WALL_PID=""
# Only when this ship touches something that can change how the Wall looks.
WALL_PATHS='^(src/wall/|src/phone/|src/App\.tsx|visual-regression/phone|src/lib/|src/index\.css|src/design-system/|src/generated/|src/main\.tsx|tests/fixtures/wall|visual-regression/wall|playwright\.wall|package(-lock)?\.json)'
WALL_TOUCHED=$({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } | grep -E "$WALL_PATHS" | head -1 || true)
if [ -z "$WALL_TOUCHED" ]; then
  : # nothing Wall-visible changed
elif ls visual-regression/wall.spec.mjs-snapshots/*-"$(node -p process.platform)".png >/dev/null 2>&1; then
  npm run test:visual:wall >"$WALL_LOG" 2>&1 &
  WALL_PID=$!
else
  printf '  \033[33m! no Wall screenshot baselines for this platform; guard skipped\033[0m\n'
fi
npx vercel link --yes --scope casa-projects --project casa-tabor >>"$LOG" 2>&1 || true
if npx vercel build --prod --yes >>"$LOG" 2>&1; then BUILD_RC=0; else BUILD_RC=$?; fi
if wait "$TEST_PID"; then TEST_RC=0; else TEST_RC=$?; fi
if [ "$TEST_RC" -ne 0 ]; then LOG="$TEST_LOG"; fail "tests failed"; fi
if [ -n "$WALL_PID" ] && ! wait "$WALL_PID"; then
  LOG="$WALL_LOG"
  fail "Wall screenshots changed — if intended, run npm run test:visual:wall:update, look at the new PNGs, and ship again"
fi
cat "$TEST_LOG" >>"$LOG"
[ "$BUILD_RC" -eq 0 ] || fail "gates or build failed"
ok "tests pass, gates + build passed"

step "3/6 Commit"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "${COMMIT_MSG:-Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)}" >>"$LOG" 2>&1
  ok "committed"
  # vite.config.ts bakes `git rev-parse HEAD` into BOTH version.json AND every
  # JS asset (as the literal __BUILD_ID__ string, via vite's `define`) at build
  # time -- but the build in step 2 ran BEFORE this commit existed, so both hold
  # the PREVIOUS commit's SHA, one behind what's about to be pushed/deployed.
  # Patching only version.json (as this used to do) leaves the deployed bundle
  # permanently disagreeing with its own manifest -- useAppUpdater.ts polls
  # exactly that pair to detect a new deploy, so every connected browser
  # reload-loops forever (reloading just re-serves the same mismatched build).
  # Confirmed live 2026-09-11: this was shipped and caused exactly that kiosk/
  # browser reload loop. Fix: rewrite the same literal SHA string across the
  # built JS assets too, not just the manifest (still cheaper than a full
  # rebuild, which is what the "prebuilt" step 5 relies on).
  NEW_SHA=$(git rev-parse HEAD)
  BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  VERSION_JSON="{\"version\":\"$NEW_SHA\",\"builtAt\":\"$BUILT_AT\"}"
  for f in dist/version.json .vercel/output/static/version.json; do
    [ -f "$f" ] && printf '%s' "$VERSION_JSON" > "$f"
  done
  if [ "$PRE_BUILD_SHA" != "$NEW_SHA" ]; then
    for dir in dist/assets .vercel/output/static/assets; do
      [ -d "$dir" ] || continue
      grep -rl "$PRE_BUILD_SHA" "$dir" 2>/dev/null | while IFS= read -r f; do
        sed -i.bak "s/$PRE_BUILD_SHA/$NEW_SHA/g" "$f" && rm -f "$f.bak"
      done
    done
  fi
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
# `vercel deploy` prints a single JSON result object to stdout (progress goes to stderr) —
# parse deployment.readyState/url from it rather than assuming a bare URL on stdout.
DEPLOY_JSON=$(npx vercel deploy --prebuilt --prod --yes --scope casa-projects 2>>"$LOG")
echo "$DEPLOY_JSON" >>"$LOG"
READY_STATE=$(printf '%s' "$DEPLOY_JSON" | sed -n 's/.*"readyState": *"\([^"]*\)".*/\1/p' | head -1)
DEPLOY_URL=$(printf '%s' "$DEPLOY_JSON" | sed -n 's/.*"url": *"\([^"]*\)".*/\1/p' | head -1)
[ "$READY_STATE" = "READY" ] || fail "deployment did not report READY (got '$READY_STATE')"
ok "deployed: https://${DEPLOY_URL#https://}"

step "Confirm production is serving $SHA"
# This is a best-effort secondary check: Vercel's own deploy result above is the
# authoritative success signal. The public CDN can briefly serve a cached
# /version.json even after a successful deploy+alias (vercel.json pins it to
# no-store, but an edge node that cached it under the old policy may take a
# little longer to expire) — so a timeout here is a warning, not a failure.
LIVE=""
for _ in $(seq 1 20); do
  LIVE=$(curl -fsS https://casa-tabor.vercel.app/version.json 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)
  [ "$LIVE" = "$SHA" ] && break
  sleep 3
done
if [ "$LIVE" = "$SHA" ]; then
  ok "production confirmed live at $SHA"
else
  printf '  \033[1;33m⚠\033[0m production still reporting %s (CDN cache lag) — deploy itself succeeded, this should clear shortly\n' "$LIVE"
fi

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
