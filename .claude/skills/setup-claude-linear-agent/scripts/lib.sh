# Shared helpers for the setup scripts. Source it; don't run it.
# ENV_FILE defaults to <repo>/.env. Values are never printed.

repo_root() { cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd; }
ROOT="$(repo_root)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

# env_get KEY -> prints the value from ENV_FILE (first '=' splits; surrounding quotes stripped)
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1)" || true
  [ -n "$line" ] || return 0
  local v="${line#*=}"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

# env_set KEY VALUE -> writes or replaces KEY in ENV_FILE, keeps the file at 600
env_set() {
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  local tmp; tmp="$(mktemp)"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
