#!/usr/bin/env python3
import json
import html
import os
import sys

input_file = '/data/.openclaw/workspace/brakefast/output/curated-articles.json'
output_file = '/data/.openclaw/workspace/brakefast/output/latest/index.html'

os.makedirs(os.path.dirname(output_file), exist_ok=True)

today_display = '3. Maerz 2026'
edition_num = '1'
timestamp = '21:29 MEZ'
cache_bust = '1741033740'

with open(input_file, 'r') as f:
    data = json.load(f)

editorial = data.get('editorial', '')
weather_text = data.get('weather', '')
categories = data.get('categories', {})

def esc(text):
    return html.escape(str(text)) if text else ''

badge_map = {
    'category-header--ai': 'article-badge--ai',
    'category-header--security': 'article-badge--security',
    'category-header--tech': 'article-badge--tech',
}

articles_html = ''
is_first_article = True

for cat_id, cat_data in categories.items():
    cat_name = esc(cat_data.get('name', cat_id))
    cat_emoji = cat_data.get('emoji', '')
    css_class = esc(cat_data.get('css_class', 'category-header--tech'))
    badge_class = badge_map.get(cat_data.get('css_class', ''), 'article-badge--tech')
    articles = cat_data.get('articles', [])

    if not articles:
        continue

    articles_html += f'<section class="category">\n'
    articles_html += f'  <div class="category-header {css_class}">{cat_emoji} {cat_name}</div>\n\n'

    grid_articles = []

    for art in articles:
        title = esc(art.get('title', 'Ohne Titel'))
        link = esc(art.get('link', '#'))
        source = esc(art.get('source', ''))
        date = esc(art.get('date', ''))
        body = art.get('summary', art.get('description', ''))
        body = esc(body)

        word_count = len(body.split())
        read_time = max(1, round(word_count / 200))

        if is_first_article:
            articles_html += f'''  <article class="article-hero">
    <div class="article-badge {badge_class}">{cat_emoji} {cat_name}</div>
    <h2 class="article-title"><a href="{link}" target="_blank" rel="noopener">{title}</a></h2>
    <div class="article-meta">
      <span>{source}</span>
      <span>{date}</span>
      <span class="reading-time">{read_time} Min. Lesezeit</span>
    </div>
    <div class="article-body"><p>{body}</p></div>
    <div class="article-source">
      <span>{source}</span>
      <a href="{link}" target="_blank" rel="noopener" class="read-more">Weiterlesen</a>
    </div>
  </article>\n\n'''
            is_first_article = False
        else:
            grid_articles.append(f'''    <article class="article">
      <div class="article-badge {badge_class}">{cat_emoji} {cat_name}</div>
      <h2 class="article-title"><a href="{link}" target="_blank" rel="noopener">{title}</a></h2>
      <div class="article-meta">
        <span>{source}</span>
        <span>{date}</span>
        <span class="reading-time">{read_time} Min.</span>
      </div>
      <div class="article-body"><p>{body}</p></div>
      <div class="article-source">
        <span>{source}</span>
        <a href="{link}" target="_blank" rel="noopener" class="read-more">Weiterlesen</a>
      </div>
    </article>''')

    if grid_articles:
        articles_html += '  <div class="article-grid">\n'
        articles_html += '\n\n'.join(grid_articles)
        articles_html += '\n  </div>\n'

    articles_html += '</section>\n\n'

weather_html = ''
if weather_text:
    weather_html = f'''<div class="weather">
    <span class="weather-icon">&#9925;</span>
    <div>
      <div class="weather-temp">{esc(weather_text.split(",")[0].split(":")[1].strip() if ":" in weather_text else weather_text)}</div>
      <div class="weather-details">{esc(weather_text)}</div>
    </div>
  </div>'''

total_articles = sum(len(c.get('articles', [])) for c in categories.values())

page_html = f'''<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#0f0f0f" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f8f7f4" media="(prefers-color-scheme: light)">
  <title>BrakeFast &mdash; {today_display}</title>
  <link rel="stylesheet" href="/assets/style.css?v={cache_bust}">
  <link rel="manifest" href="/assets/manifest.json">
  <link rel="apple-touch-icon" href="/assets/icon-192.png">
</head>
<body>

  <header class="masthead">
    <div class="masthead-name">Brake<span>Fast</span></div>
    <div class="masthead-tagline">Deine persoenliche Morgenzeitung</div>
    <div class="masthead-meta">
      <span>Ausgabe #{edition_num:0>3}</span>
      <span>{today_display}</span>
      <span>{total_articles} Artikel</span>
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
    <p class="footer-tagline">Kuratiert von Otto fuer Gerhard</p>
    <div class="footer-links">
      <a class="archive-link" href="/archiv/">Archiv</a>
    </div>
    <p class="footer-edition">
      Ausgabe #{edition_num:0>3} &middot; {today_display} &middot; {timestamp}
    </p>
  </footer>

  <script>
    if ('serviceWorker' in navigator) {{
      navigator.serviceWorker.register('/assets/sw.js');
    }}
  </script>

</body>
</html>'''

with open(output_file, 'w') as f:
    f.write(page_html)

print(f'Generated: {output_file}')
