#!/usr/bin/env bash
# Read-only status of every setup phase, so a rerun resumes where it stopped. Prints no secret values.
# Usage: check.sh            (ENV_FILE=.env.other check.sh to check another env file)
set -uo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
ok() { printf '  [x] %s\n' "$1"; }
no() { printf '  [ ] %s\n' "$1"; }
has() { [ -n "$(env_get "$1")" ]; }

echo "Tools"
for t in bun node vercel gh openssl curl; do command -v "$t" >/dev/null && ok "$t" || no "$t (install it)"; done
vercel whoami >/dev/null 2>&1 && ok "vercel logged in as $(vercel whoami 2>/dev/null)" || no "vercel login"

echo "Phase 1: Vercel project"
[ -f .vercel/project.json ] && ok "linked (.vercel/project.json)" || no "vercel link"
has PUBLIC_BASE_URL && ok "PUBLIC_BASE_URL in $(basename "$ENV_FILE")" || no "PUBLIC_BASE_URL"
base="$(env_get PUBLIC_BASE_URL)"
if [ -n "$base" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/health")"
  [ "$code" = 200 ] && ok "$base/api/health -> 200" || no "$base/api/health -> $code"
fi

echo "Phase 2: Redis"
has KV_REST_API_URL && has KV_REST_API_TOKEN && ok "KV_REST_API_URL / KV_REST_API_TOKEN" || no "Upstash integration (KV_* missing)"

echo "Phase 3: bot secrets and defaults"
for k in BOT_SIGNING_SECRET TOKEN_ENCRYPTION_KEY CRON_SECRET DEFAULT_REPOSITORY DEFAULT_BASE_BRANCH; do
  has "$k" && ok "$k" || no "$k"
done

echo "Phase 4: Linear OAuth app"
for k in LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET LINEAR_WEBHOOK_SECRET; do has "$k" && ok "$k" || no "$k"; done

echo "Vercel production env (names only)"
if [ -f .vercel/project.json ]; then
  remote="$(vercel env ls production 2>/dev/null | awk 'NR>1{print $1}')"
  for k in PUBLIC_BASE_URL LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET LINEAR_WEBHOOK_SECRET BOT_SIGNING_SECRET \
    TOKEN_ENCRYPTION_KEY CRON_SECRET DEFAULT_REPOSITORY KV_REST_API_URL KV_REST_API_TOKEN; do
    grep -qx "$k" <<<"$remote" && ok "$k" || no "$k (run push-env.sh, then redeploy)"
  done
fi

echo "Phase 5-6: app token and connected people"
if has KV_REST_API_URL; then
  status="$(node "$(dirname "$0")/linear-install.mjs" --status 2>/dev/null)"
  installs="$(sed -E 's/.*"installs":([0-9]+).*/\1/' <<<"$status")"
  users="$(sed -E 's/.*"connectedUsers":([0-9]+).*/\1/' <<<"$status")"
  [ "${installs:-0}" -gt 0 ] 2>/dev/null && ok "app token stored in Redis" || no "app token (linear-install.mjs)"
  [ "${users:-0}" -gt 0 ] 2>/dev/null && ok "$users person(s) connected at /connect" || no "nobody connected yet (/connect)"
else
  no "app token (needs Redis first)"
fi
