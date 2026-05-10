import { useState, useMemo, useEffect, useCallback } from 'react';
import type { NewspaperData, Article, HistoryFact, WorldHeadline, CalendarEvent } from '../types';
import { DetailModal } from './DetailModal';
import { getArticleTeaser, getArticleBody, to24h, translateWeather } from '../utils/textUtils';
import { isValidLeadImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { pickTopStory } from '../utils/scoring';
import { usePrivateCalendar } from '../hooks/usePrivateCalendar';

/* ───────────────────────────────────────────────────────────
   EditorialFirstScreen
   Replaces HeroBriefing + MorningTiles on the iPad first screen.

   Layout (1366×1024, no scroll):
   ┌──────────────────────────────────────────────────────────┐
   │ MASTHEAD (No. + date · BrakeFast logo · KW + weather)   │
   ├──────────────────────────────────────────────────────────┤
   │ Section nav (Titelseite | AI & Tech | KNAPP | Welt …)   │
   ├─────────────────┬────────────────┬───────────────────────┤
   │  TOP STORY      │ SCHLAGZEILEN   │  TODAY (date+wetter)  │
   │  (broadsheet    │ + AN DIESEM    │  TERMINE              │
   │  lead w/ image) │ TAG            │                       │
   ├─────────────────┴────────────────┴───────────────────────┤
   │ STRIP: Wort · Zitat/Podcast tab · Hörtipp · Im Bezirk    │
   └──────────────────────────────────────────────────────────┘
   ─────────────────────────────────────────────────────────── */

interface Props {
  data: NewspaperData;
  calendarRevealed: boolean;
  onArticleClick?: (article: Article) => void;
  isRead?: (link: string, title?: string) => boolean;
  markAsRead?: (link: string, title?: string) => void;
  /** Ordered section list (mirrors NavTabs) — first entry is Titelseite. */
  sections: { id: string; label: string }[];
  activeSectionId: string;
  onSectionNavigate: (id: string) => void;
  /** Edition meta — shown in masthead. */
  editionNumber?: number;
  generatedDate?: string;
  /** Toggles calendar blur. Bind to the right-hand date cell (Option B). */
  onCalendarRevealToggle?: () => void;
}

interface ModalData {
  title: string;
  text?: string;
  source?: string;
  url?: string;
  image?: string;
}

const KIND_LABELS: Record<string, string> = {
  privat: 'Privat',
  arbeit: 'Arbeit',
  work: 'Arbeit',
  private: 'Privat',
};

const WEATHER_ICONS: Record<string, string> = {
  cloud: '☁️', clouds: '☁️', cloudy: '☁️', overcast: '☁️',
  sun: '☀️', sunny: '☀️', clear: '☀️',
  rain: '🌧️', rainy: '🌧️', drizzle: '🌧️',
  snow: '❄️', snowy: '❄️',
  storm: '⛈️', thunder: '⛈️', thunderstorm: '⛈️',
  fog: '🌫️', mist: '🌫️', haze: '🌫️',
  wind: '💨', windy: '💨',
  'partly-cloudy': '⛅', 'partly cloudy': '⛅', partlycloudy: '⛅',
};

function getWeatherEmoji(icon?: string): string {
  if (!icon) return '⛅';
  if (/[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]|[\u2700-\u27BF]/u.test(icon)) return icon;
  return WEATHER_ICONS[icon.toLowerCase()] || '⛅';
}

function getCalendarWeek(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function eventDisplayLabel(ev: CalendarEvent): string {
  if (ev.title) return ev.title;
  return KIND_LABELS[(ev.kind || '').toLowerCase()] || 'Termin';
}

function mergeCalendar(
  publicEvents: CalendarEvent[],
  privateEvents: ReturnType<typeof usePrivateCalendar>['privateEvents'],
): CalendarEvent[] {
  if (!privateEvents) return publicEvents;
  if (privateEvents.length !== publicEvents.length) return publicEvents;
  return publicEvents.map((ev, i) => ({ ...ev, title: privateEvents[i]?.title || ev.title }));
}

function findArticleForHeadline(
  h: WorldHeadline,
  data: NewspaperData,
  excludedArticle?: Article | null,
): Article | undefined {
  const sourceCandidate = findSourceCandidateForHeadline(h, data, excludedArticle);
  if (sourceCandidate) return sourceCandidate;

  const titleTokens = tokenize(h.text);
  const summaryTokens = tokenize(h.summary || '');
  const numericTokens = [...titleTokens].filter(token => /^\d+$/.test(token));
  const distinctiveNumbers = (h.text.match(/\d[\d.]*/g) || [])
    .map(value => value.replace(/\D/g, ''))
    .filter(value => value.length >= 5);
  let best: { article: Article; score: number } | undefined;

  for (const cat of Object.values(data.categories)) {
    for (const art of cat.articles || []) {
      if (
        excludedArticle &&
        h.text !== excludedArticle.title &&
        (art.link === excludedArticle.link || art.title === excludedArticle.title)
      ) {
        continue;
      }
      if (art.title === h.text || art.link === h.url) return art;
      if (h.url && (art.canonical_url === h.url || art.source_url === h.url)) return art;
      const articleRaw = [
        art.title,
        art.headline,
        art.summary,
        art.description,
        art.dek,
      ].filter(Boolean).join(' ');
      if (
        distinctiveNumbers.length > 0 &&
        distinctiveNumbers.some(value => articleRaw.replace(/\D/g, '').includes(value))
      ) {
        return art;
      }

      const articleTokens = tokenize(articleRaw);
      const sourceMatches = h.source && art.source && h.source.toLowerCase() === art.source.toLowerCase();
      if (numericTokens.length > 0 && numericTokens.every(token => articleTokens.has(token))) {
        return art;
      }
      const sourceTitleMatches = sourceMatches
        ? [...titleTokens].filter(token => articleTokens.has(token)).length
        : 0;
      if (sourceTitleMatches >= 2) {
        return art;
      }
      const titleOverlap = overlapScore(titleTokens, articleTokens);
      const summaryOverlap = overlapScore(summaryTokens, articleTokens);
      const score = titleOverlap * 3 + summaryOverlap + (sourceMatches ? 0.35 : 0);

      if (score >= 1.2 && (!best || score > best.score)) {
        best = { article: art, score };
      }
    }
  }
  return best?.article;
}

function findArticleByUrl(url: string, newspaper: NewspaperData): Article | undefined {
  for (const cat of Object.values(newspaper.categories)) {
    const article = (cat.articles || []).find(candidate =>
      candidate.link === url ||
      candidate.canonical_url === url ||
      candidate.source_url === url
    );
    if (article) return article;
  }
  return undefined;
}

function findSourceCandidateForHeadline(
  h: WorldHeadline,
  data: NewspaperData,
  excludedArticle?: Article | null,
): Article | undefined {
  if (!h.source) return undefined;
  const headlineWords = (h.text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 4);

  for (const cat of Object.values(data.categories)) {
    for (const art of cat.articles || []) {
      if (
        excludedArticle &&
        h.text !== excludedArticle.title &&
        (art.link === excludedArticle.link || art.title === excludedArticle.title)
      ) {
        continue;
      }
      if (!art.source || art.source.toLowerCase() !== h.source.toLowerCase()) continue;
      const raw = [art.title, art.headline, art.summary, art.description, art.dek]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
      const matches = headlineWords.filter(word => raw.includes(word)).length;
      if (matches >= 2) return art;
    }
  }
  return undefined;
}

const TOKEN_STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'eine', 'einer', 'einem', 'einen', 'mit',
  'von', 'vor', 'bei', 'auf', 'für', 'als', 'ist', 'hat', 'haben', 'seine',
  'seinen', 'seiner', 'noch', 'mehr', 'wie', 'nach', 'aus', 'dem', 'den',
]);

function tokenize(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  return new Set(
    normalized
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length > 2 && !TOKEN_STOPWORDS.has(token)),
  );
}

function overlapScore(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0 || haystack.size === 0) return 0;
  let matches = 0;
  for (const token of needle) {
    if (haystack.has(token)) matches += 1;
  }
  return matches / Math.max(1, Math.min(needle.size, haystack.size));
}

function headlineFromArticle(article: Article): WorldHeadline {
  return {
    text: article.title,
    source: article.source,
    summary: getArticleTeaser(article),
    url: article.link,
  };
}

function headlineKey(headline: WorldHeadline): string {
  if (headline.url) return `url:${headline.url}`;
  return headlineTextKey(headline);
}

function headlineTextKey(headline: WorldHeadline): string {
  const tokens = tokenize(headline.text);
  return `text:${[...tokens].sort().slice(0, 6).join('|') || headline.text.toLowerCase()}`;
}

function articleMatchesHeadline(article: Article | null | undefined, headline: WorldHeadline): boolean {
  if (!article) return false;
  if (headline.url && [article.link, article.canonical_url, article.source_url].includes(headline.url)) return true;
  if (article.title === headline.text) return true;
  const articleTokens = tokenize(article.title);
  const headlineTokens = tokenize(headline.text);
  return overlapScore(headlineTokens, articleTokens) >= 0.65;
}

function buildDisplayHeadlines(
  sourceHeadlines: WorldHeadline[],
  data: NewspaperData,
  topStory: Article | null,
): WorldHeadline[] {
  const result: WorldHeadline[] = [];
  const seen = new Set<string>();
  const push = (headline: WorldHeadline) => {
    if (articleMatchesHeadline(topStory, headline)) return;
    const keys = [headlineKey(headline), headlineTextKey(headline)];
    if (keys.some(key => seen.has(key))) return;
    keys.forEach(key => seen.add(key));
    result.push(headline);
  };

  for (const headline of sourceHeadlines) {
    const article = headline.url
      ? findArticleByUrl(headline.url, data)
      : findArticleForHeadline(headline, data, topStory);
    if (article) {
      const sourceMatches = headline.url ||
        !headline.source ||
        !article.source ||
        headline.source.toLowerCase() === article.source.toLowerCase();
      if (!sourceMatches) continue;
      push({
        text: headline.text || article.title,
        source: headline.source || article.source,
        summary: headline.summary || getArticleTeaser(article),
        url: article.link,
      });
    } else if (headline.url) {
      push(headline);
    }
  }

  const worldArticles = data.categories.world?.articles || [];
  worldArticles.map(headlineFromArticle).forEach(push);

  for (const cat of Object.values(data.categories)) {
    for (const article of cat.articles || []) {
      push(headlineFromArticle(article));
      if (result.length >= 4) return result.slice(0, 4);
    }
  }

  return result.slice(0, 4);
}

function TopStoryVisual({ article }: { article: Article }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidLeadImage(article.image) && !failed;
  if (valid) {
    return (
      <img
        src={article.image}
        alt={article.title}
        className="ed-lead-image"
        loading="eager"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="ed-lead-image ed-lead-image-placeholder"
      style={{ background: getCategoryGradient(article.category || 'tech') }}
      aria-hidden="true"
    >
      <span className="ed-lead-image-icon">{getCategoryIcon(article.category || 'tech')}</span>
    </div>
  );
}

export function EditorialFirstScreen({
  data,
  calendarRevealed,
  onArticleClick,
  isRead,
  markAsRead,
  sections,
  activeSectionId,
  onSectionNavigate,
  editionNumber,
  generatedDate,
  onCalendarRevealToggle,
}: Props) {
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [stripTab, setStripTab] = useState<'zitat' | 'podcast'>('zitat');

  // Data extraction (mirrors HeroBriefing.tsx exactly so behaviour is identical)
  const weatherRaw = data.widgets?.weather;
  const weatherUnavailable = weatherRaw && weatherRaw.temp === 0 && (weatherRaw.description || '').includes('Keine');
  const weather = weatherUnavailable ? undefined : weatherRaw;
  const dayInfo = data.widgets?.dayInfo;

  const rawCalendar = useMemo(() => data.widgets?.calendar || [], [data.widgets?.calendar]);
  const { privateEvents } = usePrivateCalendar();
  const calendar = useMemo(() => mergeCalendar(rawCalendar, privateEvents), [rawCalendar, privateEvents]);

  const headlines = useMemo(() => data.morning_tiles?.headlines || [], [data.morning_tiles?.headlines]);
  const editionDate = useMemo(
    () => generatedDate ? new Date(generatedDate) : (data.generated ? new Date(data.generated) : new Date()),
    [data.generated, generatedDate],
  );
  const weekday = editionDate.toLocaleDateString('de-AT', { weekday: 'long' });
  const fullDate = editionDate.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const calWeek = getCalendarWeek(editionDate);

  // Day navigation: 0 = edition date, ±7 max
  const [calDayOffset, setCalDayOffset] = useState(0);
  const selectedCalDate = useMemo(() => {
    const d = new Date(Date.UTC(editionDate.getFullYear(), editionDate.getMonth(), editionDate.getDate()));
    d.setUTCDate(d.getUTCDate() + calDayOffset);
    return d.toISOString().slice(0, 10);
  }, [editionDate, calDayOffset]);
  const dayEvents = useMemo(() =>
    calendar.filter(ev => ev.date ? ev.date === selectedCalDate : calDayOffset === 0),
    [calendar, selectedCalDate, calDayOffset]
  );
  const calNavLabel = useMemo(() => {
    if (calDayOffset === 0) return 'heute';
    const d = new Date(selectedCalDate + 'T00:00:00');
    return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' });
  }, [calDayOffset, selectedCalDate]);

  const historyRaw = data.widgets?.history;
  const historyFacts: HistoryFact[] = Array.isArray(historyRaw) ? historyRaw : (historyRaw ? [historyRaw] : []);
  const FALLBACK_WIKIS = new Set(['RMS_Titanic', 'Hillsborough-Katastrophe']);
  const historyAllFallback = historyFacts.length > 0 && historyFacts.every(f => f.wiki && FALLBACK_WIKIS.has(f.wiki));

  const topStory = useMemo(() => pickTopStory(data), [data]);
  const displayHeadlines = useMemo(
    () => buildDisplayHeadlines(headlines, data, topStory),
    [data, headlines, topStory],
  );

  const wordOfDay = data.widgets?.word_of_day;
  const quote = data.widgets?.quote;
  const events = data.morning_tiles?.events || [];
  const mediaTips = data.morning_tiles?.media_tips
    || (data.morning_tiles?.media_tip ? [data.morning_tiles.media_tip] : []);

  const openHeadline = (h: WorldHeadline) => {
    const linkedArticle = h.url ? findArticleByUrl(h.url, data) : undefined;
    const art = linkedArticle || findArticleForHeadline(h, data, topStory);
    if (art) {
      markAsRead?.(art.link, art.title);
      setModalData(null);
      onArticleClick?.(art);
      return;
    }
    markAsRead?.(h.url || '', h.text);
    setModalData({
      title: h.text,
      text: h.summary || undefined,
      source: h.source,
      url: h.url,
    });
  };

  const openHistory = (fact: HistoryFact) => {
    setModalData({
      title: `${fact.year}: ${fact.text}`,
      text: fact.description || `${fact.text}. Dieses historische Ereignis jährt sich heute im Jahr ${fact.year}.`,
      url: fact.url,
      image: fact.image,
      source: fact.url ? 'Wikipedia' : undefined,
    });
  };

  // Esc closes weather modal
  const escHandler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && weatherModalOpen) setWeatherModalOpen(false);
  }, [weatherModalOpen]);
  useEffect(() => {
    if (weatherModalOpen) {
      document.addEventListener('keydown', escHandler);
      return () => document.removeEventListener('keydown', escHandler);
    }
  }, [weatherModalOpen, escHandler]);

  if (!topStory) {
    return <div className="ed-empty">Keine Top Story verfügbar.</div>;
  }

  const teaserText = getArticleTeaser(topStory);
  const bodyText = getArticleBody(topStory) || teaserText;

  return (
    <section className="ed-firstscreen" id="top-stories">
      {/* ─── Masthead ─── */}
      <header className="ed-masthead">
        <div className="ed-masthead-l">
          <span>Voitsberg, Steiermark · KW {calWeek}</span>
          {weather && (
            <span className="ed-weather-line">
              {getWeatherEmoji(weather.icon)} {weather.temp}° · {translateWeather(weather.description)}
            </span>
          )}
        </div>
        <div className="ed-masthead-c">
          <div
            className="ed-logo ed-logo-clickable"
            onClick={() => window.location.reload()}
            role="button"
            tabIndex={0}
            title="Seite neu laden"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.reload(); }}
          >BrakeFast</div>
          <div className="ed-tagline">Deine persönliche Morgenzeitung</div>
        </div>
        <div className="ed-masthead-r">
          <span
            className="ed-date-toggle"
            onClick={onCalendarRevealToggle}
            role={onCalendarRevealToggle ? 'button' : undefined}
            tabIndex={onCalendarRevealToggle ? 0 : undefined}
            title={onCalendarRevealToggle ? 'Termine ein- oder ausblenden' : undefined}
            aria-label={onCalendarRevealToggle ? 'Termine ein- oder ausblenden' : undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && onCalendarRevealToggle) {
                e.preventDefault();
                onCalendarRevealToggle();
              }
            }}
            style={onCalendarRevealToggle ? { cursor: 'pointer' } : undefined}
          >
            <span aria-hidden="true" className="ed-date-toggle-icon">▦</span>
            {fullDate}
          </span>
          {editionNumber != null && (
            <span className="ed-edition">No. {editionNumber} · Frühausgabe</span>
          )}
        </div>
      </header>

      {/* ─── Section nav ─── */}
      <nav className="ed-nav">
        {sections.map(s => (
          <button
            key={s.id}
            className={s.id === activeSectionId ? 'active' : ''}
            onClick={() => onSectionNavigate(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ─── Three-column broadsheet ─── */}
      <main className="ed-main">
        {/* Column 1 — Lead */}
        <div className="ed-col ed-col-1">
          <div className="ed-kicker">Top Story · {topStory.source}</div>
          <h1
            className="ed-headline"
            onClick={() => { markAsRead?.(topStory.link, topStory.title); onArticleClick?.(topStory); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                markAsRead?.(topStory.link, topStory.title);
                onArticleClick?.(topStory);
              }
            }}
          >
            {topStory.title}
          </h1>
          {teaserText && (
            <p className="ed-deck">{teaserText.split('.').slice(0, 1).join('.')}.</p>
          )}
          <div className="ed-byline">
            Von <strong>{topStory.author || topStory.source}</strong>
            {topStory.reading_time_minutes ? ` · ${topStory.reading_time_minutes} Min. Lesezeit` : ''}
            {topStory.date ? ` · ${topStory.date}` : ''}
          </div>
          <div
            className="ed-lead-image-wrap"
            onClick={() => { markAsRead?.(topStory.link, topStory.title); onArticleClick?.(topStory); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                markAsRead?.(topStory.link, topStory.title);
                onArticleClick?.(topStory);
              }
            }}
          >
            <TopStoryVisual article={topStory} />
          </div>
          {topStory.source && (
            <div className="ed-caption">— Bild: {topStory.source}</div>
          )}
          {bodyText && (
            <div className="ed-body">
              <p>{bodyText}</p>
            </div>
          )}
        </div>

        {/* Column 2 — Schlagzeilen + Geschichte */}
        <div className="ed-col ed-col-2">
          {weather ? (
            <div
              className="ed-weather-row ed-weather-compact"
              onClick={() => setWeatherModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWeatherModalOpen(true); }}
            >
              <div className="ed-w-temp">{weather.temp}°</div>
              <div className="ed-w-meta">
                <strong>{translateWeather(weather.description)}</strong>
                Gefühlt {weather.feelsLike}° · {weather.min}°/{weather.max}°
                {weather.location ? ` · ${weather.location}` : ''}
              </div>
              <div className="ed-w-icon">{getWeatherEmoji(weather.icon)}</div>
            </div>
          ) : (
            <div className="ed-weather-empty ed-weather-compact">Wetter nicht verfügbar</div>
          )}
          <div className="ed-section-title">
            <span>Schlagzeilen</span>
            <span className="ed-section-meta">{displayHeadlines.length} in {displayHeadlines.length * 10} Sek.</span>
          </div>
          <div className="ed-headlines">
            {displayHeadlines.map((h, i) => {
              const unread = !!(isRead && !isRead(h.url || '', h.text));
              return (
                <div
                  key={i}
                  className="ed-headline-item"
                  onClick={() => openHeadline(h)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openHeadline(h); }}
                >
                  <div className="ed-h-source">{h.source}</div>
                  <div className="ed-h-title">
                    {unread && <span className="ed-h-unread" aria-hidden="true" />}
                    {h.text}
                  </div>
                  {h.summary && <div className="ed-h-summary">{h.summary}</div>}
                </div>
              );
            })}
          </div>

          {historyFacts.length > 0 && (
            <>
              <div className="ed-section-title">
                <span>An diesem Tag</span>
                <span className="ed-section-meta">in der Geschichte</span>
              </div>
              {historyAllFallback ? (
                <div className="ed-history-empty">Keine tagesaktuellen Einträge</div>
              ) : (
                <div className="ed-history-list">
                  {historyFacts.slice(0, 3).map((f, i) => (
                    <div
                      key={i}
                      className="ed-history-item"
                      onClick={() => openHistory(f)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openHistory(f); }}
                    >
                      <div className="ed-history-year">{f.year}</div>
                      <div className="ed-history-text">{f.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>

        {/* Column 3 — Today + Termine */}
        <div className="ed-col ed-col-3">
          <div className="ed-today">
            <div className="ed-today-date">{weekday}</div>
            <div className="ed-today-sub">
              {editionDate.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })} · KW {calWeek}
            </div>
            {dayInfo?.namenstag && (
              <div className="ed-today-namenstag">
                <span className="ed-today-namenstag-label">Namenstag</span>
                <span className="ed-today-namenstag-val">{dayInfo.namenstag}</span>
              </div>
            )}

            {dayInfo && (
              <div className="ed-suninfo">
                <div>
                  <div className="ed-suninfo-label">Aufgang</div>
                  <div className="ed-suninfo-val">{to24h(dayInfo.sunrise)}</div>
                </div>
                <div>
                  <div className="ed-suninfo-label">Untergang</div>
                  <div className="ed-suninfo-val">{to24h(dayInfo.sunset)}</div>
                </div>
                <div>
                  <div className="ed-suninfo-label">Tageslänge</div>
                  <div className="ed-suninfo-val">{dayInfo.dayLength || '—'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="ed-section-title ed-section-title--cal">
            <span>Termine</span>
            <div className="ed-cal-nav">
              <button
                className="ed-cal-nav-btn"
                onClick={() => setCalDayOffset(o => Math.max(-7, o - 1))}
                disabled={calDayOffset <= -7}
                aria-label="Vorheriger Tag"
              >‹</button>
              <span className="ed-cal-nav-label">{calNavLabel}</span>
              <button
                className="ed-cal-nav-btn"
                onClick={() => setCalDayOffset(o => Math.min(7, o + 1))}
                disabled={calDayOffset >= 7}
                aria-label="Nächster Tag"
              >›</button>
            </div>
          </div>
          <div className={`ed-cal-list${!calendarRevealed ? ' ed-cal-list-blurred' : ''}`}>
            {dayEvents.length > 0 ? (
              dayEvents.map((ev, i) => (
                <div key={i} className="ed-cal-item">
                  <div className="ed-cal-time">{ev.time}</div>
                  <div className="ed-cal-title">{eventDisplayLabel(ev)}</div>
                </div>
              ))
            ) : (
              <div className="ed-cal-empty">Keine Termine</div>
            )}
          </div>
        </div>

        {/* ─── Bottom strip ─── */}
        <div className="ed-strip">
          {/* Wort des Tages */}
          <div className="ed-strip-tile">
            <div className="ed-strip-label">Wort des Tages</div>
            {wordOfDay ? (
              <>
                <div className="ed-strip-word">„{wordOfDay.word}"</div>
                <div className="ed-strip-meaning">{wordOfDay.explanation || wordOfDay.meaning || ''}</div>
                {(wordOfDay.origin || wordOfDay.example) && (
                  <div className="ed-strip-origin">{wordOfDay.origin || wordOfDay.example}</div>
                )}
              </>
            ) : (
              <div className="ed-strip-meaning ed-strip-empty">Heute kein Eintrag</div>
            )}
          </div>

          {/* Zitat / Podcast tab */}
          <div className="ed-strip-tile">
            <div className="ed-strip-tabs">
              <button className={stripTab === 'zitat' ? 'on' : ''} onClick={() => setStripTab('zitat')}>Zitat</button>
              <button className={stripTab === 'podcast' ? 'on' : ''} onClick={() => setStripTab('podcast')}>Podcast</button>
            </div>
            {stripTab === 'zitat' && quote && quote.text && (
              <>
                <blockquote className="ed-strip-quote">„{quote.text}"</blockquote>
                {quote.author && <div className="ed-strip-author">— {quote.author}</div>}
              </>
            )}
            {stripTab === 'podcast' && mediaTips[0] && (
              <>
                <div
                  className="ed-strip-pod-title"
                  onClick={() => setModalData({
                    title: mediaTips[0].episode_title || mediaTips[0].title,
                    text: mediaTips[0].summary,
                    source: mediaTips[0].source,
                    url: mediaTips[0].episode_url || mediaTips[0].url,
                  })}
                  role="button"
                  tabIndex={0}
                >
                  {mediaTips[0].episode_title || mediaTips[0].title}
                </div>
                <div className="ed-strip-pod-meta">
                  {mediaTips[0].source}{mediaTips[0].duration ? ` · ${mediaTips[0].duration}` : ''}
                </div>
              </>
            )}
            {stripTab === 'zitat' && (!quote || !quote.text) && (
              <div className="ed-strip-meaning ed-strip-empty">Heute kein Zitat</div>
            )}
            {stripTab === 'podcast' && !mediaTips[0] && (
              <div className="ed-strip-meaning ed-strip-empty">Kein Podcast-Tipp</div>
            )}
          </div>

          {/* Hörtipp — hidden while the Podcast tab is active to avoid duplicated content. */}
          <div className={`ed-strip-tile${stripTab === 'podcast' ? ' ed-strip-tile-muted' : ''}`}>
            <div className="ed-strip-label">{stripTab === 'podcast' ? 'Zitat' : 'Hörtipp'}</div>
            {stripTab === 'podcast' && quote && quote.text ? (
              <>
                <blockquote className="ed-strip-quote">„{quote.text}"</blockquote>
                {quote.author && <div className="ed-strip-author">— {quote.author}</div>}
              </>
            ) : mediaTips[0] ? (
              <>
                <div
                  className="ed-strip-pod-title"
                  onClick={() => setModalData({
                    title: mediaTips[0].episode_title || mediaTips[0].title,
                    text: mediaTips[0].summary,
                    source: mediaTips[0].source,
                    url: mediaTips[0].episode_url || mediaTips[0].url,
                  })}
                  role="button"
                  tabIndex={0}
                >
                  {mediaTips[0].episode_title || mediaTips[0].title}
                </div>
                <div className="ed-strip-pod-meta">
                  {mediaTips[0].source}{mediaTips[0].duration ? ` · ${mediaTips[0].duration}` : ''}
                </div>
              </>
            ) : (
              <div className="ed-strip-meaning ed-strip-empty">
                {stripTab === 'podcast' ? 'Heute kein Zitat' : 'Kein Hörtipp heute'}
              </div>
            )}
          </div>

          {/* Im Bezirk */}
          <div className="ed-strip-tile">
            <div className="ed-strip-label">Im Bezirk</div>
            {events.length > 0 ? (
              events.slice(0, 2).map((ev, i) => (
                <div
                  key={i}
                  className="ed-strip-event"
                  onClick={() => setModalData({
                    title: ev.title,
                    text: `📅 ${ev.date}\n📍 ${ev.location}${ev.type ? `\n🏷️ ${ev.type}` : ''}${ev.summary ? `\n\n${ev.summary}` : ''}`,
                    source: ev.source,
                    url: ev.url,
                  })}
                  role="button"
                  tabIndex={0}
                >
                  <strong>{ev.title}</strong>
                  <span className="ed-strip-event-meta">{ev.date} · {ev.location}</span>
                </div>
              ))
            ) : (
              <div className="ed-strip-meaning ed-strip-empty">Keine Events</div>
            )}
          </div>
        </div>
      </main>

      {modalData && (
        <DetailModal
          title={modalData.title}
          text={modalData.text}
          source={modalData.source}
          url={modalData.url}
          image={modalData.image}
          onClose={() => setModalData(null)}
        />
      )}

      {weatherModalOpen && weather && (
        <div className="modal-overlay" onClick={() => setWeatherModalOpen(false)}>
          <div className="modal-content weather-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setWeatherModalOpen(false)} aria-label="Schließen">×</button>
            <div className="weather-modal-header">
              <span className="weather-modal-icon">{getWeatherEmoji(weather.icon)}</span>
              <div className="weather-modal-temp">{weather.temp}°C</div>
            </div>
            <div className="weather-modal-location">{weather.location || 'Voitsberg'}</div>
            <div className="weather-modal-desc">{translateWeather(weather.description)}</div>
            <div className="weather-modal-grid">
              <div className="weather-modal-card">
                <span className="weather-modal-card-label">Gefühlt</span>
                <span className="weather-modal-card-value">{weather.feelsLike}°C</span>
              </div>
              <div className="weather-modal-card">
                <span className="weather-modal-card-label">Minimum</span>
                <span className="weather-modal-card-value">{weather.min}°C</span>
              </div>
              <div className="weather-modal-card">
                <span className="weather-modal-card-label">Maximum</span>
                <span className="weather-modal-card-value">{weather.max}°C</span>
              </div>
              {weather.wind && (
                <div className="weather-modal-card">
                  <span className="weather-modal-card-label">Wind</span>
                  <span className="weather-modal-card-value">{weather.wind}</span>
                </div>
              )}
              {weather.humidity !== undefined && (
                <div className="weather-modal-card">
                  <span className="weather-modal-card-label">Feuchtigkeit</span>
                  <span className="weather-modal-card-value">{weather.humidity}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
