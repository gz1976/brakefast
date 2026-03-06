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

# Step 0: Fetch Google Calendar events
log "Step 0: Fetching Google Calendar events..."
CALENDAR_SCRIPT="${SCRIPT_DIR}/fetch-calendar.py"
CALENDAR_JSON="${BRAKEFAST_DIR}/output/calendar-events.json"
GCAL_TOKEN="${BRAKEFAST_DIR}/config/gcal_token.json"
GCAL_CREDS="${BRAKEFAST_DIR}/config/gcal_credentials.json"
if [ -f "$CALENDAR_SCRIPT" ]; then
  if python3 "$CALENDAR_SCRIPT" "$GCAL_TOKEN" "$GCAL_CREDS" 2>/dev/null > "$CALENDAR_JSON"; then
    log "Step 0: Calendar events fetched ($(python3 -c "import json; print(len(json.load(open('$CALENDAR_JSON'))))" 2>/dev/null || echo '?') events)"
  else
    log "WARN: Calendar fetch failed, using empty array"
    echo "[]" > "$CALENDAR_JSON"
  fi
else
  log "WARN: Calendar script not found, using empty array"
  echo "[]" > "$CALENDAR_JSON"
fi

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

# Step 2.5: Generate missing article images via HuggingFace
log "Step 2.5: Generating missing article images..."
IMAGE_SCRIPT="${SCRIPT_DIR}/generate-images.py"
IMAGE_INPUT="${CURATED_FILE}"
if [ ! -f "$IMAGE_INPUT" ]; then
  IMAGE_INPUT="${BRAKEFAST_DIR}/output/raw-articles.json"
fi
if [ -f "$IMAGE_SCRIPT" ] && [ -f "$IMAGE_INPUT" ]; then
  if python3 "$IMAGE_SCRIPT" "$IMAGE_INPUT" "/data/brakefast-public/images" 2>&1 | tee -a "$LOG_FILE"; then
    log "Step 2.5: Image generation complete"
  else
    log "WARN: Image generation failed (non-critical, continuing)"
  fi
else
  log "Step 2.5: Skipped (script or input not found)"
fi

# Step 3: Generate HTML
log "Step 3: Generating HTML..."
if bash "${SCRIPT_DIR}/generate-html.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 3: Done"
else
  log "ERROR: HTML generation failed"
  exit 1
fi

# Step 3.5: Copy JSON for React app + merge calendar events
log "Step 3.5: Providing JSON for React app..."
INPUT_JSON="${BRAKEFAST_DIR}/output/curated-articles.json"
if [ ! -f "$INPUT_JSON" ]; then
  INPUT_JSON="${BRAKEFAST_DIR}/output/raw-articles.json"
fi
if [ -f "$INPUT_JSON" ]; then
  mkdir -p "/data/brakefast-public"
  cp "$INPUT_JSON" "/data/brakefast-public/data.json"
  # Merge calendar events into data.json (widgets.calendar)
  if [ -f "$CALENDAR_JSON" ] && [ -s "$CALENDAR_JSON" ]; then
    python3 -c "
import json, sys
try:
    with open('/data/brakefast-public/data.json') as f:
        data = json.load(f)
    with open('$CALENDAR_JSON') as f:
        events = json.load(f)
    if events and isinstance(events, list):
        if 'widgets' not in data:
            data['widgets'] = {}
        data['widgets']['calendar'] = events
        with open('/data/brakefast-public/data.json', 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'Merged {len(events)} calendar events into data.json')
except Exception as e:
    print(f'WARN: Calendar merge failed: {e}', file=sys.stderr)
" 2>&1 | tee -a "$LOG_FILE"
  fi
  log "Step 3.5: data.json copied to /data/brakefast-public/"
else
  log "WARN: No JSON found for React app"
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
EDITIONS_DIR="/data/brakefast-public/editions"
find "$EDITIONS_DIR" -name "index.html" -path "*/????/??/??/*" -mtime +30 -delete 2>/dev/null || true
# Remove empty date directories
find "$EDITIONS_DIR" -mindepth 1 -maxdepth 3 -type d -empty -delete 2>/dev/null || true
log "Step 5: Done"

log "=== BrakeFast Daily Pipeline Complete ==="
log "Edition available at: https://ottobot.net/"
