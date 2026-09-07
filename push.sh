#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== git status =="
git status --short

if git diff --cached --quiet && git diff --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "Nothing to commit."
  exit 0
fi

MSG="${1:-"chore: sync progress $(date +%Y-%m-%d_%H:%M)"}"

# Safety: refuse to commit if a real .env file is staged/untracked-but-added
if git status --porcelain | grep -E '(^|/)\.env($|\.local$)' ; then
  echo "!! Refusing to commit: a .env file appears in git status. Check .gitignore." >&2
  exit 1
fi

git add -A
git commit -m "$MSG"
git push origin "$(git rev-parse --abbrev-ref HEAD)"
echo "Pushed to $(git remote get-url origin)"
