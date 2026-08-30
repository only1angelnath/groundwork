#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== git status ==="
git status --short

if git diff --cached --name-only | grep -qE '\.env($|\.)' || git status --short | grep -qE '\.env($|\.)'; then
  echo "!! .env file detected in changes — aborting. Check .gitignore." >&2
  exit 1
fi

MSG="${1:-WIP: session update}"

git add -A
git commit -m "$MSG" || echo "Nothing to commit."
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo "Pushed to $(git remote get-url origin)"
