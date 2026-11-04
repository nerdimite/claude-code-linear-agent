#!/usr/bin/env bash
# Copies keys from .env to the linked Vercel project's production environment.
# Values go through stdin, so they never appear in argv, ps or shell history.
# Usage: push-env.sh KEY [KEY...]     (no keys = every app key that has a value)
# KV_* keys are skipped: the Upstash integration manages them.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
[ -f .vercel/project.json ] || { echo "Not linked. Run 'vercel link' first." >&2; exit 1; }

APP_KEYS=(PUBLIC_BASE_URL LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET LINEAR_WEBHOOK_SECRET BOT_SIGNING_SECRET
  TOKEN_ENCRYPTION_KEY CRON_SECRET DEFAULT_REPOSITORY DEFAULT_BASE_BRANCH IDLE_WINDOW_MINUTES WAIT_SECONDS ROUTINES_JSON)
keys=("$@"); [ ${#keys[@]} -gt 0 ] || keys=("${APP_KEYS[@]}")

for k in "${keys[@]}"; do
  case "$k" in KV_*|UPSTASH_*) echo "skip      $k (set by the integration)"; continue ;; esac
  v="$(env_get "$k")"
  if [ -z "$v" ]; then echo "empty     $k (not pushed)"; continue; fi
  printf '%s' "$v" | vercel env add "$k" production --force >/dev/null 2>&1 \
    && echo "pushed    $k" || { echo "FAILED    $k" >&2; exit 1; }
done
echo "Env changes reach production only after a redeploy: bun run deploy -- <scope>"
