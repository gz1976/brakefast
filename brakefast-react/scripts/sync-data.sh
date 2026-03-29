#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://ottobot.net"
PUBLIC_DIR="$(cd "$(dirname "$0")/../public" && pwd)"

download() {
  local url="$1"
  local dest="$2"
  printf "Downloading %s ... " "$url"
  if curl -fsSL --max-time 15 "$url" -o "$dest"; then
    echo "OK ($(wc -c < "$dest" | tr -d ' ') bytes)"
  else
    echo "FAILED"
    return 1
  fi
}

echo "Syncing data from $BASE_URL"
echo "Target: $PUBLIC_DIR"
echo ""

ERRORS=0

download "$BASE_URL/latest/data.json" "$PUBLIC_DIR/local-data.json" || ((ERRORS++)) || true
download "$BASE_URL/latest/monitoring.json" "$PUBLIC_DIR/local-monitoring.json" || ((ERRORS++)) || true

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All files synced successfully."
else
  echo "Completed with $ERRORS error(s). Check output above."
fi
