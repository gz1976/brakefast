# BrakeFast React

`brakefast-react` ist die React/TypeScript-Implementierung von **BrakeFast**: einer persönlichen, KI-kuratierten Morgenzeitung für Gerhard. Live unter `https://ottobot.net`. Die App rendert sowohl die eigentliche Zeitung als auch einen separaten Monitoring-Bildschirm für Otto/OpenClaw.

Die visuelle Zielrichtung und das grobe Produktkonzept sind in `../BRAKEFAST-REDESIGN-SPEC.md` beschrieben. Diese README dokumentiert den **tatsächlichen aktuellen Implementierungsstand**.

## Aktueller Stand (März 2026)

Die App besteht aus zwei Ansichten:

- `BrakeFast`: Zeitung mit Masthead, Navigation, Hero-Briefing, Morning Tiles, 9 kuratierten Sektionen, Archiv-Navigation und Artikel-Modalen
- `Otto Monitor`: Monitoring-Ansicht für Agenten-, Kosten- und Systemdaten, erreichbar über `#monitor`

Wichtige Features:

- Hash-basiertes Umschalten zwischen Zeitung und Monitor in `src/App.tsx`
- Laden der aktuellen oder archivierten Ausgabe über `useNewspaper()`
- `TimeMachineBar` für historische Ausgaben über `?edition=YYYY-MM-DD`
- Read-Tracking pro Artikel/Headline via `localStorage`
- klickbare Headlines- und History-Elemente mit Detail-/Artikel-Modalen
- lokale Entwicklungsdaten über JSON-Dateien im `public/`-Ordner
- Zod-basierte Schema-Validierung aller JSON-Datenquellen (useNewspaper, useMonitoring)
- ErrorBoundary pro Sektion — ein Render-Crash bricht nie die ganze Zeitung
- URL-Deduplizierung: Tracking-Parameter werden entfernt, Duplikate herausgefiltert
- Accessibility: Skip-to-Content-Link, Focus-Trap in allen Modalen, Focus-Visible CSS
- Toast-Benachrichtigungen für transiente Rückmeldungen
- Lesehistorie löschbar (Doppelklick-Bestätigung im Footer)
- 117 Vitest-Tests in 9 Testdateien (Schemas, Hooks, Komponenten)

## Ansichten und Flow

### 1. Zeitung

Der Haupteinstieg läuft über `src/App.tsx` und `src/components/BrakeFastApp.tsx`.

Die Render-Reihenfolge ist:

1. `Masthead`
2. `NavTabs`
3. `TimeMachineBar`
4. First Screen mit `HeroBriefing` und `MorningTiles`
5. `AI & Tech` (CategorySection via TechHub)
6. `KNAPP & Intralogistik` (CategorySection)
7. `Dev Digest` (CategorySection)
8. `KI Modelle` (CategorySection)
9. `Security` (CategorySection)
10. `Welt` (CategorySection)
11. `Steiermark` (CategorySection)
12. `E-Mobilität` (CategorySection)
13. `Footer`

**Alle Kategorien** nutzen die einheitliche `CategorySection`-Komponente. Die früheren Spezial-Komponenten `KnappSection`, `KiModelleSection` und `DevDigestSection` sind nicht mehr aktiv.

Interaktionsmodell:

- Linksklick auf Artikel öffnet das interne Modal
- Headlines und historische Ereignisse werden in `DetailModal` dargestellt
- gelesene Inhalte werden lokal persistiert und visuell markiert

First-Screen-Aufteilung:

- linke Spalte: automatisch gewählte Top Story plus `Schlagzeilen — 3 in 30 Sekunden`
- rechte Spalte: Wetter, Tagesinfo, Termine, Zitat und Historie als kompakter Status-Stack
- Termine-Karte: Blur nur wenn Termine vorhanden; sonst "Freier Tag — keine Termine"
- darunter: `MorningTiles` mit `Wort des Tages`, Streaming, Media-Tipp und Events

### 2. Otto Monitor

Die Monitor-Ansicht wird in `src/components/OttoMonitor.tsx` aufgebaut und lädt Daten über `useMonitoring()`. Zeigt Agenten-Aktivität, Routing, Modell-Performance, Kosten, Systemzustand und Events.

## Datenquellen

### Zeitung

`useNewspaper()` lädt je nach Umgebung unterschiedliche Endpunkte:

- Development:
  - `/local-data.json`
  - Fallback `/sample-data.json`
  - Archivindex `/archive-index.json`
  - einzelne Archivdateien über `/time-machine/<datum>.json`
- Production:
  - `/latest/data.json`
  - Archivindex `/legacy/archive-index.json`
  - archivierte Ausgaben über `/legacy/YYYY/MM/DD/data.json`

Wichtige Normalisierungen in `useNewspaper()`:

- Legacy-`weather`-String wird bei Bedarf in `widgets.weather` überführt
- fehlendes `generated` wird ersetzt
- `totalArticles` wird bei Bedarf aus den Kategorien berechnet
- `reading_time_total` wird aus Artikelinhalten rekonstruiert, wenn nicht vorhanden

### Monitoring

`useMonitoring()` lädt:

- Development: `/local-monitoring.json` (Fallback `/sample-monitoring.json`)
- Production: `/latest/monitoring.json`

## Relevante Datenstruktur

Die zentralen Typen liegen in `src/types.ts`.

Wichtige Root-Blöcke in `NewspaperData`:

- `widgets`
- `categories` (alle 9 Kategorien)
- `morning_tiles`
- `edition_number`
- `reading_time_total`

### `categories`

Alle 9 Kategorien nutzen die gleiche Artikel-Struktur:

| ID | Name | Artikel |
|----|------|---------|
| `ai` | AI & Machine Learning | 6 |
| `security` | Security | 6 |
| `tech` | Tech & Dev | 6 |
| `knapp` | KNAPP & Intralogistik | 4 |
| `ev` | Elektromobilität | 6 |
| `world` | Welt & Politik | 6 |
| `local` | Steiermark & Lokal | 6 |
| `ki_modelle` | KI Modelle | 4 |
| `dev_digest` | Dev Digest | 4 |

Jeder Artikel hat: `title`, `link`, `source`, `date`, `image`, `description`, `summary`, `reading_time_minutes`, `relevance_score`.

### `widgets`

- `weather` mit `temp`, `feelsLike`, `min`, `max`, `icon`, `location`
- `dayInfo` mit `sunrise`, `sunset`, `dayLength`, `namenstag`
- `calendar` für Tages-Termine
- `quote` für das Tageszitat
- `history` als einzelnes Ereignis oder Array
- `pollen` für die Zusatzkarte im Wetterblock
- `word_of_day` für die erste Morning Tile
- `bauernregel` mit `text` und `meaning`
- `vps` mit `disk`, `uptime`, `containers`, `lastAudit`

### `morning_tiles`

- `headlines` — Schlagzeilen (3 in 30 Sekunden)
- `streaming` — Streaming-Tipps
- `events` — Lokale Events
- `media_tip` — Hör-/Lesetipp

### Read-Tracking

Gelesene Inhalte werden im Browser unter dem Key `brakefast-read-items` gespeichert. Tracking kombiniert `link` und optional `title`.

## Komponenten-Überblick

Wichtige Komponenten für die Zeitung:

- `Masthead`: Ausgabe, Datum, Artikelanzahl, Lesezeit
- `NavTabs`: Scroll-/Sections-Navigation
- `TimeMachineBar`: Archiv-Navigation
- `HeroBriefing`: Top Story, 3-in-30-Sekunden-Headlines, Wetter, Tagesinfo, Termine, Zitat, Historie
- `MorningTiles`: Wort des Tages, Streaming, Hör-/Lesetipp, Events
- `CategorySection`: einheitliches Artikel-Raster für alle 9 Kategorien
- `TechHub`: Wrapper für AI & Tech mit Read-State-Durchreichung
- `ArticleModal`, `DetailModal`, `BriefingModal`: Overlay-Detailansichten mit Focus-Trap
- `ErrorBoundary`: Sektions-Level Error-Isolation (Class Component)
- `Toast`: Einblendbare Benachrichtigungskomponente (auto-dismiss)
- `Footer`: Fußzeile mit Editions-Info und Lesehistorie-Löschfunktion (Doppelklick-Bestätigung)

**Nicht mehr aktive Komponenten** (noch im Code, aber nicht importiert):
- `KnappSection` — ersetzt durch CategorySection
- `KiModelleSection` — ersetzt durch CategorySection
- `DevDigestSection` — ersetzt durch CategorySection

## Lokale Entwicklung

### Voraussetzungen

- Node.js
- npm

### Kommandos

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test          # Alle Tests einmal ausführen
npm run test:watch    # Tests im Watch-Modus
npm run test:coverage # Tests mit Coverage-Report
```

### Lokale Mock-Daten

- `public/local-data.json` — Zeitungsdaten mit allen 9 Kategorien
- `public/local-monitoring.json` — Monitoring-Daten

## Wichtige Dateien

- `src/App.tsx`: View-Switching zwischen Zeitung und Monitor
- `src/hooks/useNewspaper.ts`: Laden, Archiv-Handling, Daten-Normalisierung
- `src/hooks/useMonitoring.ts`: Laden der Monitoring-Daten
- `src/hooks/useReadTracker.ts`: Persistenz für gelesen/ungelesen
- `src/components/BrakeFastApp.tsx`: Hauptlayout der Zeitung (9 Kategorien)
- `src/components/HeroBriefing.tsx`: Top Story und Statusbereich
- `src/components/MorningTiles.tsx`: vier kompakte First-Screen-Tiles
- `src/components/CategorySection.tsx`: einheitliches Kategorie-Raster
- `src/components/TimeMachineBar.tsx`: Archiv-Navigation
- `src/styles/newspaper.css`: gesamtes visuelles System
- `src/types.ts`: Datenmodell
- `src/hooks/useFocusTrap.ts`: Fokus-Management für Modale (Trap, Escape, Scroll-Lock)
- `src/utils/schemas.ts`: Zod-Validierungsschemas für Zeitungs- und Monitoring-Daten
- `src/utils/urlUtils.ts`: URL-Normalisierung und Artikel-Deduplizierung
- `src/components/ErrorBoundary.tsx`: Sektions-Level Error Boundary
- `src/components/Toast.tsx`: Toast-Benachrichtigungen
- `vitest.config.ts`: Test-Konfiguration (jsdom, V8 Coverage)
- `src/test-setup.ts`: Test-Setup (jest-dom Matchers)

## Deployment

```bash
# Build
npm run build

# Upload und Deploy auf Server
rsync -avz --delete -e "ssh -o ControlPath=$HOME/.ssh/sockets/otto-vps" dist/ gerhard@clogzoehrer.ddns.net:/tmp/brakefast-dist/
ssh -o ControlPath=~/.ssh/sockets/otto-vps gerhard@clogzoehrer.ddns.net "sudo rsync -av --delete /tmp/brakefast-dist/ /docker/brakefast/react/dist/"
```

Die React-App wird als statische Dateien unter `/docker/brakefast/react/dist/` auf dem VPS serviert. nginx liefert sie unter `ottobot.net` aus.
