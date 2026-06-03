#!/usr/bin/env bash
# BrakeFast — Daily Orchestrator
# Runs the full pipeline: fetch → curate (optional) → generate HTML → notify
# Called by OpenClaw cron or manually
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${BRAKEFAST_DIR}/output/brakefast.log"
PUBLISH_ENABLED=1
mkdir -p "${BRAKEFAST_DIR}/output"
mkdir -p "${BRAKEFAST_DIR}/logs"

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

LOCK_FILE="${BRAKEFAST_DIR}/output/brakefast-daily.lock"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: Another BrakeFast pipeline run is already active; skipping duplicate run" | tee -a "$LOG_FILE"
    exit 75
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: flock not available; duplicate-run protection disabled" | tee -a "$LOG_FILE"
fi

# Self-heal Python deps (trafilatura disappears on container recreate)
if ! python3 -c "import trafilatura" 2>/dev/null; then
  pip3 install --break-system-packages -q trafilatura 2>/dev/null || true
fi

# Self-heal ownership drift. Manual `docker exec` runs (default root) leave
# files as root:root, which blocks the node-uid cron from overwriting them.
# node has passwordless sudo inside the container, so this is a no-op when
# everything is already correctly owned.
if command -v sudo >/dev/null 2>&1; then
  sudo -n chown -R node:node /data/brakefast-public /data/.openclaw/workspace/brakefast/output 2>/dev/null || true
fi

# Load optional runtime env before running the pipeline.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-brakefast-env.sh"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Telegram alert on failure. Chat ID matches openclaw cron delivery target.
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-544762684}"
send_telegram_alert() {
  local token="${TELEGRAM_BOT_TOKEN:-}"
  [ -z "$token" ] && return 0
  curl -sf --max-time 10 -X POST \
    "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

on_pipeline_error() {
  local code=$?
  local line="$1"
  local tail_log
  tail_log="$(tail -6 "$LOG_FILE" 2>/dev/null | tr -d '\r' | head -c 2000)"
  send_telegram_alert "⚠️ BrakeFast Pipeline FAILED
Exit ${code} at line ${line}
Host: $(hostname -s)
Last log lines:
${tail_log}"
}
trap 'on_pipeline_error $LINENO' ERR

PIPELINE_LOG="${BRAKEFAST_DIR}/output/pipeline-run.json"
echo "[]" > "$PIPELINE_LOG"

log_step_summary() {
  local step="$1"
  shift
  local entry="{\"step\": \"$step\", \"timestamp\": \"$(date -Iseconds)\", $*}"
  python3 -c "
import json, sys
entry = json.loads(sys.argv[1])
try:
    with open(sys.argv[2]) as f:
        arr = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    arr = []
arr.append(entry)
with open(sys.argv[2], 'w') as f:
    json.dump(arr, f, ensure_ascii=False, indent=2)
" "$entry" "$PIPELINE_LOG" 2>/dev/null || true
}

log "=== BrakeFast Daily Pipeline Start ==="

# Step 0: Fetch Google Calendar events
log "Step 0: Fetching Google Calendar events..."
CALENDAR_SCRIPT="${SCRIPT_DIR}/fetch-calendar.py"
CALENDAR_JSON="${BRAKEFAST_DIR}/output/calendar-events.json"
CALENDAR_PRIVATE_JSON="${BRAKEFAST_DIR}/output/calendar-events-private.json"

# Self-heal icalendar deps for the private ICS-URL fetcher
if ! python3 -c "import icalendar, recurring_ical_events" 2>/dev/null; then
  pip3 install --break-system-packages -q icalendar recurring_ical_events 2>/dev/null || true
fi

if [ -f "$CALENDAR_SCRIPT" ]; then
  if python3 "$CALENDAR_SCRIPT" 2>&1 | tee -a "$LOG_FILE"; then
    log "Step 0: Calendar events fetched"
  else
    log "WARN: Calendar fetch failed, using empty arrays"
    echo "[]" > "$CALENDAR_JSON"
    echo "[]" > "$CALENDAR_PRIVATE_JSON"
  fi
else
  log "WARN: Calendar script not found, using empty arrays"
  echo "[]" > "$CALENDAR_JSON"
  echo "[]" > "$CALENDAR_PRIVATE_JSON"
fi

# Step 1: Fetch RSS feeds
log "Step 1: Fetching RSS feeds..."
if bash "${SCRIPT_DIR}/fetch-feeds.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "Step 1: Done"
  ARTICLE_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('${BRAKEFAST_DIR}/output/raw-articles.json'))
    cats = d.get('categories', {})
    print(sum(len(c.get('articles', []) if isinstance(c, dict) else c) for c in cats.values()))
except: print(0)
" 2>/dev/null)
  log_step_summary "fetch-feeds" "\"articles\": ${ARTICLE_COUNT:-0}"
else
  log "ERROR: Feed fetch failed"
  exit 1
fi

# Step 1.5: Enrich article briefings
# Wall-clock cap so a stuck briefing extraction (e.g. upstream HTTP that hangs
# instead of erroring) cannot block the rest of the pipeline indefinitely.
ENRICHMENT_TIMEOUT_SEC="${BRAKEFAST_ENRICHMENT_TIMEOUT_SEC:-720}"
log "Step 1.5: Enriching article briefings (timeout ${ENRICHMENT_TIMEOUT_SEC}s)..."
CURATED_FILE="${BRAKEFAST_DIR}/output/curated-articles.json"
ENRICHED_FILE="${BRAKEFAST_DIR}/output/enriched-articles.json"
RAW_FILE="${BRAKEFAST_DIR}/output/raw-articles.json"
ENGINE_SCRIPT="${SCRIPT_DIR}/article_briefing_engine.py"
SPEC_FILE="${BRAKEFAST_DIR}/output/curation-spec.json"
FINAL_JSON="${BRAKEFAST_DIR}/output/final-data.json"

remove_if_stale() {
  local file="$1"
  if [ -f "$file" ] && [ "$file" -ot "$RAW_FILE" ]; then
    log "Removing stale $(basename "$file") (older than today's raw feed)"
    rm -f "$file"
  fi
}

if [ -f "$RAW_FILE" ]; then
  remove_if_stale "$ENRICHED_FILE"
  remove_if_stale "$CURATED_FILE"
  remove_if_stale "$SPEC_FILE"
  remove_if_stale "$FINAL_JSON"
fi

if [ -f "$ENGINE_SCRIPT" ] && [ -f "$RAW_FILE" ]; then
  if timeout --signal=TERM --kill-after=30 "$ENRICHMENT_TIMEOUT_SEC" \
       python3 "$ENGINE_SCRIPT" "$RAW_FILE" "$ENRICHED_FILE" 2>&1 | tee -a "$LOG_FILE"; then
    log "Step 1.5: Enrichment complete"
    log_step_summary "enrichment" "\"status\": \"complete\""
  else
    rc="${PIPESTATUS[0]}"
    if [ "$rc" = "124" ] || [ "$rc" = "137" ]; then
      log "WARN: Article enrichment timed out after ${ENRICHMENT_TIMEOUT_SEC}s (continuing with raw feed data)"
      log_step_summary "enrichment" "\"status\": \"timeout\""
    else
      log "WARN: Article enrichment failed (rc=$rc, continuing with raw feed data)"
      log_step_summary "enrichment" "\"status\": \"failed\""
    fi
    # article_briefing_engine.py checkpoints enriched-articles.json after each
    # article. If the timeout fires mid-run, keep a fresh checkpoint; otherwise
    # remove stale leftovers so curate.py falls back to today's raw feed.
    if [ -f "$ENRICHED_FILE" ] && [ ! "$ENRICHED_FILE" -ot "$RAW_FILE" ]; then
      log "Step 1.5: Using checkpointed enrichment output"
    elif [ -f "$ENRICHED_FILE" ]; then
      log "Removing stale enriched-articles.json (older than today's raw feed)"
      rm -f "$ENRICHED_FILE"
    fi
  fi
else
  log "Step 1.5: Skipped (script or raw input not found)"
fi

# Step 2: Curate articles — try LLM spec first, fall back to --auto
log "Step 2: Curating articles..."
CURATE_SCRIPT="${SCRIPT_DIR}/curate.py"
LLM_CURATION=0

# Try LLM curation spec (uses enriched articles as input)
SPEC_TIMEOUT_SEC="${BRAKEFAST_SPEC_TIMEOUT_SEC:-300}"
if [ -f "$ENGINE_SCRIPT" ] && [ -f "$ENRICHED_FILE" ]; then
  log "Step 2a: Generating LLM curation spec (timeout ${SPEC_TIMEOUT_SEC}s)..."
  if timeout --signal=TERM --kill-after=15 "$SPEC_TIMEOUT_SEC" \
       python3 "$ENGINE_SCRIPT" --curation-spec "$ENRICHED_FILE" "$SPEC_FILE" 2>&1 | tee -a "$LOG_FILE"; then
    if [ -f "$SPEC_FILE" ] && [ -s "$SPEC_FILE" ]; then
      log "Step 2a: LLM curation spec generated"
      LLM_CURATION=1
    else
      log "WARN: LLM spec file empty or missing"
    fi
  else
    rc="${PIPESTATUS[0]}"
    if [ "$rc" = "124" ] || [ "$rc" = "137" ]; then
      log "WARN: LLM curation spec timed out after ${SPEC_TIMEOUT_SEC}s — falling back to --auto"
    else
      log "WARN: LLM curation spec generation failed (rc=$rc)"
    fi
  fi
fi

# Curate with LLM spec or fall back to --auto
if [ -f "$CURATE_SCRIPT" ]; then
  if [ "$LLM_CURATION" -eq 1 ] && [ -f "$SPEC_FILE" ]; then
    log "Step 2b: Curating with LLM spec..."
    if python3 "$CURATE_SCRIPT" "$SPEC_FILE" 2>&1 | tee -a "$LOG_FILE"; then
      log "Step 2: Curation complete (LLM-curated)"
      log_step_summary "curation" "\"mode\": \"llm\""
    else
      log "WARN: LLM-curated curation failed, falling back to --auto"
      python3 "$CURATE_SCRIPT" --auto 2>&1 | tee -a "$LOG_FILE"
      log "Step 2: Curation complete (auto-fallback)"
      log_step_summary "curation" "\"mode\": \"auto-fallback\""
    fi
  else
    log "Step 2b: Using auto-curation (no LLM spec)..."
    if python3 "$CURATE_SCRIPT" --auto 2>&1 | tee -a "$LOG_FILE"; then
      log "Step 2: Curation complete (auto)"
      log_step_summary "curation" "\"mode\": \"auto\""
    else
      log "ERROR: curate.py --auto failed"
      exit 1
    fi
  fi
else
  log "WARN: curate.py not found, using existing curated data"
fi

if [ ! -f "$CURATED_FILE" ] || [ "$CURATED_FILE" -ot "$RAW_FILE" ]; then
  log "ERROR: curated-articles.json is missing or stale after curation"
  exit 1
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
      log_step_summary "validation" "\"passed\": true, \"data_tier\": \"${DATA_TIER}\""
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
      log_step_summary "publish" "\"data_tier\": \"${DATA_TIER}\""
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

# Step 8: Smoke-test published data
log "Step 8: Smoke-testing published edition..."
SMOKE_OK=1
PUBLISHED_JSON="${BRAKEFAST_PUBLIC_DIR:-/data/brakefast-public}/data.json"
if [ -f "$PUBLISHED_JSON" ]; then
  SMOKE_RESULT=$(python3 -c "
import json, sys
try:
    with open('$PUBLISHED_JSON') as f:
        d = json.load(f)
    issues = []
    # Weather check
    w = d.get('widgets', {}).get('weather', {})
    if w.get('temp', 0) == 0 and 'Keine' in w.get('description', 'Keine'):
        issues.append('weather: no real data')
    # History check
    h = d.get('widgets', {}).get('history', [])
    if len(h) < 2:
        issues.append('history: fewer than 2 items')
    fallback_wikis = {'RMS_Titanic', 'Hillsborough-Katastrophe'}
    if h and all(item.get('wiki','') in fallback_wikis for item in h):
        issues.append('history: only fallback items')
    # Quote check
    q = d.get('widgets', {}).get('quote', {})
    author = q.get('author', '')
    if '[BLOCKED' in author or not author:
        issues.append('quote: author blocked or empty')
    # Article count
    total = d.get('totalArticles', 0)
    if total < 25:
        issues.append('articles: only %d (need >= 25)' % total)
    # Date field
    if not d.get('date'):
        issues.append('date: field missing')
    if issues:
        print('FAIL: ' + '; '.join(issues))
        sys.exit(1)
    else:
        print('OK: all smoke checks passed')
except Exception as e:
    print('FAIL: smoke test error: %s' % e)
    sys.exit(1)
" 2>&1)
  if [ $? -ne 0 ]; then
    log "WARN: Smoke test issues: $SMOKE_RESULT"
    SMOKE_OK=0
    log_step_summary "smoke-test" "\"passed\": false, \"issues\": \"${SMOKE_RESULT}\""
  else
    log "Step 8: $SMOKE_RESULT"
    log_step_summary "smoke-test" "\"passed\": true"
  fi
else
  log "WARN: Published JSON not found at $PUBLISHED_JSON"
  SMOKE_OK=0
fi

log "=== BrakeFast Daily Pipeline Complete ==="
log "Edition available at: https://ottobot.net/"
