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

load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    # shellcheck disable=SC1090
    set -a
    source "$file"
    set +a
  fi
}

load_env_file "${CONFIG_DIR}/briefing.env"
load_env_file "${CONFIG_DIR}/briefing.local.env"
