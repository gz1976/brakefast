#!/usr/bin/env bash
# BrakeFast — HTML Generator
# Reads curated-articles.json (or raw-articles.json) and generates the daily newspaper HTML
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${BRAKEFAST_DIR}/output"
EDITIONS_DIR="/docker/brakefast/editions"

# Use curated articles if available, otherwise fall back to raw
INPUT_FILE="${OUTPUT_DIR}/curated-articles.json"
if [ ! -f "$INPUT_FILE" ]; then
  INPUT_FILE="${OUTPUT_DIR}/raw-articles.json"
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "ERROR: No articles JSON found in $OUTPUT_DIR" >&2
  exit 1
fi

TODAY=$(date +%Y/%m/%d)
TODAY_DISPLAY=$(date +"%d. %B %Y" | sed 's/January/Jaenner/;s/February/Februar/;s/March/Maerz/;s/May/Mai/;s/June/Juni/;s/July/Juli/;s/October/Oktober/;s/December/Dezember/')
EDITION_DIR="${EDITIONS_DIR}/${TODAY}"
EDITION_NUM=$(find "$EDITIONS_DIR" -name "index.html" -path "*/????/??/??/*" 2>/dev/null | wc -l | tr -d ' ')
EDITION_NUM=$((EDITION_NUM + 1))
TIMESTAMP=$(date +"%H:%M MEZ")

mkdir -p "$EDITION_DIR"

# Fetch weather for Voitsberg if not in curated data
WEATHER_JSON=""
if ! grep -q '"weather"' "$INPUT_FILE" 2>/dev/null || grep -q '"weather": ""' "$INPUT_FILE" 2>/dev/null; then
  WEATHER_RAW=$(curl -s "https://wttr.in/Voitsberg?format=%t|%C|%w" 2>/dev/null || echo "")
  if [ -n "$WEATHER_RAW" ]; then
    WEATHER_JSON="$WEATHER_RAW"
  fi
fi

# Generate HTML from JSON using Python
python3 - "$INPUT_FILE" "$EDITION_DIR/index.html" "$TODAY_DISPLAY" "$EDITION_NUM" "$TIMESTAMP" "$WEATHER_JSON" << 'PYTHON_SCRIPT'
import sys
import json
import html

input_file = sys.argv[1]
output_file = sys.argv[2]
today_display = sys.argv[3]
edition_num = sys.argv[4]
timestamp = sys.argv[5]
weather_fallback = sys.argv[6] if len(sys.argv) > 6 else ''

with open(input_file, 'r') as f:
    data = json.load(f)

# Check if this is curated (has editorial) or raw format
editorial = data.get('editorial', 'Guten Morgen Gerhard! Hier ist deine heutige BrakeFast mit den wichtigsten News aus Tech, AI und Security.')
weather_text = data.get('weather', '')
categories = data.get('categories', {})

# Use wttr.in fallback if no weather in data
if not weather_text and weather_fallback:
    parts = weather_fallback.split('|')
    if len(parts) >= 2:
        weather_text = f'Voitsberg: {parts[0].strip()}, {parts[1].strip()}'
        if len(parts) >= 3:
            weather_text += f', Wind: {parts[2].strip()}'

def esc(text):
    return html.escape(str(text)) if text else ''

# Build article HTML
articles_html = ""
for cat_id, cat_data in categories.items():
    cat_name = esc(cat_data.get('name', cat_id))
    cat_emoji = cat_data.get('emoji', '')
    css_class = esc(cat_data.get('css_class', 'category-header--tech'))
    articles = cat_data.get('articles', [])

    if not articles:
        continue

    articles_html += f'<section class="category">\n'
    articles_html += f'  <div class="category-header {css_class}">{cat_emoji} {cat_name}</div>\n\n'

    for art in articles:
        title = esc(art.get('title', 'Ohne Titel'))
        link = esc(art.get('link', '#'))
        source = esc(art.get('source', ''))
        date = esc(art.get('date', ''))
        # Use summary (curated) or description (raw)
        body = art.get('summary', art.get('description', ''))
        body = esc(body)

        # Estimate reading time (~200 words/min)
        word_count = len(body.split())
        read_time = max(1, round(word_count / 200))

        articles_html += f'''  <article class="article">
    <h2 class="article-title"><a href="{link}" target="_blank" rel="noopener">{title}</a></h2>
    <div class="article-meta">
      <span>{source}</span>
      <span>{date}</span>
      <span>{read_time} Min. Lesezeit</span>
    </div>
    <div class="article-body"><p>{body}</p></div>
    <div class="article-source">Quelle: <a href="{link}" target="_blank" rel="noopener">{source}</a></div>
  </article>\n\n'''

    articles_html += '</section>\n\n'

# Weather section
weather_html = ''
if weather_text:
    weather_html = f'''<div class="weather">
    <span class="weather-icon">&#9925;</span>
    <div>{esc(weather_text)}</div>
  </div>'''

page_html = f'''<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1a1a1a">
  <title>BrakeFast — {today_display}</title>
  <link rel="stylesheet" href="/brakefast/assets/style.css">
  <link rel="manifest" href="/brakefast/assets/manifest.json">
  <link rel="apple-touch-icon" href="/brakefast/assets/icon-192.png">
</head>
<body>

  <header class="masthead">
    <div class="masthead-name">Brake<span>Fast</span></div>
    <div class="masthead-tagline">Deine persoenliche Morgenzeitung</div>
    <div class="masthead-meta">
      <span>Ausgabe #{edition_num:0>3}</span>
      <span>{today_display}</span>
      <span>Wien, Oesterreich</span>
    </div>
  </header>

  <div class="editorial">
    {esc(editorial)}
    <span class="editorial-author">&mdash; Otto, dein persoenlicher Kurator</span>
  </div>

  {weather_html}

  <hr class="divider divider-thick">

  {articles_html}

  <footer class="footer">
    <div class="footer-logo">Brake<span>Fast</span></div>
    <p>Kuratiert von Otto fuer Gerhard</p>
    <p style="margin-top: 8px;">
      <a class="archive-link" href="/brakefast/archiv/">Archiv</a>
    </p>
    <p style="margin-top: 12px; font-size: 0.65rem;">
      Ausgabe #{edition_num:0>3} &middot; Generiert am {today_display} um {timestamp}
    </p>
  </footer>

  <script>
    if ('serviceWorker' in navigator) {{
      navigator.serviceWorker.register('/brakefast/assets/sw.js');
    }}
  </script>

</body>
</html>'''

with open(output_file, 'w') as f:
    f.write(page_html)

print(f"Generated: {output_file}")
PYTHON_SCRIPT

# Update latest symlink (remove whether file, symlink, or directory)
rm -rf "${EDITIONS_DIR}/latest"
ln -sf "${TODAY}" "${EDITIONS_DIR}/latest"

echo "BrakeFast edition #${EDITION_NUM} generated: ${EDITION_DIR}/index.html"
echo "Latest symlink updated."
