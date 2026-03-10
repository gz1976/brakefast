#!/usr/bin/env bash
# BrakeFast — Archive Page Generator
# Generates an index page listing all past editions
set -euo pipefail

PUBLIC_DIR="${BRAKEFAST_PUBLIC_DIR:-/data/brakefast-public}"
EDITIONS_DIR="${PUBLIC_DIR}/editions"
ARCHIVE_DIR="${EDITIONS_DIR}/archiv"
mkdir -p "$ARCHIVE_DIR"

# Generate archive HTML + JSON index
python3 - "$EDITIONS_DIR" "$ARCHIVE_DIR/index.html" "$EDITIONS_DIR/archive-index.json" << 'PYTHON_SCRIPT'
import sys
import os
import html
import json
from datetime import datetime, timezone
from pathlib import Path

editions_dir = sys.argv[1]
output_file = sys.argv[2]
json_index_file = sys.argv[3]

# Find all edition paths
legacy_editions = []
react_editions = []
for root, dirs, files in os.walk(editions_dir):
    rel = os.path.relpath(root, editions_dir)
    parts = rel.split('/')
    if len(parts) != 3:
        continue

    try:
        year, month, day = parts
        display = f'{day}.{month}.{year}'
        sort_key = f'{year}{month}{day}'
        legacy_path = f'/legacy/{rel}/index.html'
        data_path = os.path.join(root, 'data.json')
        meta_path = os.path.join(root, 'meta.json')
        meta = {}
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
            except json.JSONDecodeError:
                meta = {}

        if 'index.html' in files:
            legacy_editions.append({
                'path': legacy_path,
                'year': year,
                'month': month,
                'day': day,
                'display': display,
                'sort_key': sort_key,
            })

        if os.path.exists(data_path):
            react_editions.append({
                'date': f'{year}-{month}-{day}',
                'display_date': display,
                'year': year,
                'month': month,
                'day': day,
                'sort_key': sort_key,
                'edition_number': meta.get('edition_number'),
                'generated': meta.get('generated'),
                'published_at': meta.get('published_at'),
                'article_count': meta.get('article_count'),
                'headline': meta.get('headline'),
                'top_story': meta.get('top_story'),
                'data_url': meta.get('data_url') or f'/legacy/{rel}/data.json',
                'legacy_html_url': meta.get('legacy_html_url') or legacy_path,
                'react_url': meta.get('react_url') or f'/?edition={year}-{month}-{day}',
            })
    except Exception:
        pass

# Sort newest first
legacy_editions.sort(key=lambda e: e['sort_key'], reverse=True)
react_editions.sort(key=lambda e: e['sort_key'], reverse=True)

# Group by year-month
months = {}
for e in legacy_editions:
    key = f'{e["year"]}-{e["month"]}'
    if key not in months:
        months[key] = []
    months[key].append(e)

# Day of week names for display
day_names = {0: 'Mo', 1: 'Di', 2: 'Mi', 3: 'Do', 4: 'Fr', 5: 'Sa', 6: 'So'}

# Build HTML
archive_items = ""
for month_key in sorted(months.keys(), reverse=True):
    year, month = month_key.split('-')
    month_names = {
        '01': 'Jaenner', '02': 'Februar', '03': 'Maerz', '04': 'April',
        '05': 'Mai', '06': 'Juni', '07': 'Juli', '08': 'August',
        '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Dezember'
    }
    month_name = month_names.get(month, month)
    archive_items += f'<h3 class="archive-month-title">{month_name} {year}</h3>\n'
    archive_items += '<ul class="archive-list archive-grid">\n'
    for e in months[month_key]:
        from datetime import date
        try:
            d = date(int(e['year']), int(e['month']), int(e['day']))
            weekday = day_names.get(d.weekday(), '')
            archive_items += f'  <li><a href="{e["path"]}">{weekday}, {e["display"]}</a></li>\n'
        except:
            archive_items += f'  <li><a href="{e["path"]}">{e["display"]}</a></li>\n'
    archive_items += '</ul>\n'

page_html = f'''<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#0f0f0f" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f8f7f4" media="(prefers-color-scheme: light)">
  <title>BrakeFast &mdash; Archiv</title>
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="manifest" href="/assets/manifest.json">
</head>
<body>

  <header class="masthead">
    <div class="masthead-name">Brake<span>Fast</span></div>
    <div class="masthead-tagline">Archiv</div>
    <div class="masthead-meta">
      <span>{len(legacy_editions)} Ausgaben</span>
    </div>
  </header>

  <div class="editorial">
    Alle bisherigen Ausgaben der BrakeFast auf einen Blick.
    <span class="editorial-author">
      <a class="archive-link" href="/latest/index.html">Zur aktuellen Ausgabe &rarr;</a>
    </span>
  </div>

  <hr class="divider divider-thick">

  {archive_items}

  <footer class="footer">
    <div class="footer-logo">Brake<span>Fast</span></div>
    <p class="footer-tagline">Kuratiert von Otto fuer Gerhard</p>
    <div class="footer-links">
      <a class="archive-link" href="/latest/index.html">Aktuelle Ausgabe</a>
    </div>
  </footer>

</body>
</html>'''

with open(output_file, 'w') as f:
    f.write(page_html)

archive_index = {
    'generated': datetime.now(timezone.utc).isoformat(),
    'count': len(react_editions),
    'editions': [
        {key: value for key, value in edition.items() if key != 'sort_key'}
        for edition in react_editions
    ],
}

with open(json_index_file, 'w', encoding='utf-8') as f:
    json.dump(archive_index, f, ensure_ascii=False, indent=2)

print(f"Archive generated: {len(legacy_editions)} legacy editions")
print(f"Archive JSON index generated: {len(react_editions)} React snapshots")
PYTHON_SCRIPT

echo "Archive page generated."
