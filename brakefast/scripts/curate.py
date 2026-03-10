#!/usr/bin/env python3
"""
BrakeFast Curate — Assembles curated-articles.json from model instructions.

The AI model provides a compact "curation spec" JSON via stdin with:
- Article selections (by index into raw-articles.json) + summaries
- Editorial, ki_modelle, dev_digest, morning_tiles, widgets (quote, history, bauernregel)

This script handles all mechanical/data-fetching work:
- Weather from wttr.in
- VPS stats (df, docker, uptime)
- Calendar events from file
- Pollen seasonal estimate
- dayInfo (sunrise/sunset)
- Edition number auto-increment
- Full JSON assembly

Usage:
  python3 curate.py < curation-spec.json
  # or pipe from heredoc:
  cat <<'SPEC' | python3 curate.py
  { "editorial": "...", "categories": { ... } }
  SPEC
"""

import json
import sys
import os
import subprocess
import urllib.request
import urllib.parse
from datetime import datetime, timezone

BASE = "/data/.openclaw/workspace/brakefast"
OUTPUT = os.path.join(BASE, "output")
RAW_FILE = os.path.join(OUTPUT, "raw-articles.json")
ENRICHED_FILE = os.path.join(OUTPUT, "enriched-articles.json")
CURATED_FILE = os.path.join(OUTPUT, "curated-articles.json")
CALENDAR_FILE = os.path.join(OUTPUT, "calendar-events.json")

CATEGORY_META = {
    "ai":       {"name": "AI & Machine Learning", "emoji": "\U0001f916", "css_class": "category-header--ai"},
    "security": {"name": "Security & Privacy",    "emoji": "\U0001f512", "css_class": "category-header--security"},
    "tech":     {"name": "Tech & Dev",             "emoji": "\U0001f4bb", "css_class": "category-header--tech"},
    "ev":       {"name": "Elektromobilit\u00e4t",  "emoji": "\u26a1",     "css_class": "category-header--ev"},
    "world":    {"name": "Welt & Politik",         "emoji": "\U0001f30d", "css_class": "category-header--world"},
    "local":    {"name": "Steiermark & Lokal",     "emoji": "\U0001f3d4", "css_class": "category-header--local"},
}

POLLEN_SEASONAL = {
    1:  {"level": "niedrig",     "types": ["Hasel", "Erle"],            "description": "Geringe Belastung durch Fr\u00fchbl\u00fcher"},
    2:  {"level": "niedrig-mittel", "types": ["Hasel", "Erle"],         "description": "Fr\u00fchbl\u00fcher werden aktiv"},
    3:  {"level": "mittel",      "types": ["Birke", "Esche", "Hasel"],  "description": "Birke und Esche beginnen zu bl\u00fchen"},
    4:  {"level": "mittel-hoch", "types": ["Birke", "Esche"],           "description": "Birke auf H\u00f6hepunkt"},
    5:  {"level": "hoch",        "types": ["Gr\u00e4ser", "Roggen"],    "description": "Gr\u00e4serpollen-Saison beginnt"},
    6:  {"level": "hoch",        "types": ["Gr\u00e4ser", "Roggen"],    "description": "H\u00f6hepunkt Gr\u00e4serpollen"},
    7:  {"level": "mittel-hoch", "types": ["Gr\u00e4ser"],              "description": "Gr\u00e4serpollen l\u00e4sst nach"},
    8:  {"level": "mittel",      "types": ["Beifu\u00df", "Ragweed"],   "description": "Beifu\u00df und Ragweed aktiv"},
    9:  {"level": "niedrig-mittel", "types": ["Ragweed"],               "description": "Sp\u00e4tbl\u00fcher klingen ab"},
    10: {"level": "niedrig",     "types": [],                           "description": "Kaum noch Pollenbelastung"},
    11: {"level": "niedrig",     "types": [],                           "description": "Keine nennenswerte Belastung"},
    12: {"level": "niedrig",     "types": [],                           "description": "Keine nennenswerte Belastung"},
}


def run(cmd, default=""):
    """Run a shell command, return stdout or default on failure."""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        return r.stdout.strip() if r.returncode == 0 else default
    except Exception:
        return default


def fetch_weather():
    """Fetch weather from wttr.in for Voitsberg."""
    try:
        raw = run('curl -s "wttr.in/Voitsberg?format=j1"')
        if not raw:
            return None, None
        w = json.loads(raw)
        c = w["current_condition"][0]
        f = w.get("weather", [{}])[0]
        a = f.get("astronomy", [{}])[0]

        temp = int(c["temp_C"])
        weather = {
            "temp": temp,
            "description": c["weatherDesc"][0]["value"],
            "feelsLike": int(c["FeelsLikeC"]),
            "min": int(f.get("mintempC", c["temp_C"])),
            "max": int(f.get("maxtempC", c["temp_C"])),
            "icon": "\u2600\ufe0f" if temp > 20 else "\u26c5" if temp > 5 else "\U0001f324\ufe0f",
            "location": "Voitsberg",
        }
        day_info = {
            "sunrise": a.get("sunrise", "").strip(),
            "sunset": a.get("sunset", "").strip(),
        }
        # Calculate day length
        try:
            from datetime import datetime as dt
            fmt = "%I:%M %p"
            sr = dt.strptime(day_info["sunrise"], fmt)
            ss = dt.strptime(day_info["sunset"], fmt)
            diff = ss - sr
            h, m = divmod(int(diff.total_seconds()) // 60, 60)
            day_info["dayLength"] = f"{h}h {m:02d}m"
        except Exception:
            day_info["dayLength"] = ""
        return weather, day_info
    except Exception as e:
        print(f"WARN: Weather fetch failed: {e}", file=sys.stderr)
        return None, None


def fetch_vps():
    """Get VPS stats."""
    disk = run("df -h / | awk 'NR==2{print $5, \"von\", $2}'", "? von ?")
    containers = run("docker ps -q 2>/dev/null | wc -l", "0").strip()
    uptime_since = run("uptime -s 2>/dev/null", "")
    return {
        "disk": disk,
        "uptime": uptime_since,
        "containers": int(containers) if containers.isdigit() else 0,
    }


def get_edition_number():
    """Read last edition number and increment."""
    try:
        with open(CURATED_FILE) as f:
            prev = json.load(f).get("edition_number", 0)
        return prev + 1
    except Exception:
        # Check archived editions
        try:
            import glob
            archives = sorted(glob.glob(os.path.join(OUTPUT, "curated-articles.*.json")))
            if archives:
                with open(archives[-1]) as f:
                    prev = json.load(f).get("edition_number", 0)
                return prev + 1
        except Exception:
            pass
        return 1


def load_calendar():
    """Load calendar events from file."""
    try:
        with open(CALENDAR_FILE) as f:
            events = json.load(f)
        return events if isinstance(events, list) else []
    except Exception:
        return []


def load_articles_from_file(path):
    """Load articles from a categorized or flat JSON file."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        articles = []
        cats = data.get("categories", data)
        for cat_key, cat_data in cats.items():
            if isinstance(cat_data, dict) and "articles" in cat_data:
                for art in cat_data["articles"]:
                    art["_raw_category"] = cat_key
                    articles.append(art)
            elif isinstance(cat_data, list):
                for art in cat_data:
                    art["_raw_category"] = cat_key
                    articles.append(art)
        return articles
    return []


def load_article_pool():
    """Prefer enriched briefings, fall back to raw feed articles."""
    if os.path.exists(ENRICHED_FILE):
        return load_articles_from_file(ENRICHED_FILE), ENRICHED_FILE
    return load_articles_from_file(RAW_FILE), RAW_FILE


def build_article_payload(item, source_article):
    """Merge curated overrides with enriched/raw article data."""
    base = source_article or {}

    def pick(*keys, default=""):
        for key in keys:
            if key in item and item.get(key) not in (None, "", []):
                return item.get(key)
            if key in base and base.get(key) not in (None, "", []):
                return base.get(key)
        return default

    article = {
        "title": pick("headline", "title"),
        "headline": pick("headline", "title"),
        "link": pick("canonical_url", "source_url", "link"),
        "canonical_url": pick("canonical_url", "source_url", "link"),
        "source": pick("source"),
        "date": pick("published_at", "date"),
        "published_at": pick("published_at", "date"),
        "image": pick("image", "best_image"),
        "best_image": pick("best_image", "image"),
        "description": pick("description", "dek"),
        "dek": pick("dek", "description"),
        "briefing_blurb": pick("briefing_blurb", "dek", "description"),
        "summary": pick("summary", "briefing_blurb", "dek", "description"),
        "bullet_points": pick("bullet_points", default=[]),
        "why_it_matters": pick("why_it_matters", "otto_comment"),
        "otto_comment": pick("why_it_matters", "otto_comment"),
        "author": pick("author"),
        "topics": pick("topics", default=[]),
        "entities": pick("entities", default=[]),
        "reading_time_minutes": item.get(
            "reading_time_minutes",
            base.get("reading_time_minutes", 2),
        ),
        "relevance_score": item.get(
            "relevance_score",
            base.get("relevance_score", 0.5),
        ),
        "summary_quality_score": item.get(
            "summary_quality_score",
            base.get("summary_quality_score"),
        ),
        "image_quality_score": item.get(
            "image_quality_score",
            base.get("image_quality_score"),
        ),
        "content_quality": pick("content_quality"),
        "source_url": pick("source_url", "link"),
        "discussion_url": pick("discussion_url"),
    }

    if base.get("full_text") and not item.get("full_text"):
        article["full_text"] = base.get("full_text")

    return article


def enrich_history(facts):
    """Enrich history facts with Wikipedia thumbnails, URLs, and descriptions."""
    if not facts:
        return facts
    enriched = []
    for fact in facts:
        wiki_title = fact.get("wiki", "")
        if wiki_title and not fact.get("image"):
            try:
                encoded = urllib.parse.quote(wiki_title.replace(" ", "_"))
                url = f"https://de.wikipedia.org/api/rest_v1/page/summary/{encoded}"
                req = urllib.request.Request(url, headers={"User-Agent": "BrakeFast/1.0"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read())
                if "thumbnail" in data:
                    fact["image"] = data["thumbnail"]["source"]
                if "content_urls" in data:
                    fact["url"] = data["content_urls"]["desktop"]["page"]
                if "extract" in data and not fact.get("description"):
                    # First 2 sentences as description
                    extract = data["extract"]
                    sentences = extract.split(". ")
                    fact["description"] = ". ".join(sentences[:2]).rstrip(".") + "."
            except Exception as e:
                print(f"WARN: Wikipedia lookup failed for '{wiki_title}': {e}", file=sys.stderr)
        enriched.append(fact)
    return enriched


def build_curated(spec, source_articles):
    """Build the full curated-articles.json from curated spec + article pool."""
    now = datetime.now(timezone.utc)

    # Edition number
    edition = spec.get("edition_number") or get_edition_number()

    # Weather + dayInfo
    weather_data, day_info_data = fetch_weather()
    weather_widget = spec.get("widgets", {}).get("weather") or weather_data or {
        "temp": 0, "description": "Keine Wetterdaten", "feelsLike": 0,
        "min": 0, "max": 0, "icon": "\u2601\ufe0f", "location": "Voitsberg"
    }
    day_info_widget = spec.get("widgets", {}).get("dayInfo") or {}
    if day_info_data:
        day_info_widget.setdefault("sunrise", day_info_data.get("sunrise", ""))
        day_info_widget.setdefault("sunset", day_info_data.get("sunset", ""))
        day_info_widget.setdefault("dayLength", day_info_data.get("dayLength", ""))

    # Pollen
    month = now.month
    pollen_widget = spec.get("widgets", {}).get("pollen") or POLLEN_SEASONAL.get(month, POLLEN_SEASONAL[1])

    # VPS
    vps_widget = spec.get("widgets", {}).get("vps") or fetch_vps()

    # Calendar
    calendar_widget = spec.get("widgets", {}).get("calendar") or load_calendar()

    # Model-provided widgets (use defaults if model sends empty dicts)
    sw = spec.get("widgets", {})
    quote_default = {"text": "The best way to predict the future is to invent it.", "author": "Alan Kay"}
    quote_widget = sw.get("quote") or quote_default
    if not quote_widget.get("text"):
        quote_widget = quote_default
    history_widget = enrich_history(sw.get("history") or [])
    bauernregel_default = {"text": "Wie der März, so der Herbst", "meaning": "Das Märzwetter gibt Hinweise auf den Herbst"}
    bauernregel_widget = sw.get("bauernregel") or bauernregel_default
    if not bauernregel_widget.get("text"):
        bauernregel_widget = bauernregel_default
    namenstag = sw.get("namenstag") or day_info_widget.get("namenstag", "")
    if namenstag:
        day_info_widget["namenstag"] = namenstag

    # Build categories from spec
    categories = {}
    total_articles = 0
    total_reading_time = 0

    for cat_key, cat_meta in CATEGORY_META.items():
        cat_spec = spec.get("categories", {}).get(cat_key, [])
        articles = []
        for item in cat_spec:
            # Item can reference article pool by index or contain full article data
            if "index" in item and isinstance(item["index"], int):
                idx = item["index"]
                if 0 <= idx < len(source_articles):
                    articles.append(build_article_payload(item, source_articles[idx]))
            else:
                articles.append(build_article_payload(item, {}))

        total_articles += len(articles)
        for a in articles:
            total_reading_time += a.get("reading_time_minutes", 2)

        categories[cat_key] = {
            "name": cat_meta["name"],
            "emoji": cat_meta["emoji"],
            "css_class": cat_meta["css_class"],
            "articles": articles,
        }

    # Assemble final JSON
    result = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalArticles": total_articles,
        "edition_number": edition,
        "reading_time_total": max(1, total_reading_time // 6),  # rough average
        "editorial": spec.get("editorial", ""),
        "widgets": {
            "weather": weather_widget,
            "dayInfo": day_info_widget,
            "calendar": calendar_widget,
            "quote": quote_widget,
            "history": history_widget,
            "bauernregel": bauernregel_widget,
            "pollen": pollen_widget,
            "vps": vps_widget,
        },
        "categories": categories,
        "ki_modelle": spec.get("ki_modelle", {}),
        "dev_digest": spec.get("dev_digest", {}),
        "morning_tiles": spec.get("morning_tiles", {}),
    }

    # Headlines from top articles
    headlines = spec.get("headlines", [])
    if headlines:
        result["headlines"] = headlines

    return result


def main():
    # Read curation spec from stdin
    spec_text = sys.stdin.read()
    if not spec_text.strip():
        print("ERROR: No curation spec provided on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        spec = json.loads(spec_text)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in curation spec: {e}", file=sys.stderr)
        sys.exit(1)

    # Load article pool
    try:
        source_articles, source_file = load_article_pool()
        print(f"Loaded {len(source_articles)} source articles from {source_file}")
    except FileNotFoundError:
        print(f"ERROR: Neither {ENRICHED_FILE} nor {RAW_FILE} found", file=sys.stderr)
        sys.exit(1)

    # Build curated JSON
    result = build_curated(spec, source_articles)

    # Write output
    with open(CURATED_FILE, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Wrote curated-articles.json: {result['totalArticles']} articles, edition #{result['edition_number']}")

    # Archive a copy
    date_str = datetime.now().strftime("%Y-%m-%d")
    archive_file = os.path.join(OUTPUT, f"curated-articles.{date_str}.json")
    with open(archive_file, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Archived: {archive_file}")


if __name__ == "__main__":
    main()
