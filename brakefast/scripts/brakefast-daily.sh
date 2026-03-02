#!/usr/bin/env bash
# BrakeFast — Daily Orchestrator
# Runs the full pipeline: fetch → curate (optional) → generate HTML → notify
# Called by OpenClaw cron or manually
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${BRAKEFAST_DIR}/output/brakefast.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== BrakeFast Daily Pipeline Start ==="

# Step 1: Fetch RSS feeds
log "Step 1: Fetching RSS feeds..."
if bash "${SCRIPT_DIR}/fetch-feeds.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 1: Done"
else
  log "ERROR: Feed fetch failed"
  exit 1
fi

# Step 2: Curate with LLM (if openclaw is available)
# This step is handled by Otto via the skill prompt.
# If curated-articles.json doesn't exist, generate-html.sh falls back to raw-articles.json
CURATED_FILE="${BRAKEFAST_DIR}/output/curated-articles.json"
if [ -f "$CURATED_FILE" ]; then
  log "Step 2: Using curated articles"
else
  log "Step 2: No curated articles found, using raw feed data"
fi

# Step 3: Generate HTML
log "Step 3: Generating HTML..."
if bash "${SCRIPT_DIR}/generate-html.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 3: Done"
else
  log "ERROR: HTML generation failed"
  exit 1
fi

# Step 4: Generate archive page
log "Step 4: Generating archive..."
if bash "${SCRIPT_DIR}/generate-archive.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 4: Done"
else
  log "WARN: Archive generation failed (non-critical)"
fi

# Step 5: Cleanup old editions (keep 30 days)
log "Step 5: Cleaning up old editions..."
EDITIONS_DIR="/docker/brakefast/editions"
find "$EDITIONS_DIR" -name "index.html" -path "*/????/??/??/*" -mtime +30 -delete 2>/dev/null || true
# Remove empty date directories
find "$EDITIONS_DIR" -mindepth 1 -maxdepth 3 -type d -empty -delete 2>/dev/null || true
log "Step 5: Done"

log "=== BrakeFast Daily Pipeline Complete ==="
log "Edition available at: https://clogzoehrer.ddns.net/brakefast/latest/index.html"
