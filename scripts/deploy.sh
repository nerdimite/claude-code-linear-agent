#!/usr/bin/env bash
# Deploy the committed HEAD to Vercel production from a clean export with no .git folder,
# so the deployment carries no git metadata (repo, branch, commit, author).
# Usage: scripts/deploy.sh [vercel scope]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
scope="${1:-}"
[ -f "$root/.vercel/project.json" ] || { echo "Run 'vercel link' first." >&2; exit 1; }
if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Uncommitted changes: commit them first (this deploys HEAD only)." >&2
  exit 1
fi
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
git -C "$root" archive --format=tar HEAD | tar -x -C "$out"
mkdir -p "$out/.vercel" && cp "$root/.vercel/project.json" "$out/.vercel/"
cd "$out"
vercel deploy --prod --yes ${scope:+--scope "$scope"}
