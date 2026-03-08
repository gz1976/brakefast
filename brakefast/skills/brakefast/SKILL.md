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
         "tag": "Modell"
       },
       "benchmarks": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Ranking" },
       "pricing": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "API" },
       "tools": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Update" }
     },
     "dev_digest": {
       "github_trending": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Repo" },
       "releases": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Update" },
       "hn_top": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "Diskussion" },
       "security_advisory": { "title": "...", "content": "...", "source": "...", "date": "...", "tag": "CVE" }
     }
   }
   EOF
   ```

   **WICHTIG: Pflichtfelder im JSON:**
   - `generated`: ISO-8601 Timestamp
   - `totalArticles`: Gesamtanzahl der kuratierten Artikel (Zahl)
   - `edition_number`: Fortlaufende Ausgabennummer (Zahl, MUSS inkrementiert werden)
   - `reading_time_total`: Geschaetzte Gesamtlesezeit in Minuten

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

   **Sektionen (ki_modelle, dev_digest):**
   - `ki_modelle`: 4 Info-Karten ueber aktuelle KI-Modell-Entwicklungen (Releases, Benchmarks, Preise, Tools)
   - `dev_digest`: 4 Info-Karten (GitHub Trending, Software Releases, HN Top Story, Security Advisory)
   - `content`-Feld darf HTML enthalten (z.B. `<strong>...</strong>`)
   - Diese Sektionen werden NICHT aus RSS-Feeds generiert, sondern vom Chefredakteur recherchiert

   **Kategorie: Elektromobilität (`ev`)**
   - 6 Artikel zu E-Autos, Tesla, Ladeinfrastruktur, Batterietechnik
   - Gerhard ist Tesla-Besitzer und Fan — hohe Relevanz!
   - Quellen: Teslamag, Elektroauto News, Ecomento, InsideEVs, Electrek

   **Widget-Daten sammeln (ALLE muessen befuellt werden!):**
   - **Wetter**: `curl -s "wttr.in/Voitsberg?format=j1"` → temp, feelsLike, min, max, icon
   - **VPS**: `df -h /` fuer Disk, `docker ps -q | wc -l` fuer Container
   - **Tagesinfo**: Sonnenzeiten via wttr.in, Namenstag nachschlagen
   - **Kalender**: Lies `/data/.openclaw/workspace/brakefast/output/calendar-events.json` (wird automatisch von fetch-calendar.py befuellt). Verwende die Daten fuer `widgets.calendar`. Falls die Datei leer ist oder `[]` enthaelt, setze `calendar: []`.
   - **Zitat**: Taeglich variierendes inspirierendes Zitat (Tech/Wissenschaft/Philosophie)
   - **Geschichte**: Was passierte heute in der Geschichte? (Jahr + kurzer Satz)
   - **Bauernregel**: Passende Bauernregel zum heutigen Datum
   - **Pollenflug**: Aktuelle Pollenbelastung fuer Voitsberg/Steiermark

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
   "Guten Morgen! Deine BrakeFast ist fertig: https://ottobot.net/"

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

## Dateien

- Config: `/data/.openclaw/workspace/brakefast/sources.json`
- Scripts: `/data/.openclaw/workspace/brakefast/scripts/`
- Output: `/data/.openclaw/workspace/brakefast/output/`
- Editionen (Legacy): `/data/brakefast-public/editions/`
- React JSON: `/data/brakefast-public/data.json`
