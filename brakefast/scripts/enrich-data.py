#!/usr/bin/env python3
"""
BrakeFast — Data Enrichment Safety Net
Adds missing fields to data.json if Otto's curation didn't provide them.
Runs as Step 3.6 in brakefast-daily.sh, AFTER Step 3.5 (JSON copy).
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone

DATA_FILE = "/data/brakefast-public/data.json"


# ─── Weather icon mapping (text → emoji) ───
WEATHER_ICON_MAP = {
    "cloud": "☁️", "clouds": "☁️", "cloudy": "☁️", "overcast": "☁️",
    "sun": "☀️", "sunny": "☀️", "clear": "☀️",
    "rain": "🌧️", "rainy": "🌧️", "drizzle": "🌧️",
    "snow": "❄️", "snowy": "❄️", "partly": "⛅",
}


def fetch_wikipedia_thumbnail(url, timeout=8):
    """Fetch thumbnail image URL from a Wikipedia page URL via REST API."""
    if not url or "wikipedia.org" not in url:
        return None
    try:
        # Extract page title from URL: .../wiki/Title -> Title
        match = re.search(r"/wiki/(.+)$", url)
        if not match:
            return None
        title = match.group(1)
        # Determine language from URL
        lang_match = re.search(r"//(\w+)\.wikipedia", url)
        lang = lang_match.group(1) if lang_match else "de"
        api_url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
        raw = run(f'curl -s -L -H "Accept: application/json" "{api_url}"', timeout=timeout)
        if not raw:
            return None
        data = json.loads(raw)
        thumb = data.get("thumbnail", {}).get("source")
        if not thumb and lang != "en":
            # Fallback: try English Wikipedia
            en_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
            raw_en = run(f'curl -s -L -H "Accept: application/json" "{en_url}"', timeout=timeout)
            if raw_en:
                data_en = json.loads(raw_en)
                thumb = data_en.get("thumbnail", {}).get("source")
        if thumb:
            # Request a larger thumbnail (default is small)
            thumb = re.sub(r"/\d+px-", "/600px-", thumb)
        return thumb
    except Exception as e:
        print(f"  WARN: Wikipedia thumbnail fetch failed for {url}: {e}", file=sys.stderr)
        return None


def run(cmd, timeout=10):
    """Run shell command and return stdout."""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def _extract_jsonld_image(html_text):
    """Find an image URL inside any application/ld+json schema.org block."""
    try:
        import json as _json
    except ImportError:
        return None
    for match in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.+?)</script>',
        html_text, re.DOTALL | re.IGNORECASE,
    ):
        try:
            data = _json.loads(match.group(1).strip())
        except Exception:
            continue
        candidates = data if isinstance(data, list) else [data]
        for entry in candidates:
            if not isinstance(entry, dict):
                continue
            img = entry.get("image")
            if isinstance(img, str):
                return img
            if isinstance(img, dict):
                url_val = img.get("url") or img.get("contentUrl")
                if isinstance(url_val, str):
                    return url_val
            if isinstance(img, list) and img:
                first = img[0]
                if isinstance(first, str):
                    return first
                if isinstance(first, dict):
                    url_val = first.get("url") or first.get("contentUrl")
                    if isinstance(url_val, str):
                        return url_val
    return None


def fetch_og_image(url, timeout=8):
    """Fetch a representative image from an article URL.

    Tries og:image, twitter:image, then schema.org JSON-LD image. Uses a
    realistic Chrome user-agent + Accept headers and pulls a larger HTML
    window than before so meta tags emitted late in <head> (common with
    SPAs) still get caught.
    """
    if not url or not url.startswith("http"):
        return None
    try:
        cmd = (
            'curl -s -L --max-time %d '
            '-H "User-Agent: %s" '
            '-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" '
            '-H "Accept-Language: de-AT,de;q=0.9,en;q=0.8" '
            '"%s" | head -c 200000'
        ) % (timeout, CHROME_UA, url)
        raw = run(cmd, timeout=timeout + 2)
        if not raw:
            return None
        patterns = [
            re.compile(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)', re.IGNORECASE),
            re.compile(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', re.IGNORECASE),
            re.compile(r'<meta[^>]*name=["\']twitter:image(?::src)?["\'][^>]*content=["\']([^"\']+)', re.IGNORECASE),
            re.compile(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image(?::src)?["\']', re.IGNORECASE),
        ]
        for pat in patterns:
            m = pat.search(raw)
            if m and not is_bad_image(m.group(1).strip()):
                return m.group(1).strip()
        jsonld_img = _extract_jsonld_image(raw)
        if jsonld_img and not is_bad_image(jsonld_img):
            return jsonld_img
        return None
    except Exception as e:
        print("  WARN: OG image fetch failed for %s: %s" % (url, e), file=sys.stderr)
        return None


# Bad image patterns (kept in sync with brakefast-react/src/utils/imageUtils.ts).
# Substring matches first; precise regex matches second to avoid false positives
# (e.g. "1x1" as a substring would otherwise reject Google asset names like
# "Group_Icons_1x1.max-1440x810.png").
BAD_IMAGE_SUBSTRINGS = [
    "wikia.nocookie", "chatgpt", "screenshot", "placeholder", "avatar",
    "favicon", "pixel.gif", "spacer.gif", "blank.", "arxiv-logo",
    "logo", "gravatar.com", "feedburner", "/embed/",
    "upload.wikimedia", "wikipedia.org",
]
# Regex patterns: tracking-pixel-shaped URLs only. "1x1" must sit immediately
# before a file extension (no real-size suffix between), preceded by /, _, or -.
BAD_IMAGE_REGEXES = [
    re.compile(r"(?i)(?:^|[/_-])1x1\.(?:gif|png|jpe?g|webp)(?:[?#]|$)"),
]


def is_bad_image(url):
    """Check if image URL is bad/fake."""
    if not url or len(url) < 20:
        return True
    lowered = url.lower()
    for sub in BAD_IMAGE_SUBSTRINGS:
        if sub in lowered:
            return True
    for rx in BAD_IMAGE_REGEXES:
        if rx.search(url):
            return True
    return False


def fetch_weather():
    """Fetch current weather for Voitsberg via wttr.in."""
    try:
        raw = run('curl -s "wttr.in/Voitsberg?format=j1"', timeout=15)
        if not raw:
            return None
        w = json.loads(raw)
        cur = w.get("current_condition", [{}])[0]
        today = w.get("weather", [{}])[0]
        temp = int(cur.get("temp_C", 0))
        feels = int(cur.get("FeelsLikeC", temp))
        desc_de = cur.get("lang_de", [{}])
        desc = desc_de[0].get("value", cur.get("weatherDesc", [{}])[0].get("value", "")) if desc_de else cur.get("weatherDesc", [{}])[0].get("value", "")
        return {
            "temp": temp,
            "description": desc,
            "feelsLike": feels,
            "min": int(today.get("mintempC", temp - 3)),
            "max": int(today.get("maxtempC", temp + 5)),
            "icon": WEATHER_ICON_MAP.get(cur.get("weatherDesc", [{}])[0].get("value", "").lower().split()[0], "☁️"),
            "location": "Voitsberg"
        }
    except Exception as e:
        print(f"  WARN: Weather fetch failed: {e}", file=sys.stderr)
        return None


def fetch_dayinfo():
    """Fetch sunrise/sunset for Voitsberg."""
    try:
        raw = run('curl -s "wttr.in/Voitsberg?format=j1"', timeout=15)
        if not raw:
            return None
        w = json.loads(raw)
        astro = w.get("weather", [{}])[0].get("astronomy", [{}])[0]
        sunrise = astro.get("sunrise", "06:30")
        sunset = astro.get("sunset", "17:45")
        # Convert 12h to 24h format
        for fmt_in, fmt_out in [("%I:%M %p", "%H:%M"), ("%I:%M%p", "%H:%M")]:
            try:
                sunrise = datetime.strptime(sunrise.strip(), fmt_in).strftime(fmt_out)
                sunset = datetime.strptime(sunset.strip(), fmt_in).strftime(fmt_out)
                break
            except ValueError:
                continue
        # Calculate day length
        try:
            s_h, s_m = map(int, sunrise.split(":"))
            e_h, e_m = map(int, sunset.split(":"))
            total_min = (e_h * 60 + e_m) - (s_h * 60 + s_m)
            day_length = f"{total_min // 60}h {total_min % 60}m"
        except Exception:
            day_length = None
        return {
            "sunrise": sunrise,
            "sunset": sunset,
            "dayLength": day_length
        }
    except Exception as e:
        print(f"  WARN: DayInfo fetch failed: {e}", file=sys.stderr)
        return None


def fetch_vps():
    """Fetch VPS status."""
    try:
        disk = run("df -h / | tail -1 | awk '{print $5, \"von\", $2}'")
        containers = run("docker ps -q 2>/dev/null | wc -l")
        uptime = run("uptime -p 2>/dev/null || uptime")
        return {
            "disk": disk or "unbekannt",
            "uptime": uptime or "unbekannt",
            "containers": int(containers) if containers.isdigit() else 0
        }
    except Exception:
        return None


def get_history_facts():
    """Return 'this day in history' facts. Fallback set for common dates."""
    today = datetime.now()
    month = today.month
    day = today.day

    # A small curated set covering each day of the year would be ideal.
    # For now, provide generic interesting facts that vary by day.
    facts_db = {
        (3, 7): [
            {"year": 1876, "text": "Alexander Graham Bell erhaelt das Patent fuer das Telefon"},
            {"year": 1945, "text": "US-Truppen ueberqueren den Rhein bei Remagen"},
            {"year": 2009, "text": "NASA startet das Kepler-Weltraumteleskop"}
        ],
        (3, 8): [
            {"year": 1917, "text": "Beginn der Februarrevolution in Russland"},
            {"year": 1965, "text": "Erste US-Kampftruppen landen in Vietnam"},
            {"year": 2014, "text": "Malaysia-Airlines-Flug 370 verschwindet"}
        ],
        (3, 9): [
            {"year": 1959, "text": "Die Barbie-Puppe wird erstmals vorgestellt"},
            {"year": 1961, "text": "Sputnik 9 startet mit Hund Tschernuschka"},
            {"year": 2011, "text": "Space Shuttle Discovery landet zum letzten Mal"}
        ],
    }
    return facts_db.get((month, day), [
        {"year": 1969, "text": "Apollo-Programm treibt die Raumfahrt voran"},
        {"year": 1989, "text": "Das World Wide Web wird am CERN erfunden"},
        {"year": 2007, "text": "Das erste iPhone wird vorgestellt"}
    ])


def get_default_morning_tiles():
    """Generate default morning_tiles if Otto didn't provide them."""
    return {
        "knapp": {
            "headline": "Intralogistik-Branche im Aufwind",
            "signals": [
                {"text": "Automatisierungstrend in der Lagerlogistik haelt an", "source": "DVZ"},
                {"text": "KNAPP AG setzt auf KI-gestuetzte Kommissionierung", "source": "Logistik Heute"},
                {"text": "E-Commerce treibt Nachfrage nach Shuttle-Systemen", "source": "BVL"}
            ]
        },
        "headlines": [
            {"text": "Keine aktuellen Schlagzeilen verfuegbar", "source": "BrakeFast"}
        ],
        "streaming": [
            {"title": "Keine Streaming-Tipps heute", "platform": "—", "type": "—"}
        ],
        "events": []
    }


def enrich(data):
    """Add missing fields to data dict. Returns True if changes were made."""
    changed = False

    # Ensure widgets exists
    if "widgets" not in data:
        data["widgets"] = {}
        changed = True

    w = data["widgets"]

    # Weather
    if "weather" not in w:
        weather = fetch_weather()
        if weather:
            w["weather"] = weather
            changed = True
            print("  + Added weather data")

    # DayInfo
    if "dayInfo" not in w:
        dayinfo = fetch_dayinfo()
        if dayinfo:
            w["dayInfo"] = dayinfo
            changed = True
            print("  + Added dayInfo data")

    # VPS
    if "vps" not in w:
        vps = fetch_vps()
        if vps:
            w["vps"] = vps
            changed = True
            print("  + Added VPS status")

    # History — ensure it's an array
    if "history" not in w:
        w["history"] = get_history_facts()
        changed = True
        print("  + Added history facts")
    elif not isinstance(w["history"], list):
        # Convert single object to array
        w["history"] = [w["history"]]
        changed = True
        print("  + Converted history to array")

    # History — fetch Wikipedia thumbnails for entries without images
    if isinstance(w.get("history"), list):
        for fact in w["history"]:
            if not fact.get("image") and fact.get("url"):
                thumb = fetch_wikipedia_thumbnail(fact["url"])
                if thumb:
                    fact["image"] = thumb
                    changed = True
                    print(f"  + Added Wikipedia thumbnail for {fact.get('year', '?')}")

    # Calendar — ensure exists (may be empty)
    if "calendar" not in w:
        w["calendar"] = []
        changed = True
        print("  + Added empty calendar")

    # Pollen — add default if missing
    if "pollen" not in w:
        w["pollen"] = {
            "level": "unbekannt",
            "types": [],
            "description": "Keine Pollendaten verfuegbar"
        }
        changed = True
        print("  + Added default pollen data")

    # morning_tiles
    if "morning_tiles" not in data:
        data["morning_tiles"] = get_default_morning_tiles()
        changed = True
        print("  + Added default morning_tiles")

    # Always ensure all morning_tiles sub-fields exist
    mt = data["morning_tiles"]
    if "knapp" not in mt:
        mt["knapp"] = get_default_morning_tiles()["knapp"]
        changed = True
        print("  + Added default knapp tile")
    if "headlines" not in mt or (len(mt.get("headlines", [])) == 1 and "verfuegbar" in mt["headlines"][0].get("text", "")):
        # Try to extract from world articles
        world_arts = data.get("categories", {}).get("world", {}).get("articles", [])
        if world_arts and len(world_arts) >= 3:
            mt["headlines"] = [
                {"text": a["title"][:80], "source": a.get("source", "")}
                for a in world_arts[:3]
            ]
            changed = True
            print("  + Generated headlines from world articles")
        elif not mt.get("headlines"):
            mt["headlines"] = [{"text": "Keine Schlagzeilen verfuegbar", "source": "BrakeFast"}]
            changed = True
    if "streaming" not in mt:
        mt["streaming"] = get_default_morning_tiles()["streaming"]
        changed = True
        print("  + Added default streaming tile")
    if "events" not in mt:
        mt["events"] = []
        changed = True
        print("  + Added empty events tile")

    # Headline
    if "headline" not in data or not data["headline"]:
        # Generate from top articles
        top_cats = ["ai", "world", "tech"]
        parts = []
        for cat_id in top_cats:
            cat = data.get("categories", {}).get(cat_id, {})
            arts = cat.get("articles", [])
            if arts:
                title = arts[0].get("title", "")
                if len(title) > 40:
                    title = title[:37] + "..."
                parts.append(title)
        data["headline"] = " | ".join(parts[:3]) if parts else "Dein taeglicher Ueberblick"
        changed = True
        print("  + Generated headline from top articles")

    # Editorial
    if "editorial" not in data or not data["editorial"]:
        total = data.get("totalArticles", 0)
        data["editorial"] = f"Guten Morgen Gerhard! Heute haben wir {total} Artikel fuer dich zusammengestellt."
        changed = True
        print("  + Added default editorial")

    # Remove deprecated fields
    if "bauernregel" in w:
        del w["bauernregel"]
        changed = True
        print("  - Removed deprecated bauernregel")

    # Enrich articles with missing/bad images via OG scraping
    cats = data.get("categories", {})
    for cat_id, cat_val in cats.items():
        articles = cat_val if isinstance(cat_val, list) else cat_val.get("articles", [])
        for article in articles:
            img = article.get("image", "")
            if is_bad_image(img) and article.get("link"):
                og_img = fetch_og_image(article["link"])
                if og_img:
                    article["image"] = og_img
                    changed = True
                    title_short = article.get("title", "")[:40]
                    print(f"  + OG image for: {title_short}")

    return changed


def main():
    print("Step 3.6: Enriching data.json with missing fields...")

    try:
        with open(DATA_FILE) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  ERROR: Cannot read {DATA_FILE}: {e}", file=sys.stderr)
        sys.exit(1)

    if enrich(data):
        with open(DATA_FILE, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Step 3.6: data.json enriched successfully")
    else:
        print("Step 3.6: All fields present, no enrichment needed")


if __name__ == "__main__":
    main()
