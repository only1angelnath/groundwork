#!/usr/bin/env bash
# Groundwork — pre-deploy check + git push
# Run from the repo root: ./deploy.sh "commit message here"
set -euo pipefail

MSG="${1:-Frontend redesign: light/glassmorphism direction, isometric tower logo}"

echo "=== 1. Checking .gitignore covers secrets ==="
NEEDED_ENTRIES=(".env" ".env.local" ".env*.local" "node_modules" ".next")
MISSING=()
for entry in "${NEEDED_ENTRIES[@]}"; do
  if ! grep -qxF "$entry" .gitignore 2>/dev/null; then
    MISSING+=("$entry")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "WARNING: .gitignore is missing: ${MISSING[*]}"
  echo "Add these before continuing, or secrets/bloat may get committed."
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
else
  echo "OK — .gitignore looks safe."
fi

echo ""
echo "=== 2. Checking no .env.local is actually staged ==="
if git status --porcelain | grep -qE '\.env(\.local)?$'; then
  echo "ABORT: an .env file is staged for commit. Unstage it first:"
  git status --porcelain | grep -E '\.env(\.local)?$'
  exit 1
fi
echo "OK — no .env files staged."

echo ""
echo "=== 3. Dependency vulnerability check (frontend) ==="
if [ -d frontend ]; then
  (cd frontend && npm audit --audit-level=critical) || {
    echo "WARNING: npm audit found critical vulnerabilities. Review above before pushing."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  }
  echo "No critical-severity vulnerabilities found (moderate/high may still exist — see HANDOFF.md for the known/accepted list)."
fi

echo ""
echo "=== 4. Typecheck + build sanity check (frontend) ==="
if [ -d frontend ]; then
  (cd frontend && npx tsc --noEmit) || { echo "ABORT: typecheck failed."; exit 1; }
  echo "Typecheck passed."
fi

echo ""
echo "=== 5. Staging, committing, pushing ==="
git add -A
git status --short
read -p "Review the staged files above. Commit and push? (y/N) " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted before commit."; exit 1; }

git commit -m "$MSG"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if git remote get-url origin > /dev/null 2>&1; then
  git push origin "$CURRENT_BRANCH"
  echo ""
  echo "Pushed to origin/$CURRENT_BRANCH."
else
  echo ""
  echo "No 'origin' remote configured. Set one up first:"
  echo "  git remote add origin https://github.com/only1angelnath/groundwork.git"
  echo "  git push -u origin $CURRENT_BRANCH"
fi
