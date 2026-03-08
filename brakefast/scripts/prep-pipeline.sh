#!/usr/bin/env bash
# BrakeFast Prep — Fetches feeds and shows compact article index
# Called before curation to minimize model turns
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="${BRAKEFAST_DIR}/output"

# Step 0: Fetch Google Calendar events
CALENDAR_SCRIPT="${SCRIPT_DIR}/fetch-calendar.py"
CALENDAR_JSON="${OUTPUT}/calendar-events.json"
GCAL_TOKEN="${BRAKEFAST_DIR}/config/gcal_token.json"
GCAL_CREDS="${BRAKEFAST_DIR}/config/gcal_credentials.json"
if [ -f "$CALENDAR_SCRIPT" ]; then
  python3 "$CALENDAR_SCRIPT" "$GCAL_TOKEN" "$GCAL_CREDS" 2>/dev/null > "$CALENDAR_JSON" || echo "[]" > "$CALENDAR_JSON"
else
  echo "[]" > "$CALENDAR_JSON"
fi

# Step 1: Fetch RSS feeds
bash "${SCRIPT_DIR}/fetch-feeds.sh" >/dev/null 2>&1

# Step 2: Show compact article index
echo "=== ARTICLE INDEX ==="
python3 -c "
import json
with open('${OUTPUT}/raw-articles.json') as f:
    data = json.load(f)
articles = []
if isinstance(data, list):
    articles = data
elif isinstance(data, dict):
    for cat, items in data.get('categories', data).items():
        if isinstance(items, dict): items = items.get('articles', [])
        for a in (items if isinstance(items, list) else []):
            a['_cat'] = cat
            articles.append(a)
for i, a in enumerate(articles):
    cat = a.get('_cat', a.get('category', '?'))
    print(f'{i:3d} [{cat:10s}] {a.get(\"source\",\"?\"):20s} | {a.get(\"title\",\"?\")[:80]}')
print(f'---')
print(f'Total: {len(articles)} articles')
"
echo "=== END ARTICLE INDEX ==="
