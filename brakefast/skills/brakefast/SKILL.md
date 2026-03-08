---
name: brakefast
description: "Generiere die taegliche BrakeFast Morgenzeitung. Trigger: zeitung, brakefast, morgenzeitung, newspaper, morning news"
metadata: {"openclaw":{"emoji":"📰","requires":{"bins":["curl","python3","jq"]}}}
---

# BrakeFast — Persoenliche Morgenzeitung

Du bist der Chefredakteur der BrakeFast, Gerhards persoenlicher Morgenzeitung.

## Deine Aufgabe

Wenn du aufgefordert wirst die BrakeFast zu generieren:

### Automatischer Modus (Cron, taeglich 05:30)

1. Fuehre das Fetch-Script aus:
   ```bash
   bash /data/.openclaw/workspace/brakefast/scripts/fetch-feeds.sh
   ```

2. Lies die rohen Artikel:
   ```bash
   cat /data/.openclaw/workspace/brakefast/output/raw-articles.json
   ```

3. Kuratiere die Artikel:
   - Waehle **6 Artikel pro Kategorie** (insgesamt ~36 Artikel)
   - Verteile sie auf diese 6 Kategorien: `ai`, `security`, `tech`, `ev`, `world`, `local`
   - Fasse jeden Artikel auf ~150-250 Woerter auf Deutsch zusammen
   - Bewerte Relevanz: Was betrifft Gerhard direkt? (VPS Security, Docker, AI Tools, Legal Tech, Tesla/E-Auto)
   - Vergib `relevance_score` (0.0-1.0) und `reading_time_minutes` (1-5) pro Artikel
   - Schreibe ein persoenliches Editorial (2-3 Saetze, was heute wichtig ist)
   - Hole das aktuelle Wetter fuer Voitsberg (strukturiert)

   **KRITISCH: Genau 6 Artikel pro Kategorie!**
   Jede Kategorie muss EXAKT 6 Artikel haben, damit das Grid-Layout gleichmaessig ist (2 Reihen à 3).
   Falls nicht genuegend relevante Artikel vorhanden sind, nimm auch weniger relevante auf.

4. Schreibe das Ergebnis als JSON:
   ```bash
   cat > /data/.openclaw/workspace/brakefast/output/curated-articles.json << 'EOF'
   {
     "generated": "2026-03-04T05:30:00Z",
     "totalArticles": 36,
     "edition_number": 315,
     "reading_time_total": 15,
     "editorial": "Guten Morgen Gerhard! ...",
     "weather": "Voitsberg: +3°C, bewoelkt",
     "widgets": {
       "weather": {
         "temp": 3,
         "description": "Bewoelkt, leichter Wind",
         "feelsLike": -1,
         "min": 1,
         "max": 8,
         "icon": "⛅",
         "location": "Voitsberg"
       },
       "dayInfo": {
         "namenstag": "Kunigunde",
         "sunrise": "06:32",
         "sunset": "17:45",
         "dayLength": "11h 13m"
       },
       "calendar": [
         { "time": "09:00", "title": "Daily Standup" }
       ],
       "quote": {
         "text": "Any sufficiently advanced technology...",
         "author": "Arthur C. Clarke"
       },
       "history": {
         "year": 1876,
         "text": "Alexander Graham Bell patentiert das Telefon"
       },
       "bauernregel": {
         "text": "Maerzenstaub bringt Gras und Laub",
         "meaning": "Trockenes Wetter im Maerz foerdert das Pflanzenwachstum"
       },
       "pollen": {
         "level": "niedrig",
         "types": ["Hasel", "Erle"],
         "description": "Geringe Belastung durch Fruehblueher"
       },
       "vps": {
         "disk": "21% von 96 GB",
         "uptime": "99.9%",
         "containers": 3,
         "lastAudit": "vor 2 Tagen"
       }
     },
     "categories": {
       "ai": {
         "name": "AI & Machine Learning",
         "emoji": "🤖",
         "css_class": "category-header--ai",
         "articles": [
           {
             "title": "Artikel Titel",
             "link": "https://...",
             "source": "Ars Technica",
             "date": "2. Maerz 2026",
             "image": "https://cdn.example.com/thumbnail.jpg",
             "description": "Kurzbeschreibung fuer Karten-Preview",
             "summary": "Deutsche Zusammenfassung des Artikels...",
             "reading_time_minutes": 3,
             "relevance_score": 0.92
           }
         ]
       },
       "security": { "...gleiche Struktur, 6 Artikel..." },
       "tech": { "...gleiche Struktur, 6 Artikel..." },
       "ev": {
         "name": "Elektromobilität",
         "emoji": "⚡",
         "css_class": "category-header--ev",
         "articles": [
           {
             "title": "Tesla Model Y Facelift...",
             "link": "https://...",
             "source": "Teslamag",
             "date": "...",
             "image": "https://...",
             "description": "...",
             "summary": "...",
             "reading_time_minutes": 2,
             "relevance_score": 0.85
           }
         ]
       },
       "world": {
         "name": "Welt & Politik",
         "emoji": "🌍",
         "css_class": "category-header--world",
         "articles": [
           {
             "title": "...",
             "link": "...",
             "source": "Der Standard",
             "date": "...",
             "image": "https://...",
             "description": "...",
             "summary": "...",
             "reading_time_minutes": 2,
             "relevance_score": 0.7
           }
         ]
       },
       "local": {
         "name": "Steiermark & Lokal",
         "emoji": "🏔",
         "css_class": "category-header--local",
         "articles": [ "...gleiche Struktur, 6 Artikel..." ]
       }
     },
     "ki_modelle": {
       "releases": {
         "title": "Claude 4.5 Opus",
         "content": "<strong>Claude 4.5 Opus</strong> — Beschreibung...",
         "source": "Anthropic Blog",
         "date": "vor 2 Tagen",
         "tag": "Modell",
         "link": "https://anthropic.com/blog/..."
       },
       "benchmarks": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Ranking", "link": "https://..." },
       "pricing": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "API", "link": "https://..." },
       "tools": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Update", "link": "https://..." }
     },
     "dev_digest": {
       "github_trending": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Repo", "link": "https://github.com/..." },
       "releases": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Update", "link": "https://..." },
       "hn_top": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Diskussion", "link": "https://news.ycombinator.com/..." },
       "security_advisory": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "CVE", "link": "https://..." }
     }
   }
   EOF
   ```

   **WICHTIG: Pflichtfelder im JSON:**
   - `generated`: ISO-8601 Timestamp
   - `totalArticles`: Gesamtanzahl der kuratierten Artikel (Zahl)
   - `edition_number`: Fortlaufende Ausgabennummer (Zahl, MUSS inkrementiert werden)
   - `reading_time_total`: Geschaetzte Gesamtlesezeit in Minuten

   **Edition Number ermitteln:**
   ```bash
   # Letzte Ausgabennummer lesen und um 1 erhoehen:
   PREV=$(cat /data/.openclaw/workspace/brakefast/output/curated-articles.json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('edition_number',0))" 2>/dev/null || echo 0)
   NEXT=$((PREV + 1))
   # Falls PREV=0 (erste Ausgabe oder Datei nicht vorhanden): Starte bei 1
   ```
   Verwende `$NEXT` als `edition_number` im neuen JSON.

   **WICHTIG: `image`-Feld aus raw-articles.json uebernehmen!**
   Jeder Artikel in raw-articles.json hat ein `image`-Feld (URL zum Artikel-Thumbnail).
   Dieses Feld MUSS 1:1 in curated-articles.json uebernommen werden.
   ALLE Kategorien MUESSEN Bilder haben — auch `world`!

   **WICHTIG: `source_url` und `discussion_url` uebernehmen!**
   Hacker-News-Artikel haben zusaetzliche Felder:
   - `source_url`: URL zum Originalartikel (z.B. Ars Technica, Blog)
   - `discussion_url`: URL zum HN-Diskussions-Thread
   Diese Felder MUESSEN 1:1 in curated-articles.json uebernommen werden, wenn vorhanden.
   Das `link`-Feld zeigt bei HN-Artikeln bereits auf den Originalartikel.

   **WICHTIG: `description`-Feld fuer jeden Artikel!**
   Zusaetzlich zu `summary` braucht jeder Artikel ein kurzes `description`-Feld (1-2 Saetze)
   fuer die Karten-Vorschau. `summary` ist die ausfuehrliche Zusammenfassung.

   **KRITISCH: 6 Artikel pro Kategorie!**
   Jede der 6 Kategorien (ai, security, tech, ev, world, local) muss EXAKT 6 Artikel haben.

   **WICHTIG: `morning_tiles` mit `url`-Feldern versehen!**
   Alle Eintraege in morning_tiles MUESSEN ein `url`-Feld enthalten.
   Beispiel-Struktur:
   ```json
   "morning_tiles": {
     "knapp": {
       "headline": "KNAPP liefert AutoStore-Anlage an...",
       "signals": [
         { "text": "KNAPP erweitert Logistikzentrum in Leoben", "source": "DVZ", "url": "https://..." },
         { "text": "Automatisierung in der Pharmalogistik", "source": "Logistik Heute", "url": "https://..." }
       ]
     },
     "streaming": [
       { "title": "The Bear S4", "platform": "Disney+", "type": "Serie", "url": "https://www.imdb.com/..." },
       { "title": "Dune: Prophecy", "platform": "Sky", "type": "Serie", "url": "https://..." }
     ],
     "events": [
       { "title": "Grazer Fruehjahrsmesse", "date": "15.-17. Maerz", "location": "Graz", "type": "Messe", "url": "https://..." }
     ],
     "media_tip": {
       "title": "Lex Fridman #456 - Sam Altman", "type": "Podcast", "source": "Lex Fridman Podcast",
       "url": "https://open.spotify.com/...", "duration": "2h 15m"
     }
   }
   ```
   - `knapp`: KNAPP AG / Intralogistik-News (Gerhard arbeitet dort). 2-3 Signals.
   - `streaming`: 2-3 aktuelle Streaming-Tipps (Serien/Filme). IMDB-Links bevorzugen.
   - `events`: 1-3 regionale Events (Steiermark/Oesterreich). Messen, Konferenzen, Kulturveranstaltungen.
   - `media_tip`: 1 Podcast/Lesetipp/Video (Tech/AI/Business). Mit Dauer.

   **Sektionen (ki_modelle, dev_digest):**
   - `ki_modelle`: 4 Info-Karten ueber aktuelle KI-Modell-Entwicklungen (Releases, Benchmarks, Preise, Tools)
   - `dev_digest`: 4 Info-Karten (GitHub Trending, Software Releases, HN Top Story, Security Advisory)
   - `content`-Feld darf HTML enthalten (z.B. `<strong>...</strong>`, `<em>...</em>`)
   - Jedes Item MUSS ein `link`-Feld mit URL zur Quelle enthalten!

   **ki_modelle befuellen — Quellen und Vorgehen:**
   Durchsuche `raw-articles.json` nach AI/ML-relevanten Artikeln und destilliere:
   - `releases`: Neuestes KI-Modell oder groesstes AI-Release des Tages
   - `benchmarks`: Benchmark-Vergleiche, Leaderboard-Aenderungen, Evaluierungen
   - `pricing`: API-Preisaenderungen, neue Tiers, kostenlose Angebote
   - `tools`: Neue AI-Tools, Plugins, Integrationen (z.B. Cursor, Copilot, Claude Code)
   Falls keine passenden Artikel in raw-articles.json: Verwende dein aktuelles Wissen ueber AI-Entwicklungen.

   **dev_digest befuellen — Quellen und Vorgehen:**
   Durchsuche `raw-articles.json` nach Developer-relevanten Artikeln und destilliere:
   - `github_trending`: Interessantestes Trending-Repo (aus HN/Tech-Feeds)
   - `releases`: Wichtigstes Software-Release (Frameworks, Libraries, Tools)
   - `hn_top`: Spannendste HN-Diskussion des Tages (mit Link zum HN-Thread)
   - `security_advisory`: Wichtigstes Security-Advisory oder CVE
   WICHTIG: Verwende ECHTE Daten aus raw-articles.json, NICHT ausgedachte!

   **Kategorie: Elektromobilität (`ev`)**
   - 6 Artikel zu E-Autos, Tesla, Ladeinfrastruktur, Batterietechnik
   - Gerhard ist Tesla-Besitzer und Fan — hohe Relevanz!
   - Quellen: Teslamag, Elektroauto News, Ecomento, InsideEVs, Electrek

   **Widget-Daten sammeln (ALLE muessen befuellt werden!):**

   - **Wetter** — Daten von wttr.in holen und extrahieren:
     ```bash
     WEATHER=$(curl -s "wttr.in/Voitsberg?format=j1")
     # Extraktion:
     echo "$WEATHER" | python3 -c "
     import json, sys
     w = json.load(sys.stdin)
     c = w['current_condition'][0]
     f = w.get('weather', [{}])[0]
     print(json.dumps({
       'temp': int(c['temp_C']),
       'description': c['weatherDesc'][0]['value'],
       'feelsLike': int(c['FeelsLikeC']),
       'min': int(f.get('mintempC', c['temp_C'])),
       'max': int(f.get('maxtempC', c['temp_C'])),
       'icon': '☀️' if int(c['temp_C']) > 20 else '⛅' if int(c['temp_C']) > 5 else '🌤',
       'location': 'Voitsberg'
     }, ensure_ascii=False))
     "
     ```

   - **VPS**: `df -h /` fuer Disk, `docker ps -q | wc -l` fuer Container, `uptime -s` fuer Uptime

   - **Tagesinfo** — Sonnenzeiten aus wttr.in extrahieren:
     ```bash
     echo "$WEATHER" | python3 -c "
     import json, sys
     w = json.load(sys.stdin)
     a = w.get('weather', [{}])[0].get('astronomy', [{}])[0]
     print(f\"sunrise={a.get('sunrise','')}, sunset={a.get('sunset','')}\")
     "
     ```
     **Namenstag**: Recherchiere den Namenstag fuer das heutige Datum (z.B. aus deinem Wissen oder einer Suche). Oesterreichische/deutsche Namenstage bevorzugen.

   - **Kalender**: Lies `/data/.openclaw/workspace/brakefast/output/calendar-events.json` (wird automatisch von fetch-calendar.py befuellt). Verwende die Daten fuer `widgets.calendar`. Falls die Datei leer ist oder `[]` enthaelt, setze `calendar: []`.

   - **Zitat**: Taeglich variierendes inspirierendes Zitat (Tech/Wissenschaft/Philosophie). Verwende dein Wissen — kein API-Call noetig.

   - **Geschichte**: Was passierte heute in der Geschichte? (Jahr + kurzer Satz auf Deutsch). Verwende dein Wissen.

   - **Bauernregel**: Passende Bauernregel zum aktuellen Monat. Verwende dein Wissen ueber traditionelle Bauernregeln.

   - **Pollenflug**: Saisonale Schaetzung fuer Voitsberg/Steiermark:
     - Jaenner-Februar: Hasel, Erle (niedrig-mittel)
     - Maerz-April: Birke, Esche (mittel-hoch)
     - Mai-Juli: Graeser, Roggen (hoch)
     - August-September: Beifuss, Ragweed (mittel)
     - Oktober-Dezember: Keine nennenswerte Belastung (niedrig)
     Verwende diese Tabelle als Orientierung. `level`: "niedrig", "mittel", "hoch", "sehr hoch"

5. Generiere die HTML-Seite (Legacy):
   ```bash
   bash /data/.openclaw/workspace/brakefast/scripts/generate-html.sh
   ```

6. Kopiere JSON fuer React-App + Web:
   ```bash
   mkdir -p /data/brakefast-public
   cp /data/.openclaw/workspace/brakefast/output/curated-articles.json /data/brakefast-public/data.json
   ```
   HINWEIS: `/data/brakefast-public/` ist das oeffentliche Verzeichnis.
   nginx served `/latest/data.json` direkt von dort.
   NICHT `/docker/...` verwenden — das existiert im Container nicht!

7. Sende Telegram-Benachrichtigung:
   ```bash
   EDITION=$(python3 -c "import json; print(json.load(open('/data/.openclaw/workspace/brakefast/output/curated-articles.json')).get('edition_number',''))" 2>/dev/null)
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -d chat_id=544762684 \
     -d "text=Guten Morgen! Deine BrakeFast Ausgabe #${EDITION} ist fertig: https://ottobot.net/" \
     -d parse_mode=Markdown
   ```

### Manueller Modus

Wenn Gerhard sagt "Zeitung bitte" oder "BrakeFast generieren":
- Fuehre die gleiche Pipeline aus
- Berichte den Fortschritt

## Qualitaetsregeln

- IMMER auf Deutsch zusammenfassen (technische Begriffe auf Englisch)
- Keine bloessen Link-Listen — echte Zusammenfassungen mit Kontext
- Bei Security-News: Immer Handlungsempfehlung fuer Gerhard ergaenzen
- Bei AI-News: Praxisrelevanz bewerten (was kann Gerhard damit machen?)
- Bei EV-News: Tesla-Relevanz hervorheben, Ladeinfrastruktur Oesterreich beachten
- Duplikate erkennen und entfernen (gleiche Story, verschiedene Quellen)
- **EXAKT 6 Artikel pro Kategorie** (verteilt auf 6 Kategorien = ~36 Artikel gesamt)
- Kategorien: ai (6), security (6), tech (6), ev (6), world (6), local (6)
- `ki_modelle` und `dev_digest` Sektionen IMMER befuellen (je 4 Items)
- `widgets` IMMER komplett befuellen (weather, dayInfo, calendar, quote, history, bauernregel, pollen, vps)
- `edition_number` MUSS bei jeder Ausgabe um 1 erhoeht werden
- **ALLE Artikel muessen ein `image`-Feld haben** (aus raw-articles.json uebernehmen)

## Relevanz-Score Leitfaden

- **0.90-1.00**: Betrifft Gerhard direkt (VPS Security-Patch, Tesla-Rueckruf, KNAPP-News, OpenClaw/Docker-Update)
- **0.75-0.89**: Hohe berufliche/persoenliche Relevanz (AI-Tools die er nutzt, E-Auto-Ladeinfrastruktur AT, Legal Tech)
- **0.60-0.74**: Allgemein interessant (grosse Tech-News, wichtige Weltpolitik, regionale Ereignisse)
- **0.40-0.59**: Hintergrund/Nice-to-know (Branchennews, internationale Politik, Wissenschaft)
- **< 0.40**: Wenig relevant (nur verwenden wenn Kategorie nicht genug Artikel hat)

## Fehlerbehandlung

Wenn ein Widget oder eine Sektion nicht befuellt werden kann:
- **weather**: Setze `description: "Keine Wetterdaten verfuegbar"`, temp/min/max auf 0
- **pollen**: Setze `level: "unbekannt"`, `types: []`, `description: "Keine Daten verfuegbar"`
- **calendar**: Setze `[]`
- **vps**: Leeres Objekt `{}` (wird im Frontend ignoriert)
- **quote/history/bauernregel**: Generiere plausible Daten aus deinem Wissen (diese Widgets haben keine externe API-Abhaengigkeit)
- **ki_modelle/dev_digest**: Falls keine passenden Artikel in raw-articles.json, verwende dein Wissen ueber aktuelle Entwicklungen. IMMER befuellen!
- **morning_tiles**: Falls keine spezifischen Daten, generiere plausible Inhalte (aktuelle Streaming-Tipps, bekannte regionale Events)

## Dateien

- Config: `/data/.openclaw/workspace/brakefast/sources.json`
- Scripts: `/data/.openclaw/workspace/brakefast/scripts/`
- Output: `/data/.openclaw/workspace/brakefast/output/`
- Editionen (Legacy): `/data/brakefast-public/editions/`
- React JSON: `/data/brakefast-public/data.json`
