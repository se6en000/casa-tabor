#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-jake@192.168.86.118}"

echo "==> Deploying to GitHub (origin)"
git push origin HEAD:main

if git remote | grep -q "^deploy$"; then
  echo "==> Deploying to GitHub (deploy)"
  git push deploy HEAD:main
fi

echo "==> Linking canonical Vercel project"
npx vercel link --yes --scope casa-projects --project casa-tabor
PROJECT_NAME="$(node -p "require('./.vercel/project.json').projectName")"
if [[ "$PROJECT_NAME" != "casa-tabor" ]]; then
  echo "Refusing to deploy unexpected Vercel project: $PROJECT_NAME" >&2
  exit 1
fi

echo "==> Deploying to Vercel production"
npx vercel --prod --yes --scope casa-projects

echo "==> Syncing and refreshing Pi kiosk session (${PI_HOST})"
PI_HOST="$PI_HOST" "$(dirname "$0")/refresh-casa-kiosk.sh"

echo "==> Done"
