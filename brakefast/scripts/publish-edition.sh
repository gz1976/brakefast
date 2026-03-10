#!/usr/bin/env bash
# BrakeFast — publish final React JSON and immutable edition snapshot
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
PUBLIC_DIR="${BRAKEFAST_PUBLIC_DIR:-/data/brakefast-public}"
EDITIONS_DIR="${PUBLIC_DIR}/editions"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input-json>" >&2
  exit 1
fi

INPUT_JSON="$1"

if [ ! -f "$INPUT_JSON" ]; then
  echo "ERROR: Input JSON not found: $INPUT_JSON" >&2
  exit 1
fi

mkdir -p "$PUBLIC_DIR" "$EDITIONS_DIR"

python3 - "$INPUT_JSON" "$PUBLIC_DIR" "$EDITIONS_DIR" <<'PYTHON_SCRIPT'
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

input_json = Path(sys.argv[1])
public_dir = Path(sys.argv[2])
editions_dir = Path(sys.argv[3])

with input_json.open("r", encoding="utf-8") as f:
    data = json.load(f)

if not isinstance(data, dict):
    raise SystemExit("ERROR: Expected top-level object in final JSON")

categories = data.get("categories")
if not isinstance(categories, dict) or not categories:
    raise SystemExit("ERROR: Final JSON has no categories")

article_count = 0
top_story = ""
for category_id, category in categories.items():
    articles = category.get("articles", []) if isinstance(category, dict) else []
    if not isinstance(articles, list):
        continue
    article_count += len(articles)
    for article in articles:
        if isinstance(article, dict):
            article.setdefault("category", category_id)
    if not top_story and articles and isinstance(articles[0], dict):
        top_story = articles[0].get("title", "")

if article_count == 0:
    raise SystemExit("ERROR: Final JSON contains zero articles")

generated = data.get("generated")
if not isinstance(generated, str) or not generated.strip():
    generated = datetime.now(timezone.utc).isoformat()
    data["generated"] = generated

try:
    generated_dt = datetime.fromisoformat(generated.replace("Z", "+00:00"))
except ValueError:
    generated_dt = datetime.now(timezone.utc)
    generated = generated_dt.isoformat()
    data["generated"] = generated

date_key = generated_dt.date().isoformat()
year, month, day = date_key.split("-")
edition_dir = editions_dir / year / month / day
edition_dir.mkdir(parents=True, exist_ok=True)

existing_meta_path = edition_dir / "meta.json"
existing_edition_number = None
if existing_meta_path.exists():
    try:
        existing_meta = json.loads(existing_meta_path.read_text(encoding="utf-8"))
        existing_edition_number = existing_meta.get("edition_number")
    except json.JSONDecodeError:
        existing_edition_number = None

if existing_edition_number is not None:
    edition_number = existing_edition_number
else:
    existing_html_editions = [
        path for path in editions_dir.rglob("index.html")
        if len(path.relative_to(editions_dir).parts) == 4
    ]
    edition_number = data.get("edition_number") or len(existing_html_editions)

data["edition_number"] = edition_number
data["totalArticles"] = data.get("totalArticles") or article_count

latest_path = public_dir / "data.json"
edition_data_path = edition_dir / "data.json"
meta_path = edition_dir / "meta.json"

with latest_path.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

with edition_data_path.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

published_at = datetime.now(timezone.utc).isoformat()
meta = {
    "date": date_key,
    "generated": generated,
    "published_at": published_at,
    "edition_number": edition_number,
    "article_count": article_count,
    "top_story": top_story,
    "headline": data.get("headline") or top_story,
    "data_url": f"/legacy/{year}/{month}/{day}/data.json",
    "legacy_html_url": f"/legacy/{year}/{month}/{day}/index.html",
    "react_url": f"/?edition={date_key}",
    "source_file": str(input_json),
    "model": (
        os.environ.get("BRAKEFAST_LLM_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or os.environ.get("OPENROUTER_MODEL")
        or ""
    ),
}

with meta_path.open("w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

print(f"Published latest JSON: {latest_path}")
print(f"Published edition snapshot: {edition_data_path}")
print(f"Published edition meta: {meta_path}")
PYTHON_SCRIPT

if [ -f "${SCRIPT_DIR}/generate-archive.sh" ]; then
  bash "${SCRIPT_DIR}/generate-archive.sh"
fi
