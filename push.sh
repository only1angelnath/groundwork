#!/usr/bin/env bash
# Commits and pushes whatever's changed in the groundwork repo.
# Run from inside the repo: ~/Desktop/groundwork
#
# Usage:
#   bash push.sh "commit message here"
#
# If you don't pass a message, it'll ask for one.

set -euo pipefail

if [ ! -d .git ]; then
  echo "Run this from inside the groundwork repo root (where .git lives)."
  exit 1
fi

MSG="${1:-}"
if [ -z "$MSG" ]; then
  read -rp "Commit message: " MSG
fi

git add -A
git status --short

echo ""
echo "About to commit and push the above changes with message: \"$MSG\""
read -rp "Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted. Nothing committed or pushed."
  exit 0
fi

git commit -m "$MSG"

BRANCH=$(git branch --show-current)
git push origin "$BRANCH"

echo ""
echo "Pushed to origin/$BRANCH. Check it at:"
git remote get-url origin | sed 's/\.git$//'
