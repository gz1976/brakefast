#!/usr/bin/env bash
# BrakeFast — RSS Feed Fetcher
# Reads sources.json, fetches RSS feeds, outputs raw-articles.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
SOURCES_FILE="${BRAKEFAST_DIR}/sources.json"
OUTPUT_DIR="${BRAKEFAST_DIR}/output"
OUTPUT_FILE="${OUTPUT_DIR}/raw-articles.json"

# Load optional runtime env so downstream steps share the same BrakeFast config.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-brakefast-env.sh"

mkdir -p "$OUTPUT_DIR"

if [ ! -f "$SOURCES_FILE" ]; then
  echo "ERROR: sources.json not found at $SOURCES_FILE" >&2
  exit 1
fi

# Python script for robust RSS/Atom parsing
python3 - "$SOURCES_FILE" "$OUTPUT_FILE" << 'PYTHON_SCRIPT'
import sys
import os
import json
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import re
import time
import html as html_mod

def fetch_feed(url, timeout=15):
    """Fetch RSS/Atom feed via curl."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout),
             "-H", "User-Agent: BrakeFast/1.0 (Personal News Aggregator)",
             url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0:
            return None
        return result.stdout
    except Exception as e:
        print(f"  WARN: Failed to fetch {url}: {e}", file=sys.stderr)
        return None

def clean_html(text):
    """Strip HTML tags and decode entities."""
    if not text:
        return ""
    text = html_mod.unescape(text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def smart_truncate(text, max_length=500):
    """Truncate text at the last complete sentence boundary within max_length."""
    if not text or len(text) <= max_length:
        return text
    region = text[:max_length]
    # Find last sentence-ending punctuation
    best_cut = -1
    for i in range(len(region) - 1, int(max_length * 0.3), -1):
        if region[i] in '.!?':
            nxt = region[i + 1] if i + 1 < len(region) else ' '
            if nxt in (' ', '\n') or i + 1 == len(region):
                best_cut = i + 1
                break
    if best_cut > 0:
        return text[:best_cut].rstrip()
    # Fallback: word boundary
    last_space = region.rfind(' ')
    if last_space > max_length * 0.3:
        return region[:last_space].rstrip() + ' \u2026'
    return region.rstrip() + ' \u2026'

def check_freshness(date_str, max_age_hours=72):
    """Return True if article is fresh, False if stale."""
    if not date_str:
        return True  # unparseable = assume fresh
    max_age_hours = int(os.environ.get("BRAKEFAST_MAX_ARTICLE_AGE_HOURS", str(max_age_hours)))
    try:
        from email.utils import parsedate_to_datetime
        pub_date = parsedate_to_datetime(date_str)
        age = datetime.now(timezone.utc) - pub_date
        return age.total_seconds() < max_age_hours * 3600
    except Exception:
        try:
            pub_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            age = datetime.now(timezone.utc) - pub_date
            return age.total_seconds() < max_age_hours * 3600
        except Exception:
            return True  # unparseable = assume fresh

def validate_image_url(url):
    """Filter out tracking pixels, data URIs, SVGs, and tiny images."""
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    if not url.startswith(('http://', 'https://')):
        return None
    # Skip data URIs, SVGs, tracking pixels
    skip_patterns = [
        'data:', '.svg', '1x1', 'pixel', 'spacer', 'blank.',
        'feedburner.com', 'doubleclick', 'analytics',
        'gravatar.com/avatar', 'wp-content/plugins',
        'feeds.feedburner.com/~'
    ]
    url_lower = url.lower()
    for pattern in skip_patterns:
        if pattern in url_lower:
            return None
    # Fix double-domain URLs (e.g. teslamag.de/teslamag.de/wp-content/...)
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.hostname and parsed.path.startswith('/' + parsed.hostname):
            url = parsed.scheme + '://' + parsed.hostname + parsed.path[len('/' + parsed.hostname):]
            print(f"    Fixed double-domain URL: {url[:80]}", file=sys.stderr)
    except Exception:
        pass
    # Skip YouTube embeds
    if '/embed/' in url:
        return None
    return url

def extract_image_from_item(item, feed_type):
    """Extract image URL from RSS/Atom item using multiple strategies."""
    media_ns = '{http://search.yahoo.com/mrss/}'

    # Strategy 1: media:content (TechCrunch, Ars Technica)
    for media_el in item.findall(f'{media_ns}content'):
        url = media_el.get('url', '')
        medium = media_el.get('medium', '')
        mime = media_el.get('type', '')
        if medium == 'image' or mime.startswith('image/') or url:
            validated = validate_image_url(url)
            if validated:
                return validated

    # Strategy 2: media:thumbnail
    for thumb_el in item.findall(f'{media_ns}thumbnail'):
        url = thumb_el.get('url', '')
        validated = validate_image_url(url)
        if validated:
            return validated

    # Strategy 3: media:group > media:content
    for group in item.findall(f'{media_ns}group'):
        for media_el in group.findall(f'{media_ns}content'):
            url = media_el.get('url', '')
            validated = validate_image_url(url)
            if validated:
                return validated

    # Strategy 4: enclosure with image type (Krebs, WordPress blogs)
    for enc in item.findall('enclosure'):
        enc_type = enc.get('type', '')
        if enc_type.startswith('image/'):
            validated = validate_image_url(enc.get('url', ''))
            if validated:
                return validated

    # Strategy 5: First <img> in raw description/content HTML
    desc_el = None
    if feed_type == 'rss':
        desc_el = item.find('{http://purl.org/rss/1.0/modules/content/}encoded')
        if desc_el is None:
            desc_el = item.find('description')
    elif feed_type == 'atom':
        desc_el = item.find('{http://www.w3.org/2005/Atom}content')
        if desc_el is None:
            desc_el = item.find('{http://www.w3.org/2005/Atom}summary')

    if desc_el is not None and desc_el.text:
        img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_el.text, re.IGNORECASE)
        if img_match:
            validated = validate_image_url(img_match.group(1))
            if validated:
                return validated

    return None

def fetch_og_image(url, timeout=8):
    """Fetch og:image from article page as fallback. Only reads first 32KB."""
    if not url:
        return None
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout),
             "-r", "0-32767",
             "-H", "User-Agent: BrakeFast/1.0 (Personal News Aggregator)",
             url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0 or not result.stdout:
            return None
        # Extract og:image
        match = re.search(
            r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
            result.stdout, re.IGNORECASE
        )
        if not match:
            # Try reversed attribute order
            match = re.search(
                r'<meta\s+content=["\']([^"\']+)["\']\s+(?:property|name)=["\']og:image["\']',
                result.stdout, re.IGNORECASE
            )
        if match:
            return validate_image_url(match.group(1))
    except Exception:
        pass
    return None

def extract_search_keywords(title):
    """Extract 2-3 significant keywords from article title for image search."""
    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
        'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into', 'through',
        'and', 'but', 'or', 'not', 'no', 'its', 'it', 'this', 'that',
        'how', 'why', 'what', 'when', 'where', 'who', 'which',
        'new', 'can', 'will', 'just', 'more', 'most', 'now', 'says',
        'could', 'may', 'report', 'says', 'gets', 'makes', 'has', 'have',
        'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'fuer', 'mit',
        'von', 'zu', 'auf', 'ist', 'sind', 'bei', 'nach', 'ueber',
        'neuer', 'neue', 'neues', 'wie', 'aus', 'aber', 'noch',
    }
    # Keep words 3+ chars, filter stop words, take first 3
    words = re.findall(r'[a-zA-Z0-9]{3,}', title)
    keywords = [w for w in words if w.lower() not in stop_words]
    return ' '.join(keywords[:3])

def search_wikipedia_thumbnail(title, timeout=8):
    """Search Wikipedia for article thumbnail based on title keywords."""
    import urllib.parse
    keywords = extract_search_keywords(title)
    if not keywords:
        return None
    query = urllib.parse.quote(keywords)
    # Wikipedia search API — returns page summaries with thumbnails
    api_url = (
        f"https://en.wikipedia.org/w/api.php?"
        f"action=query&generator=search&gsrsearch={query}"
        f"&gsrlimit=3&prop=pageimages&piprop=thumbnail"
        f"&pithumbsize=800&format=json"
    )
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), api_url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0 or not result.stdout:
            return None
        data = json.loads(result.stdout)
        pages = data.get('query', {}).get('pages', {})
        for page_id in sorted(pages.keys(), key=lambda x: int(x) if x.lstrip('-').isdigit() else 0):
            page = pages[page_id]
            thumb = page.get('thumbnail', {}).get('source', '')
            if thumb and validate_image_url(thumb):
                return thumb
    except Exception:
        pass
    return None

def search_wikimedia_image(title, timeout=8):
    """Search Wikimedia Commons for a relevant image based on title keywords."""
    import urllib.parse
    keywords = extract_search_keywords(title)
    if not keywords:
        return None
    query = urllib.parse.quote(keywords)
    api_url = (
        f"https://commons.wikimedia.org/w/api.php?"
        f"action=query&generator=search&gsrsearch={query}"
        f"&gsrnamespace=6&gsrlimit=5&prop=imageinfo"
        f"&iiprop=url|mime&iiurlwidth=800&format=json"
    )
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), api_url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0 or not result.stdout:
            return None
        data = json.loads(result.stdout)
        pages = data.get('query', {}).get('pages', {})
        # Sort by page ID (lower = more relevant)
        for page_id in sorted(pages.keys(), key=lambda x: int(x) if x.lstrip('-').isdigit() else 0):
            page = pages[page_id]
            imageinfo = page.get('imageinfo', [])
            if not imageinfo:
                continue
            info = imageinfo[0]
            mime = info.get('mime', '')
            # Only accept JPEG/PNG photos, skip SVG/GIF/icons
            if mime not in ('image/jpeg', 'image/png'):
                continue
            thumb = info.get('thumburl', '')
            if thumb and validate_image_url(thumb):
                return thumb
    except Exception:
        pass
    return None

def search_fallback_image(title):
    """Try Wikipedia first (better photos), then Wikimedia Commons."""
    img = search_wikipedia_thumbnail(title)
    if img:
        return img
    return search_wikimedia_image(title)

def fetch_hn_original_url(hn_url, timeout=10):
    """Get original article URL from HN item via Firebase API."""
    match = re.search(r'[?&]id=(\d+)', hn_url)
    if not match:
        return None, None
    item_id = match.group(1)
    api_url = f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json"
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout), api_url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0 or not result.stdout:
            return None, None
        data = json.loads(result.stdout)
        original_url = data.get('url')  # None for Ask HN, Show HN without link
        title = data.get('title', '')
        return original_url, title
    except Exception as e:
        print(f"    WARN: HN API failed for {item_id}: {e}", file=sys.stderr)
        return None, None

def extract_article_text(url, max_sentences=5, timeout=10):
    """Extract first N sentences from an article page."""
    if not url:
        return None
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", str(timeout),
             "-r", "0-65535",
             "-H", "User-Agent: BrakeFast/1.0 (Personal News Aggregator)",
             url],
            capture_output=True, text=True, timeout=timeout+5
        )
        if result.returncode != 0 or not result.stdout:
            return None
        html_text = result.stdout

        # Try to narrow to article/main content first
        content_html = html_text
        for tag in ['article', 'main', '[role="main"]']:
            match = re.search(
                rf'<{tag}[^>]*>(.*?)</{tag.split("[")[0]}>',
                html_text, re.DOTALL | re.IGNORECASE
            )
            if match and len(match.group(1)) > 200:
                content_html = match.group(1)
                break

        # Extract text from <p> tags
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', content_html, re.DOTALL | re.IGNORECASE)
        sentences = []
        for p in paragraphs:
            text = clean_html(p).strip()
            # Skip short paragraphs
            if len(text) < 60:
                continue
            # Skip paragraphs without proper sentence structure (no period/punctuation)
            if not re.search(r'[.!?]', text):
                continue
            # Skip boilerplate
            boilerplate = [
                'cookie', 'privacy policy', 'subscribe', 'sign up',
                'newsletter', 'accept all', 'read more', 'advertisement',
                'javascript', 'enable javascript', 'your browser',
                'terms of service', 'log in', 'sign in', 'create account',
                'copyright', 'all rights reserved', 'skip to content',
            ]
            if any(skip in text.lower() for skip in boilerplate):
                continue
            # Skip lines that look like navigation (many short words, no sentences)
            word_count = len(text.split())
            if word_count < 8:
                continue
            # Collect sentences
            for sent in re.split(r'(?<=[.!?])\s+', text):
                sent = sent.strip()
                if len(sent) > 40 and re.search(r'[.!?]$', sent):
                    sentences.append(sent)
                    if len(sentences) >= max_sentences:
                        break
            if len(sentences) >= max_sentences:
                break
        if sentences:
            return ' '.join(sentences)
        return None
    except Exception as e:
        print(f"    WARN: Article extraction failed for {url}: {e}", file=sys.stderr)
        return None

def enrich_aggregator_articles(articles, feed_config):
    """Enrich HN/Reddit articles with original article URLs and content.

    HN RSS structure:
      - link = URL to original article (external)
      - description = '<a href="https://news.ycombinator.com/item?id=XXX">Comments</a>'
    So: link is already the original, discussion_url comes from description HTML.
    """
    if not feed_config.get('aggregator', False):
        return
    feed_name = feed_config.get('name', '')
    print(f"  Enriching {len(articles)} aggregator articles from {feed_name}...", file=sys.stderr)

    for art in articles:
        original_url = art.get('link', '')
        desc = art.get('description', '')

        # link already points to the original article (HN RSS structure)
        # discussion_url was extracted in parse_feed from raw HTML
        art['source_url'] = original_url

        if original_url and not original_url.startswith('https://news.ycombinator.com'):
            print(f"    Original: {original_url[:80]}", file=sys.stderr)

            # Extract article text from original
            text = extract_article_text(original_url)
            if text:
                art['description'] = smart_truncate(text, 500)
                print(f"    Extracted {len(text)} chars of text", file=sys.stderr)
            else:
                art['description'] = f"Diskussion auf {feed_name} — Originalartikel konnte nicht extrahiert werden."
                print(f"    Text extraction failed, using fallback", file=sys.stderr)

            # Try og:image from original article if no image yet
            if not art.get('image'):
                og_img = fetch_og_image(original_url)
                if og_img:
                    art['image'] = og_img
                    print(f"    og:image from original: found", file=sys.stderr)
        else:
            # Ask HN / self-post — link points to HN itself
            if not desc or desc.strip().lower() in ('comments', ''):
                art['description'] = f"Diskussion auf {feed_name}"
            print(f"    Self-post (no external URL)", file=sys.stderr)

def parse_feed(xml_text, feed_name, max_items, is_aggregator=False):
    """Parse RSS or Atom feed XML into article dicts."""
    articles = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"  WARN: XML parse error for {feed_name}: {e}", file=sys.stderr)
        return articles

    # Detect feed type and extract items
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    items = []

    # RSS 2.0
    for item in root.findall('.//item'):
        items.append(('rss', item))

    # Atom
    if not items:
        for entry in root.findall('.//atom:entry', ns):
            items.append(('atom', entry))
        # Atom without namespace
        if not items:
            for entry in root.findall('.//{http://www.w3.org/2005/Atom}entry'):
                items.append(('atom', entry))

    # RDF 1.0 (used by ORF)
    if not items:
        rdf_ns = {'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                   'rss1': 'http://purl.org/rss/1.0/'}
        for item in root.findall('.//rss1:item', rdf_ns):
            items.append(('rdf', item))
        # Also try without namespace prefix
        if not items:
            for item in root.findall('.//{http://purl.org/rss/1.0/}item'):
                items.append(('rdf', item))

    for feed_type, item in items[:max_items]:
        article = {"source": feed_name}

        if feed_type == 'rss':
            title_el = item.find('title')
            link_el = item.find('link')
            desc_el = item.find('description')
            date_el = item.find('pubDate')
            content_el = item.find('{http://purl.org/rss/1.0/modules/content/}encoded')

            article['title'] = clean_html(title_el.text) if title_el is not None and title_el.text else ''
            article['link'] = (link_el.text or '').strip() if link_el is not None else ''
            raw_desc = (content_el.text if content_el is not None and content_el.text else None) or \
                       (desc_el.text if desc_el is not None else '')
            # For aggregator feeds: extract discussion URL from raw HTML before cleaning
            if is_aggregator and raw_desc:
                hn_match = re.search(r'https://news\.ycombinator\.com/item\?id=\d+', raw_desc)
                if hn_match:
                    article['discussion_url'] = hn_match.group(0)
            article['description'] = clean_html(raw_desc)
            article['date'] = (date_el.text or '').strip() if date_el is not None else ''

        elif feed_type == 'atom':
            title_el = item.find('{http://www.w3.org/2005/Atom}title')
            if title_el is None:
                title_el = item.find('title')
            link_el = item.find('{http://www.w3.org/2005/Atom}link')
            if link_el is None:
                link_el = item.find('link')
            summary_el = item.find('{http://www.w3.org/2005/Atom}summary')
            content_el = item.find('{http://www.w3.org/2005/Atom}content')
            date_el = item.find('{http://www.w3.org/2005/Atom}updated')
            if date_el is None:
                date_el = item.find('{http://www.w3.org/2005/Atom}published')

            article['title'] = clean_html(title_el.text) if title_el is not None and title_el.text else ''
            article['link'] = link_el.get('href', '') if link_el is not None else ''
            article['description'] = clean_html(
                (content_el.text if content_el is not None and content_el.text else None) or
                (summary_el.text if summary_el is not None and summary_el.text else '')
            )
            article['date'] = (date_el.text or '').strip() if date_el is not None else ''

        elif feed_type == 'rdf':
            rss1 = 'http://purl.org/rss/1.0/'
            dc_ns = 'http://purl.org/dc/elements/1.1/'
            title_el = item.find(f'{{{rss1}}}title')
            link_el = item.find(f'{{{rss1}}}link')
            desc_el = item.find(f'{{{rss1}}}description')
            date_el = item.find(f'{{{dc_ns}}}date')

            article['title'] = clean_html(title_el.text) if title_el is not None and title_el.text else ''
            article['link'] = (link_el.text or '').strip() if link_el is not None else ''
            article['description'] = clean_html(desc_el.text if desc_el is not None and desc_el.text else '')
            article['date'] = (date_el.text or '').strip() if date_el is not None else ''

        # Extract image from RSS/Atom item
        image = extract_image_from_item(item, feed_type)
        article['image'] = image or ''

        # Skip articles without title
        if article.get('title'):
            # Truncate description at sentence boundary to keep JSON manageable
            if len(article.get('description', '')) > 500:
                article['description'] = smart_truncate(article['description'], 500)
            article['stale'] = not check_freshness(article.get('date', ''))
            articles.append(article)

    return articles

def main():
    sources_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(sources_file, 'r') as f:
        config = json.load(f)

    # Same-day reuse guard: skip if raw-articles.json was written < 2 hours ago
    if os.path.exists(output_file):
        age_hours = (time.time() - os.path.getmtime(output_file)) / 3600
        if age_hours < 2:
            print(f"raw-articles.json is {age_hours:.1f}h old (< 2h), reusing", file=sys.stderr)
            sys.exit(0)

    all_articles = {}
    total = 0

    for category in config['categories']:
        cat_id = category['id']
        cat_name = category['name']
        cat_articles = []

        print(f"Fetching category: {cat_name}", file=sys.stderr)

        for feed in category['feeds']:
            url = feed['url']
            name = feed['name']
            max_items = feed.get('maxItems', 3)

            print(f"  Feed: {name} ({url})", file=sys.stderr)
            xml_text = fetch_feed(url)
            if xml_text:
                is_agg = feed.get('aggregator', False)
                articles = parse_feed(xml_text, name, max_items, is_aggregator=is_agg)
                # Enrich aggregator feeds (HN, Reddit) with original article content
                enrich_aggregator_articles(articles, feed)
                cat_articles.extend(articles)
                print(f"  -> {len(articles)} articles", file=sys.stderr)
                stale_count = sum(1 for a in articles if a.get('stale'))
                if len(articles) > 0 and stale_count > len(articles) * 0.5:
                    print(f"  WARN: {name}: {stale_count}/{len(articles)} articles are stale (>72h old)", file=sys.stderr)
            else:
                print(f"  -> FAILED", file=sys.stderr)

        # Fetch og:image for articles without images (fallback)
        missing_img = [a for a in cat_articles if not a.get('image')]
        if missing_img:
            print(f"  Fetching og:image for {len(missing_img)} articles without images...", file=sys.stderr)
            for art in missing_img:
                if art.get('link'):
                    og_img = fetch_og_image(art['link'])
                    if og_img:
                        art['image'] = og_img
                        print(f"    og:image found for: {art['title'][:50]}", file=sys.stderr)

        # Strategy 3: Wikipedia/Wikimedia keyword search for remaining articles
        still_missing = [a for a in cat_articles if not a.get('image')]
        if still_missing:
            print(f"  Searching Wikipedia/Wikimedia for {len(still_missing)} articles...", file=sys.stderr)
            for art in still_missing:
                if art.get('title'):
                    fallback_img = search_fallback_image(art['title'])
                    if fallback_img:
                        art['image'] = fallback_img
                        print(f"    fallback image for: {art['title'][:50]}", file=sys.stderr)

        img_count = sum(1 for a in cat_articles if a.get('image'))
        print(f"  Images: {img_count}/{len(cat_articles)}", file=sys.stderr)

        all_articles[cat_id] = {
            "name": cat_name,
            "emoji": category.get('emoji', ''),
            "css_class": category.get('css_class', ''),
            "articles": cat_articles
        }
        total += len(cat_articles)

    # --- Cross-edition deduplication: remove articles from last 3 editions ---
    seen_urls = set()
    editions_checked = 0
    brakefast_public = os.environ.get("BRAKEFAST_PUBLIC_DIR", "/data/brakefast-public")

    def normalize_url_for_dedup(url):
        """Normalize URL: lowercase host, strip tracking params, trailing slash."""
        if not url:
            return ""
        try:
            from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
            parsed = urlparse(url.strip())
            host = (parsed.hostname or "").lower()
            path = parsed.path.rstrip("/")
            # Strip tracking params
            tracking = {'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
                        'ref','source','fbclid','gclid','mc_cid','mc_eid'}
            params = parse_qs(parsed.query)
            clean_params = {k: v for k, v in params.items() if k.lower() not in tracking}
            query = urlencode(clean_params, doseq=True) if clean_params else ""
            return urlunparse(("", host, path, "", query, "")).lower()
        except Exception:
            return url.strip().rstrip("/").lower()

    def load_edition_urls(path):
        """Extract all article URLs from a BrakeFast edition JSON."""
        urls = set()
        try:
            with open(path) as ef:
                edition = json.load(ef)
            for cat_data in edition.get("categories", {}).values():
                articles_list = cat_data.get("articles", []) if isinstance(cat_data, dict) else (cat_data if isinstance(cat_data, list) else [])
                for a in articles_list:
                    if isinstance(a, dict):
                        url = a.get("link", "") or a.get("source_url", "")
                        if url:
                            urls.add(normalize_url_for_dedup(url))
        except (json.JSONDecodeError, FileNotFoundError, OSError):
            pass
        return urls

    # Load current/latest edition
    latest_path = os.path.join(brakefast_public, "data.json")
    urls = load_edition_urls(latest_path)
    if urls:
        seen_urls |= urls
        editions_checked += 1
        print(f"\nDedup: loaded {len(urls)} URLs from latest edition", file=sys.stderr)

    # Load up to 2 more archived editions (most recent first)
    editions_dir = os.path.join(brakefast_public, "editions")
    if os.path.isdir(editions_dir):
        archive_files = []
        for dirpath, dirnames, filenames in os.walk(editions_dir):
            if "data.json" in filenames:
                archive_files.append(os.path.join(dirpath, "data.json"))
        # Sort by date extracted from path (YYYY/MM/DD), take last 2
        def _extract_date_from_path(path_str):
            m = re.search(r'(\d{4})/(\d{2})/(\d{2})', path_str)
            if m:
                return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return (0, 0, 0)

        archive_files.sort(key=lambda p: _extract_date_from_path(str(p)), reverse=True)
        for af in archive_files[:2]:
            if af == latest_path:
                continue
            urls = load_edition_urls(af)
            if urls:
                seen_urls |= urls
                editions_checked += 1
                print(f"Dedup: loaded {len(urls)} URLs from {af}", file=sys.stderr)

    # Filter out seen articles
    if seen_urls:
        removed_total = 0
        for cat_id, cat_data in all_articles.items():
            before = len(cat_data["articles"])
            cat_data["articles"] = [
                a for a in cat_data["articles"]
                if normalize_url_for_dedup(a.get("link", "")) not in seen_urls
            ]
            after = len(cat_data["articles"])
            removed = before - after
            if removed > 0:
                removed_total += removed
                print(f"Dedup: {cat_id}: removed {removed} repeat articles ({after} remaining)", file=sys.stderr)
            if after < 6:
                print(f"WARN: {cat_id} has only {after} new articles — check sources!", file=sys.stderr)
        total = sum(len(c["articles"]) for c in all_articles.values())
        print(f"Dedup: removed {removed_total} repeat articles across {editions_checked} editions, {total} remaining", file=sys.stderr)

    output = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "totalArticles": total,
        "categories": all_articles
    }

    with open(output_file, 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nDone: {total} articles written to {output_file}", file=sys.stderr)

if __name__ == '__main__':
    main()
PYTHON_SCRIPT

echo "Feed fetch complete: $OUTPUT_FILE"
