#!/usr/bin/env bash
# Generates the bot's own secrets into .env, only for keys that are still empty.
# Safe to rerun: existing values are kept (rotating BOT_SIGNING_SECRET logs everyone out,
# rotating TOKEN_ENCRYPTION_KEY makes every saved routine token unreadable).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

gen() { [ -n "$(env_get "$1")" ] && echo "kept      $1" || { env_set "$1" "$2"; echo "generated $1"; }; }

gen BOT_SIGNING_SECRET "$(openssl rand -base64 48 | tr -d '\n/+=')"
gen TOKEN_ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
gen CRON_SECRET "$(openssl rand -hex 24)"
gen IDLE_WINDOW_MINUTES 60
gen WAIT_SECONDS 100
gen ROUTINES_JSON '{}'
