#!/usr/bin/env bash
set -eo pipefail

COMMIT_MSG="${1:-}"
SCOPE="casa-projects"
PROJECT="casa-tabor"

echo "========================================="
echo "🚀 Casa Tabor Unified Deploy Pipeline"
echo "========================================="

# 1. Build Verification
echo ""
echo "📦 [1/4] Verifying and building project..."
npm run build
echo "✓ Build verified successfully."

# 2. Git Commit (if working tree has changes)
echo ""
echo "📝 [2/4] Checking Git working tree..."
if ! git diff-index --quiet HEAD -- 2>/dev/null || [ -n "$(git status --porcelain)" ]; then
  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Deploy update $(date -u +'%Y-%m-%d %H:%M:%SZ')"
  fi
  echo "Staging and committing changes with message: \"$COMMIT_MSG\""
  git add -A
  git commit -m "$COMMIT_MSG"
  echo "✓ Changes committed."
else
  echo "✓ Working tree clean, no new uncommitted changes."
fi

# 3. Push to GitHub
echo ""
echo "🐙 [3/4] Pushing to GitHub (origin/main)..."
if git push origin HEAD:main 2>&1; then
  echo "✓ Pushed to GitHub successfully."
else
  echo "⚠️  GitHub push encountered an issue (check SSH key or network)."
  echo "   To configure SSH access, add ~/.ssh/id_ed25519.pub to https://github.com/settings/keys"
  echo "   Continuing with Vercel deployment..."
fi

# 4. Deploy to Vercel Production
echo ""
echo "▲ [4/4] Deploying to Vercel production (${SCOPE}/${PROJECT})..."
npx vercel link --yes --scope "$SCOPE" --project "$PROJECT" >/dev/null 2>&1 || true
npx vercel --prod --yes --scope "$SCOPE"

echo ""
echo "========================================="
echo "🎉 Deployment Complete!"
echo "🌐 Live URL: https://casa-tabor.vercel.app"
echo "========================================="
