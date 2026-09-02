#!/usr/bin/env bash
# Read-only production smoke test for BrakeFast. Runs on the VPS host.
set -u

DATA_JSON=/docker/brakefast-pipeline/public/data.json
TELEMETRY=/docker/brakefast-pipeline/public/pipeline-telemetry.json
LOG=/docker/brakefast-pipeline/app/brakefast/output/brakefast.log
LOCK=/docker/brakefast-pipeline/app/brakefast/output/brakefast-daily.lock
HOST_CRON=/etc/cron.d/brakefast-direct
# C5+ prueft die OpenClaw-eigene Cron-Liste auf konkurrierende BrakeFast-Jobs;
# der Agent laeuft bis Phase 3 der Migration weiter im OpenClaw-Container.
AGENT_CONTAINER=openclaw-xfcd-openclaw-1

FAILED=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILED=1; }
note() { echo "NOTE  $1"; }

echo "=== BrakeFast pipeline smoke — $(date --iso-8601=seconds) ==="

# C1 — today's public data exists.
if [ ! -f "$DATA_JSON" ]; then
  fail "C1: data.json does not exist"
else
  AGE=$(( $(date +%s) - $(stat -c %Y "$DATA_JSON") ))
  if [ "$AGE" -lt 86400 ]; then
    pass "C1: data.json is ${AGE}s old (<24h)"
  else
    fail "C1: data.json is ${AGE}s old (>=24h)"
  fi
fi

# C2 — enough articles and internally consistent count.
if [ -f "$DATA_JSON" ]; then
  COUNTS=$(jq -r '[.totalArticles // 0, ([.categories[]?.articles[]?] | length)] | @tsv' "$DATA_JSON" 2>/dev/null || true)
  read -r DECLARED COUNTED <<< "$COUNTS"
  if [ -n "${DECLARED:-}" ] && [ "$DECLARED" -ge 20 ] && [ "$DECLARED" -eq "$COUNTED" ]; then
    pass "C2: article count is consistent ($DECLARED)"
  else
    fail "C2: declared=${DECLARED:-?}, counted=${COUNTED:-?}, need >=20 and equal"
  fi
fi

# C2Q — deterministic editorial quality fields are plausible.
if [ -f "$DATA_JSON" ]; then
  QUALITY=$(python3 - "$DATA_JSON" <<'PY'
import json
import sys
from urllib.parse import urlparse

data = json.load(open(sys.argv[1]))
articles = [a for c in data.get("categories", {}).values() for a in c.get("articles", [])]
bad_urls = []
scores = []
for article in articles:
    url = article.get("link") or ""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or "." not in parsed.netloc:
        bad_urls.append(url)
    score = article.get("relevance_score")
    if isinstance(score, (int, float)):
        scores.append(round(float(score), 3))
print(len(bad_urls), len(set(scores)), len(articles) - len(scores))
PY
)
  read -r BAD_URLS UNIQUE_SCORES MISSING_SCORES <<< "$QUALITY"
  if [ "${BAD_URLS:-1}" -eq 0 ] && [ "${UNIQUE_SCORES:-0}" -ge 2 ] && [ "${MISSING_SCORES:-1}" -eq 0 ]; then
    pass "C2Q: URLs valid and relevance scores vary"
  else
    fail "C2Q: bad_urls=${BAD_URLS:-?}, unique_scores=${UNIQUE_SCORES:-?}, missing_scores=${MISSING_SCORES:-?}"
  fi
fi

# C3 — a lock path may only remain while a process actually owns its flock.
if [ ! -f "$LOCK" ]; then
  pass "C3: no lockfile"
elif command -v flock >/dev/null 2>&1; then
  exec 8<"$LOCK"
  if flock -n 8; then
    fail "C3: lockfile exists but no process owns the lock"
    flock -u 8 || true
  else
    note "C3: pipeline lock is actively held"
  fi
else
  note "C3: flock unavailable; lock ownership not testable"
fi

# C4 — structured telemetry belongs to today's successful/partial run.
if [ ! -f "$TELEMETRY" ]; then
  fail "C4: pipeline telemetry does not exist"
else
  TODAY=$(date +%Y-%m-%d)
  EDITION_DATE=$(jq -r '.last_run.edition_date // empty' "$TELEMETRY")
  STATUS=$(jq -r '.last_run.publish_status // empty' "$TELEMETRY")
  if [ "$EDITION_DATE" = "$TODAY" ] && { [ "$STATUS" = "ok" ] || [ "$STATUS" = "partial" ]; }; then
    pass "C4: telemetry date=$EDITION_DATE status=$STATUS"
  else
    fail "C4: telemetry date=${EDITION_DATE:-missing} status=${STATUS:-missing}"
  fi
fi

# C5 — direct host cron is the only BrakeFast schedule.
if [ -f "$HOST_CRON" ] && grep -qE '^30 5 \* \* \*.*brakefast-daily\.sh' "$HOST_CRON"; then
  pass "C5: direct 05:30 host cron exists"
else
  fail "C5: direct 05:30 host cron missing"
fi

CRON_JSON=$(docker exec -u node -e HOME=/data "$AGENT_CONTAINER" openclaw cron list --json 2>/dev/null || true)
if [ -z "$CRON_JSON" ]; then
  fail "C5+: OpenClaw cron list unavailable"
else
  BRAKEFAST_AGENT_JOBS=$(printf '%s' "$CRON_JSON" | jq '[
    (.jobs // .)[]?
    | select(((.name // "") + " " + (.payload.message // "")) | test("BrakeFast|brakefast"))
    | select(.enabled != false)
  ] | length' 2>/dev/null || echo 1)
  if [ "$BRAKEFAST_AGENT_JOBS" -eq 0 ]; then
    pass "C5+: no enabled OpenClaw BrakeFast job"
  else
    fail "C5+: $BRAKEFAST_AGENT_JOBS enabled OpenClaw BrakeFast job(s)"
  fi
fi

# C6 — no direct-cron bypass errors today.
TODAY=$(date +%Y-%m-%d)
if [ -f "$LOG" ]; then
  AGENT_ERRORS=$(grep "$TODAY" "$LOG" 2>/dev/null \
    | grep -Ec 'ERR_MODULE_NOT_FOUND|Message failed|Write failed|Message ordering conflict|402 budget' || true)
  if [ "$AGENT_ERRORS" -eq 0 ]; then
    pass "C6: no agent-layer errors today"
  else
    fail "C6: $AGENT_ERRORS agent-layer errors today"
  fi
fi

echo "=== smoke done — exit code $FAILED ==="
exit "$FAILED"
