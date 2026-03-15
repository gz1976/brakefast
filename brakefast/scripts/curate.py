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
import re
import subprocess
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

BASE = "/data/.openclaw/workspace/brakefast"
OUTPUT = os.path.join(BASE, "output")
RAW_FILE = os.path.join(OUTPUT, "raw-articles.json")
ENRICHED_FILE = os.path.join(OUTPUT, "enriched-articles.json")
CURATED_FILE = os.path.join(OUTPUT, "curated-articles.json")
CALENDAR_FILE = os.path.join(OUTPUT, "calendar-events.json")
PUBLIC_DIR = os.environ.get("BRAKEFAST_PUBLIC_DIR", "/data/brakefast-public")
EDITIONS_DIR = os.path.join(PUBLIC_DIR, "editions")

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

WORD_OF_DAY_LIBRARY = [
    {"word": "Serendipität", "explanation": "Die glückliche Entdeckung von etwas Wertvollem, nach dem man gar nicht gezielt gesucht hat.", "origin": "Aus dem Englischen 'serendipity', geprägt nach dem Märchen 'The Three Princes of Serendip'."},
    {"word": "Fernweh", "explanation": "Die starke Sehnsucht, in die Ferne zu reisen und neue Orte zu entdecken.", "origin": "Deutsche Wortbildung analog zu 'Heimweh'."},
    {"word": "Schockverliebt", "explanation": "Plötzlich und heftig von jemandem oder etwas begeistert sein.", "origin": "Moderne deutsche Zusammensetzung aus 'Schock' und 'verliebt'."},
    {"word": "Weltschmerz", "explanation": "Melancholie über die Unvollkommenheit der Welt und das Auseinanderklaffen von Ideal und Wirklichkeit.", "origin": "Literarischer Begriff aus der deutschen Romantik."},
    {"word": "Tüftlergeist", "explanation": "Freude daran, Dinge geduldig auszuprobieren, zu verbessern und kreativ zu lösen.", "origin": "Deutsche Zusammensetzung aus 'tüfteln' und 'Geist'."},
    {"word": "Waldeinsamkeit", "explanation": "Das besondere Gefühl stiller Abgeschiedenheit in der Natur.", "origin": "Berühmt geworden durch die deutsche Romantik."},
    {"word": "Morgenrot", "explanation": "Das rötliche Licht des Himmels kurz vor Sonnenaufgang; oft auch Sinnbild für Aufbruch.", "origin": "Altes deutsches Naturwort."},
    {"word": "Fingerspitzengefühl", "explanation": "Die Fähigkeit, in heiklen Situationen mit Takt und Feingefühl zu handeln.", "origin": "Bildhafte deutsche Komposition."},
    {"word": "Gedankenexperiment", "explanation": "Ein gedanklich durchgespieltes Szenario, um Ideen oder Theorien zu prüfen.", "origin": "Aus Philosophie und Naturwissenschaft verbreitet."},
    {"word": "Aufbruchsstimmung", "explanation": "Das kollektive Gefühl, dass etwas Neues beginnt und man loslegen will.", "origin": "Deutsche Zusammensetzung aus 'Aufbruch' und 'Stimmung'."},
    {"word": "Kopfkino", "explanation": "Lebhafte innere Bilder oder Vorstellungen, die vor dem geistigen Auge ablaufen.", "origin": "Umgangssprachliche deutsche Metapher."},
    {"word": "Zeitgeist", "explanation": "Die prägenden Ideen, Haltungen und Vorlieben einer bestimmten Epoche.", "origin": "Deutscher Begriff, international übernommen."},
]

MEDIA_TIP_CATALOG = [
    {"title": "Hard Fork", "type": "Podcast", "source": "New York Times", "url": "https://www.nytimes.com/column/hard-fork", "duration": "ca. 1h", "topics": ["ai", "tech", "internet", "media"], "rank": 10},
    {"title": "Acquired", "type": "Podcast", "source": "Acquired", "url": "https://www.acquired.fm/", "duration": "ca. 3h", "topics": ["business", "tech", "company", "strategy"], "rank": 9},
    {"title": "Decoder", "type": "Podcast", "source": "The Verge", "url": "https://www.theverge.com/decoder-podcast-with-nilay-patel", "duration": "ca. 1h", "topics": ["ai", "platform", "product", "tech"], "rank": 9},
    {"title": "Dwarkesh Podcast", "type": "Podcast", "source": "Dwarkesh Patel", "url": "https://www.dwarkesh.com/podcast", "duration": "ca. 2h", "topics": ["ai", "science", "economics", "future"], "rank": 9},
    {"title": "Darknet Diaries", "type": "Podcast", "source": "Jack Rhysider", "url": "https://darknetdiaries.com/", "duration": "ca. 1h", "topics": ["security", "cyber", "hacking", "privacy"], "rank": 10},
    {"title": "Search Engine", "type": "Podcast", "source": "PJ Vogt", "url": "https://pjvogt.substack.com/p/search-engine", "duration": "ca. 1h", "topics": ["internet", "culture", "media", "technology"], "rank": 8},
    {"title": "The Ezra Klein Show", "type": "Podcast", "source": "New York Times", "url": "https://www.nytimes.com/column/ezra-klein-podcast", "duration": "ca. 1h", "topics": ["world", "politics", "society", "ideas"], "rank": 8},
    {"title": "Lex Fridman Podcast", "type": "Podcast", "source": "Lex Fridman", "url": "https://lexfridman.com/podcast/", "duration": "ca. 2h", "topics": ["ai", "science", "robotics", "founders"], "rank": 7},
]

HISTORY_STOP_TITLES = {
    "der", "die", "das", "ein", "eine", "einer", "einem", "einen",
    "erste", "erster", "erstes", "ersten", "erstmals",
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


def split_sentences(text):
    if not text:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]


def build_history_fallback_description(fact):
    year = fact.get("year", "Unbekannt")
    text = fact.get("text", "Historisches Ereignis")
    return (
        f"{text}. "
        f"Das Ereignis jährt sich heute und markiert einen bemerkenswerten Moment des Jahres {year}."
    )


def fetch_wikipedia_summary(title, timeout=5):
    if not title:
        return None
    try:
        encoded = urllib.parse.quote(title.replace(" ", "_"))
        url = f"https://de.wikipedia.org/api/rest_v1/page/summary/{encoded}"
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), "-A", "BrakeFast/1.0", url],
            capture_output=True,
            text=True,
            timeout=timeout + 2,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def search_wikipedia_title(query, timeout=5):
    if not query:
        return None
    try:
        encoded = urllib.parse.quote(query)
        url = (
            "https://de.wikipedia.org/w/api.php?"
            f"action=opensearch&search={encoded}&limit=1&namespace=0&format=json"
        )
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), "-A", "BrakeFast/1.0", url],
            capture_output=True,
            text=True,
            timeout=timeout + 2,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        data = json.loads(result.stdout)
        titles = data[1] if isinstance(data, list) and len(data) > 1 else []
        return titles[0] if titles else None
    except Exception:
        return None


def fetch_wikipedia_page_image(title, timeout=5):
    if not title:
        return None
    try:
        encoded = urllib.parse.quote(title.replace(" ", "_"))
        url = (
            "https://de.wikipedia.org/w/api.php?"
            f"action=query&prop=pageimages&piprop=thumbnail&pithumbsize=600&titles={encoded}&format=json"
        )
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), "-A", "BrakeFast/1.0", url],
            capture_output=True,
            text=True,
            timeout=timeout + 2,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        data = json.loads(result.stdout)
        pages = (data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            thumb = (page.get("thumbnail") or {}).get("source")
            if thumb:
                return thumb
        return None
    except Exception:
        return None


def search_wikimedia_image(title, timeout=5):
    if not title:
        return None
    try:
        query = urllib.parse.quote(title)
        url = (
            "https://commons.wikimedia.org/w/api.php?"
            f"action=query&generator=search&gsrsearch={query}&gsrnamespace=6&gsrlimit=5"
            "&prop=imageinfo&iiprop=url|mime&iiurlwidth=600&format=json"
        )
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), "-A", "BrakeFast/1.0", url],
            capture_output=True,
            text=True,
            timeout=timeout + 2,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        data = json.loads(result.stdout)
        pages = (data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            imageinfo = page.get("imageinfo") or []
            if not imageinfo:
                continue
            info = imageinfo[0]
            mime = info.get("mime", "")
            if mime not in ("image/jpeg", "image/png"):
                continue
            thumb = info.get("thumburl")
            if thumb:
                return thumb
        return None
    except Exception:
        return None


def build_history_search_candidates(fact):
    candidates = []
    wiki = (fact.get("wiki") or "").strip()
    text = (fact.get("text") or "").strip()
    if wiki:
        candidates.append(wiki)
    if text:
        candidates.append(text)
        candidates.append(text.split(" — ")[0].strip())
        candidates.append(text.split(":")[0].strip())
        candidates.append(re.sub(r"\([^)]*\)", "", text).strip())
        proper_nouns = re.findall(r"\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+){0,3}", text)
        candidates.extend(proper_nouns[:3])

    deduped = []
    seen = set()
    for candidate in candidates:
        candidate = re.sub(r"\s+", " ", candidate).strip(" -–—,:;.")
        candidate = re.sub(r"^(Der|Die|Das|Ein|Eine|Einer|Einem|Einen)\s+", "", candidate)
        candidate = re.sub(r"^(erste|erster|erstes|ersten|erstmals)\s+", "", candidate, flags=re.IGNORECASE)
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(candidate[:120])
    return deduped


def is_bad_history_title(title):
    if not title:
        return True
    normalized = title.strip().lower()
    if normalized in HISTORY_STOP_TITLES:
        return True
    if len(normalized) <= 2:
        return True
    return False


def choose_word_of_day(spec_word, now):
    if isinstance(spec_word, dict) and spec_word.get("word") and spec_word.get("explanation"):
        return spec_word
    idx = now.toordinal() % len(WORD_OF_DAY_LIBRARY)
    return WORD_OF_DAY_LIBRARY[idx]


def load_recent_media_tips(limit=7):
    paths = sorted(Path(EDITIONS_DIR).glob("*/*/*/data.json"), reverse=True)
    recent = []
    for path in paths[:limit]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        tip = ((data.get("morning_tiles") or {}).get("media_tip")) or {}
        if tip.get("title") and tip.get("source"):
            recent.append(tip)
    return recent


def build_media_context(spec, source_articles):
    parts = [spec.get("editorial", "")]
    for category_articles in (spec.get("categories") or {}).values():
        if isinstance(category_articles, dict):
            category_articles = category_articles.get("articles", [])
        if not isinstance(category_articles, list):
            continue
        for item in category_articles[:2]:
            if isinstance(item, dict):
                parts.append(item.get("title", ""))
                parts.append(item.get("summary", ""))
                parts.append(item.get("description", ""))
    for article in source_articles[:12]:
        if isinstance(article, dict):
            parts.append(article.get("title", ""))
            parts.append(article.get("source", ""))
    return " ".join(parts).lower()


def validate_media_tip(tip):
    if not isinstance(tip, dict):
        return False
    return bool(tip.get("title") and tip.get("source") and tip.get("type"))


def score_media_tip(entry, context_text, recent_tips):
    score = entry.get("rank", 0) * 10
    for topic in entry.get("topics", []):
        if topic in context_text:
            score += 4
    recent_titles = {tip.get("title", "").lower() for tip in recent_tips}
    recent_sources = [tip.get("source", "").lower() for tip in recent_tips]
    if entry["title"].lower() in recent_titles:
        score -= 20
    score -= recent_sources.count(entry["source"].lower()) * 8
    return score


def choose_media_tip(spec_tip, spec, source_articles):
    recent_tips = load_recent_media_tips()
    recent_titles = {tip.get("title", "").lower() for tip in recent_tips}
    recent_sources = [tip.get("source", "").lower() for tip in recent_tips]

    if validate_media_tip(spec_tip):
        title = spec_tip.get("title", "").lower()
        source = spec_tip.get("source", "").lower()
        repeated_title = title in recent_titles
        repeated_source = recent_sources.count(source) >= 2
        generic_lex = "lex fridman" in source
        if not (repeated_title or repeated_source or generic_lex):
            return spec_tip

    context_text = build_media_context(spec, source_articles)
    ranked = sorted(
        MEDIA_TIP_CATALOG,
        key=lambda entry: score_media_tip(entry, context_text, recent_tips),
        reverse=True,
    )
    chosen = ranked[0]
    return {
        "title": chosen["title"],
        "type": chosen["type"],
        "source": chosen["source"],
        "url": chosen["url"],
        "duration": chosen["duration"],
    }


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
    for raw_fact in facts:
        fact = dict(raw_fact)
        wiki_title = (fact.get("wiki") or "").strip()
        if is_bad_history_title(wiki_title):
            fact.pop("wiki", None)
            fact.pop("url", None)
            fact.pop("image", None)
            fact.pop("description", None)
            wiki_title = ""
        summary_data = fetch_wikipedia_summary(wiki_title) if wiki_title else None

        if not summary_data:
            for candidate in build_history_search_candidates(fact):
                resolved_title = search_wikipedia_title(candidate)
                if not resolved_title or is_bad_history_title(resolved_title):
                    continue
                wiki_title = resolved_title
                summary_data = fetch_wikipedia_summary(resolved_title)
                if summary_data:
                    fact["wiki"] = resolved_title
                    break

        if summary_data:
            thumbnail = summary_data.get("thumbnail", {}).get("source")
            if not thumbnail:
                thumbnail = fetch_wikipedia_page_image(fact.get("wiki") or wiki_title)
            if not thumbnail:
                thumbnail = search_wikimedia_image(fact.get("wiki") or wiki_title)
            if thumbnail:
                fact["image"] = thumbnail
            page_url = summary_data.get("content_urls", {}).get("desktop", {}).get("page")
            if page_url:
                fact["url"] = page_url
            extract = summary_data.get("extract", "")
            if extract:
                sentences = split_sentences(extract)
                fact["description"] = " ".join(sentences[:2]) if sentences else extract

        if not fact.get("description"):
            fact["description"] = build_history_fallback_description(fact)
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
    word_of_day_widget = choose_word_of_day(sw.get("word_of_day"), now)
    bauernregel_default = {"text": "Wie der März, so der Herbst", "meaning": "Das Märzwetter gibt Hinweise auf den Herbst"}
    bauernregel_widget = sw.get("bauernregel") or bauernregel_default
    if not bauernregel_widget.get("text"):
        bauernregel_widget = bauernregel_default
    namenstag = sw.get("namenstag") or day_info_widget.get("namenstag", "")
    if namenstag:
        day_info_widget["namenstag"] = namenstag
    morning_tiles = dict(spec.get("morning_tiles", {}))
    morning_tiles["media_tip"] = choose_media_tip(morning_tiles.get("media_tip"), spec, source_articles)

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
            "word_of_day": word_of_day_widget,
        },
        "categories": categories,
        "ki_modelle": spec.get("ki_modelle", {}),
        "dev_digest": spec.get("dev_digest", {}),
        "morning_tiles": morning_tiles,
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
