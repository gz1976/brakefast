#!/usr/bin/env bash
# BrakeFast — Deploy Redesign to VPS
# Run this ON the VPS as user gerhard:
#   bash deploy-redesign.sh
#
# What it does:
#   1. Clones the redesign branch from Git
#   2. Copies new style.css + manifest.json to live editions
#   3. Updates the latest edition HTML to use hero+grid layout
#   4. Copies updated generator scripts for future editions
set -euo pipefail

EDITIONS="/docker/brakefast/editions"
SCRIPTS="/home/gerhard/Otto/brakefast/scripts"
TMP_DIR=$(mktemp -d)
BRANCH="claude/brakefirst-h5wRY"

echo "=== BrakeFast Redesign Deploy ==="
echo ""

# --- 1. Pull latest from redesign branch ---
echo "[1/5] Pulling redesign branch ..."
cd "$TMP_DIR"
git clone --depth 1 --branch "$BRANCH" https://github.com/zoehrer1976-afk/Otto.git repo 2>&1 | tail -2
SRC="$TMP_DIR/repo/brakefast"
echo "      Done."

# --- 2. Deploy style.css ---
echo "[2/5] Deploying style.css ..."
sudo cp "${SRC}/editions/assets/style.css" "${EDITIONS}/assets/style.css"
sudo chown ubuntu:ubuntu "${EDITIONS}/assets/style.css"
echo "      Done."

# --- 3. Deploy manifest.json ---
echo "[3/5] Deploying manifest.json ..."
sudo cp "${SRC}/editions/assets/manifest.json" "${EDITIONS}/assets/manifest.json"
sudo chown ubuntu:ubuntu "${EDITIONS}/assets/manifest.json"
echo "      Done."

# --- 4. Update latest edition HTML ---
echo "[4/5] Updating latest edition HTML ..."
LATEST_DIR=$(readlink -f "${EDITIONS}/latest" 2>/dev/null || echo "${EDITIONS}/latest")
if [ -d "$LATEST_DIR" ] && [ -f "${LATEST_DIR}/index.html" ]; then
  sudo cp "${SRC}/editions/latest/index.html" "${LATEST_DIR}/index.html"
  sudo chown ubuntu:ubuntu "${LATEST_DIR}/index.html"
  echo "      Updated: ${LATEST_DIR}/index.html"
else
  echo "      WARNING: No latest edition found at ${LATEST_DIR}"
fi

# --- 5. Update generator scripts ---
echo "[5/5] Updating generator scripts ..."
if [ -d "$SCRIPTS" ]; then
  cp "${SRC}/scripts/generate-html.sh" "${SCRIPTS}/generate-html.sh"
  cp "${SRC}/scripts/generate-archive.sh" "${SCRIPTS}/generate-archive.sh"
  echo "      Updated generate-html.sh and generate-archive.sh"
else
  echo "      Scripts dir not found at ${SCRIPTS}, skipping."
fi

# Cleanup
rm -rf "$TMP_DIR"

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "What changed:"
echo "  - style.css: Modern newspaper design (Playfair Display, grid, hero, animations)"
echo "  - manifest.json: Updated theme colors"
echo "  - latest/index.html: New layout with hero article + 2-column grid"
echo "  - generate-html.sh: Future editions will use new layout automatically"
echo "  - generate-archive.sh: Archive page with grid + weekday labels"
echo ""
echo "Test: Open BrakeFast in browser and hard-refresh (Ctrl+Shift+R)"
