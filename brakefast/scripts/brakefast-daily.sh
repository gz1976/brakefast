#!/usr/bin/env bash
# BrakeFast — Daily Orchestrator
# Runs the full pipeline: fetch → curate (optional) → generate HTML → notify
# Called by OpenClaw cron or manually
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${BRAKEFAST_DIR}/output/brakefast.log"
PUBLISH_ENABLED=1

for arg in "$@"; do
  case "$arg" in
    --skip-publish)
      PUBLISH_ENABLED=0
      ;;
    --publish)
      PUBLISH_ENABLED=1
      ;;
  esac
done

# Load optional runtime env before running the pipeline.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-brakefast-env.sh"

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

# Step 1.5: Enrich article briefings
log "Step 1.5: Enriching article briefings..."
CURATED_FILE="${BRAKEFAST_DIR}/output/curated-articles.json"
ENRICHED_FILE="${BRAKEFAST_DIR}/output/enriched-articles.json"
RAW_FILE="${BRAKEFAST_DIR}/output/raw-articles.json"
ENGINE_SCRIPT="${SCRIPT_DIR}/article_briefing_engine.py"
if [ -f "$ENGINE_SCRIPT" ] && [ -f "$RAW_FILE" ]; then
  if python3 "$ENGINE_SCRIPT" "$RAW_FILE" "$ENRICHED_FILE" 2>&1 | tee -a "$LOG_FILE"; then
    log "Step 1.5: Enrichment complete"
  else
    log "WARN: Article enrichment failed (continuing with raw feed data)"
  fi
else
  log "Step 1.5: Skipped (script or raw input not found)"
fi

# Step 2: Curate with OpenClaw/Otto (if available)
# This step is handled by Otto via the brakefast skill prompt.
# If curated-articles.json doesn't exist, generate-html.sh falls back to enriched, then raw.
if [ -f "$CURATED_FILE" ]; then
  log "Step 2: Using curated articles"
elif [ -f "$ENRICHED_FILE" ]; then
  log "Step 2: No curated articles found, using enriched article briefings"
else
  log "Step 2: No curated articles found, using raw feed data"
fi

# Step 3: Resolve images from source, metadata, fallbacks, then optional generators
log "Step 3: Resolving article images..."
IMAGE_SCRIPT="${SCRIPT_DIR}/resolve_images.py"
IMAGE_INPUT="${CURATED_FILE}"
if [ ! -f "$IMAGE_INPUT" ]; then
  IMAGE_INPUT="${ENRICHED_FILE}"
fi
if [ ! -f "$IMAGE_INPUT" ]; then
  IMAGE_INPUT="${RAW_FILE}"
fi
if [ -f "$IMAGE_SCRIPT" ] && [ -f "$IMAGE_INPUT" ]; then
  if python3 "$IMAGE_SCRIPT" "$IMAGE_INPUT" "/data/brakefast-public/images" 2>&1 | tee -a "$LOG_FILE"; then
    log "Step 3: Image resolution complete"
  else
    log "WARN: Image resolution failed (non-critical, continuing)"
  fi
else
  log "Step 3: Skipped (script or input not found)"
fi

# Step 4: Generate HTML
log "Step 4: Generating HTML..."
if bash "${SCRIPT_DIR}/generate-html.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 4: Done"
else
  log "ERROR: HTML generation failed"
  exit 1
fi

# Determine data tier and select input JSON
INPUT_JSON="${BRAKEFAST_DIR}/output/curated-articles.json"
DATA_TIER="curated"
if [ ! -f "$INPUT_JSON" ]; then
  INPUT_JSON="${ENRICHED_FILE}"
  DATA_TIER="enriched"
fi
if [ ! -f "$INPUT_JSON" ]; then
  INPUT_JSON="${BRAKEFAST_DIR}/output/raw-articles.json"
  DATA_TIER="raw"
fi

if [ -f "$INPUT_JSON" ]; then
  log "Step 5: Using ${DATA_TIER} data tier"
  FINAL_JSON="${BRAKEFAST_DIR}/output/final-data.json"
  cp "$INPUT_JSON" "$FINAL_JSON"

  # Merge calendar events into final JSON before validation.
  if [ -f "$CALENDAR_JSON" ] && [ -s "$CALENDAR_JSON" ]; then
    python3 -c "
import json, sys
try:
    with open('$FINAL_JSON') as f:
        data = json.load(f)
    with open('$CALENDAR_JSON') as f:
        events = json.load(f)
    if events and isinstance(events, list):
        if 'widgets' not in data:
            data['widgets'] = {}
        data['widgets']['calendar'] = events
        with open('$FINAL_JSON', 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'Merged {len(events)} calendar events into final-data.json')
except Exception as e:
    print(f'WARN: Calendar merge failed: {e}', file=sys.stderr)
" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Step 4.5: Validate before publishing
  log "Step 4.5: Validating final edition data..."
  VALIDATE_SCRIPT="${SCRIPT_DIR}/validate_edition.py"
  if [ -f "$VALIDATE_SCRIPT" ]; then
    if python3 "$VALIDATE_SCRIPT" "$FINAL_JSON" "$DATA_TIER" 2>&1 | tee -a "$LOG_FILE"; then
      log "Step 4.5: Validation passed"
    else
      log "ERROR: Validation failed — edition NOT published"
      exit 1
    fi
  else
    log "WARN: validate_edition.py not found, skipping validation"
  fi

  if [ "$PUBLISH_ENABLED" -eq 1 ]; then
    if bash "${SCRIPT_DIR}/publish-edition.sh" "$FINAL_JSON" 2>&1 | tee -a "$LOG_FILE"; then
      log "Step 5: final-data.json published and edition archived (tier: ${DATA_TIER})"
    else
      log "ERROR: Publish step failed"
      exit 1
    fi
  else
    log "Step 5: Publish skipped (--skip-publish); final JSON prepared at $FINAL_JSON"
  fi
else
  log "WARN: No JSON found for React app"
fi

# Step 6: Generate archive page
log "Step 6: Generating archive..."
if bash "${SCRIPT_DIR}/generate-archive.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 6: Done"
else
  log "WARN: Archive generation failed (non-critical)"
fi

# Step 7: Cleanup old editions (keep 30 days)
log "Step 7: Cleaning up old editions..."
EDITIONS_DIR="/data/brakefast-public/editions"
find "$EDITIONS_DIR" -name "index.html" -path "*/????/??/??/*" -mtime +30 -delete 2>/dev/null || true
# Remove empty date directories
find "$EDITIONS_DIR" -mindepth 1 -maxdepth 3 -type d -empty -delete 2>/dev/null || true
log "Step 7: Done"

log "=== BrakeFast Daily Pipeline Complete ==="
log "Edition available at: https://ottobot.net/"
