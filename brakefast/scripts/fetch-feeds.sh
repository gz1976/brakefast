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
import html

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
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

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
