#!/usr/bin/env bash
# Load optional BrakeFast runtime env files.

set -euo pipefail

if [ -n "${BASH_SOURCE[0]-}" ]; then
  SELF_PATH="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION-}" ]; then
  SELF_PATH="${(%):-%N}"
else
  SELF_PATH="$0"
fi

SCRIPT_DIR="$(cd "$(dirname "$SELF_PATH")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="${BRAKEFAST_DIR}/config"
OTTO_DIR="$(dirname "$BRAKEFAST_DIR")"
SECRETS_DIR="${OTTO_DIR}/etc/Secrets"

load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    # shellcheck disable=SC1090
    set -a
    source "$file"
    set +a
  fi
}

# Read a secret from a key file and export it under the given env var name.
# - Silently no-ops if the key file is missing (dispatcher handles missing_key).
# - Reads first non-blank line, strips CR + trailing whitespace.
# - Never echoes or logs the secret value.
load_secret_key() {
  local var_name="$1"
  local key_file="$2"
  if [ ! -f "$key_file" ]; then
    return 0
  fi
  local value
  value="$(grep -v '^[[:space:]]*$' "$key_file" | head -n 1 | tr -d '\r' | sed 's/[[:space:]]*$//')"
  if [ -n "$value" ]; then
    export "$var_name=$value"
  fi
}

load_env_file "${CONFIG_DIR}/briefing.env"
load_env_file "${CONFIG_DIR}/briefing.local.env"

# Phase 04.02: scrape.do + AlterLab key files (loaded after briefing.env so
# the .key file is the canonical source; briefing.local.env can preview-set
# the var but the .key file overrides if present).
load_secret_key "SCRAPEDO_KEY" "${SECRETS_DIR}/scrapedo.key"
load_secret_key "ALTERLAB_KEY" "${SECRETS_DIR}/alterlab.key"
