#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"

echo "==> Deploying to GitHub (origin)"
git push origin main

if git remote | grep -q "^deploy$"; then
  echo "==> Deploying to GitHub (deploy)"
  git push deploy main || echo "⚠️ Warning: Failed to push to deploy remote. You may need to authenticate."
fi

echo "==> Deploying to Vercel production"
npx vercel --prod

echo "==> Syncing and refreshing Pi kiosk session (${PI_HOST})"
PI_HOST="$PI_HOST" "$(dirname "$0")/refresh-casa-kiosk.sh"

echo "==> Done"
