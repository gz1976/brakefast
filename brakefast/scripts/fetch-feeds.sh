#!/usr/bin/env bash
# BrakeFast — RSS Feed Fetcher
# Reads sources.json, fetches RSS feeds, outputs raw-articles.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
SOURCES_FILE="${BRAKEFAST_DIR}/sources.json"
OUTPUT_DIR="${BRAKEFAST_DIR}/output"
OUTPUT_FILE="${OUTPUT_DIR}/raw-articles.json"

mkdir -p "$OUTPUT_DIR"

if [ ! -f "$SOURCES_FILE" ]; then
  echo "ERROR: sources.json not found at $SOURCES_FILE" >&2
  exit 1
fi

# Python script for robust RSS/Atom parsing
python3 - "$SOURCES_FILE" "$OUTPUT_FILE" << 'PYTHON_SCRIPT'
import sys
import json
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import re
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

def parse_feed(xml_text, feed_name, max_items):
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
            article['description'] = clean_html(
                (content_el.text if content_el is not None and content_el.text else None) or
                (desc_el.text if desc_el is not None else '')
            )
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

        # Extract image from RSS/Atom item
        image = extract_image_from_item(item, feed_type)
        article['image'] = image or ''

        # Skip articles without title
        if article.get('title'):
            # Truncate description to ~500 chars to keep JSON manageable
            if len(article.get('description', '')) > 500:
                article['description'] = article['description'][:500] + '...'
            articles.append(article)

    return articles

def main():
    sources_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(sources_file, 'r') as f:
        config = json.load(f)

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
                articles = parse_feed(xml_text, name, max_items)
                cat_articles.extend(articles)
                print(f"  -> {len(articles)} articles", file=sys.stderr)
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
