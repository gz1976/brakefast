import { useState, useEffect, useCallback } from 'react';
import type { NewspaperData, HistoryFact, Article, WorldHeadline, CalendarEvent } from '../types';
import { DetailModal } from './DetailModal';
import { getArticleTeaser, to24h, translateWeather } from '../utils/textUtils';
import { getCategoryGradient, getCategoryIcon, isValidLeadImage } from '../utils/imageUtils';
import { pickTopStory } from '../utils/scoring';
import { usePrivateCalendar } from '../hooks/usePrivateCalendar';

const KIND_LABELS: Record<string, string> = {
  privat: 'Privat',
  arbeit: 'Arbeit',
  work: 'Arbeit',
  private: 'Privat',
};

function mergeCalendar(
  publicEvents: CalendarEvent[],
  privateEvents: ReturnType<typeof usePrivateCalendar>['privateEvents'],
): CalendarEvent[] {
  if (!privateEvents) return publicEvents;
  // privateEvents has the same order + length as publicEvents by construction
  // (same pipeline run, same sort). If lengths differ (stale cache), fall back
  // to public so we never show mismatched titles for the wrong slot.
  if (privateEvents.length !== publicEvents.length) return publicEvents;
  return publicEvents.map((ev, i) => ({ ...ev, title: privateEvents[i]?.title || ev.title }));
}

function eventDisplayLabel(ev: CalendarEvent): string {
  if (ev.title) return ev.title;
  return KIND_LABELS[(ev.kind || '').toLowerCase()] || 'Termin';
}

/** Map text icon names from pipeline to emoji */
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

function getWeatherEmoji(icon: string | undefined): string {
  if (!icon) return '☁️';
  // Already an emoji
  if (/[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]|[\u2700-\u27BF]/u.test(icon)) return icon;
  return WEATHER_ICONS[icon.toLowerCase()] || '☁️';
}

interface Props {
  data: NewspaperData;
  calendarRevealed: boolean;
  onArticleClick?: (article: Article) => void;
  isRead?: (link: string, title?: string) => boolean;
  markAsRead?: (link: string, title?: string) => void;
}

interface ModalData {
  title: string;
  text?: string;
  source?: string;
  url?: string;
  image?: string;
}

function getCalendarWeek(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function TopStoryVisual({ article }: { article: Article }) {
  const [failed, setFailed] = useState(false);
  const categoryId = article.category || 'tech';
  const valid = isValidLeadImage(article.image) && !failed;

  if (valid) {
    return (
      <img
        src={article.image}
        alt={article.title}
        className="top-story-image"
        loading="eager"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="top-story-image top-story-image-placeholder"
      style={{ background: getCategoryGradient(categoryId) }}
      aria-hidden="true"
    >
      <span className="top-story-image-placeholder-icon">{getCategoryIcon(categoryId)}</span>
    </div>
  );
}

/** Try to find the matching article for a headline */
function findArticleForHeadline(headline: WorldHeadline, data: NewspaperData): Article | undefined {
  for (const cat of Object.values(data.categories)) {
    for (const art of cat.articles || []) {
      if (art.title === headline.text || art.link === headline.url) return art;
    }
  }
  return undefined;
}

export function HeroBriefing({ data, calendarRevealed, onArticleClick, isRead, markAsRead }: Props) {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const weatherRaw = data.widgets?.weather;
  // Detect empty weather: pipeline sends temp=0 + "Keine Wetterdaten" when service is down
  const weatherUnavailable = weatherRaw
    && weatherRaw.temp === 0
    && (weatherRaw.description || '').includes('Keine');
  const weather = weatherUnavailable ? undefined : weatherRaw;
  const dayInfo = data.widgets?.dayInfo;
  const pollen = data.widgets?.pollen;
  const rawCalendar = data.widgets?.calendar || [];
  const { privateEvents } = usePrivateCalendar();
  const calendar = mergeCalendar(rawCalendar, privateEvents);
  const calendarCount = calendar.length;
  const headlines = data.morning_tiles?.headlines || [];
  const editionDate = data.generated ? new Date(data.generated) : null;
  const weekdayLabel = editionDate
    ? editionDate.toLocaleDateString('de-AT', { weekday: 'long' })
    : 'Heute';
  const fullDateLabel = editionDate
    ? editionDate.toLocaleDateString('de-AT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const calendarWeek = editionDate ? getCalendarWeek(editionDate) : null;
  const weatherSummary = weather
    ? `${weather.location || 'Voitsberg'} · ${translateWeather(weather.description)}`
    : weatherUnavailable
      ? 'Wetterdienst nicht erreichbar'
      : 'Wetter nicht verfügbar';

  // Normalize history: single object or array
  const historyRaw = data.widgets?.history;
  const historyFacts: HistoryFact[] = Array.isArray(historyRaw)
    ? historyRaw
    : historyRaw ? [historyRaw] : [];

  // Detect stale fallback entries (pipeline reuses the same famous events when API fails)
  const FALLBACK_WIKIS = new Set(['RMS_Titanic', 'Hillsborough-Katastrophe']);
  const historyAllFallback = historyFacts.length > 0
    && historyFacts.every(f => f.wiki && FALLBACK_WIKIS.has(f.wiki));

  // Top Story
  const topStory = pickTopStory(data);

  // Filter headlines to exclude the top story (no duplicates)
  const filteredHeadlines = headlines.filter(h => {
    if (!topStory) return true;
    return h.text !== topStory.title && h.url !== topStory.link;
  });

  const openHeadlineModal = (h: WorldHeadline) => {
    // Mark headline as read
    markAsRead?.(h.url || '', h.text);
    // Try to find the full article for richer data
    const art = findArticleForHeadline(h, data);
    setModalData({
      title: h.text,
      text: h.summary || getArticleTeaser(art) || undefined,
      source: h.source || art?.source,
      url: h.url || art?.link,
      image: art?.image,
    });
  };

  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [pollenModalOpen, setPollenModalOpen] = useState(false);

  // Escape key handler for weather/pollen modals
  const closeWeatherPollen = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (pollenModalOpen) setPollenModalOpen(false);
      else if (weatherModalOpen) setWeatherModalOpen(false);
    }
  }, [pollenModalOpen, setPollenModalOpen, setWeatherModalOpen, weatherModalOpen]);

  useEffect(() => {
    if (weatherModalOpen || pollenModalOpen) {
      document.addEventListener('keydown', closeWeatherPollen);
      return () => document.removeEventListener('keydown', closeWeatherPollen);
    }
  }, [weatherModalOpen, pollenModalOpen, closeWeatherPollen]);

  const openHistoryModal = (fact: HistoryFact) => {
    const fallbackText = fact.description
      || `${fact.text}. Dieses historische Ereignis jährt sich heute im Jahr ${fact.year}.`;
    setModalData({
      title: `${fact.year}: ${fact.text}`,
      text: fallbackText,
      url: fact.url,
      image: fact.image,
      source: fact.url ? 'Wikipedia' : undefined,
    });
  };

  return (
    <section className="hero-briefing" id="top-stories">
      {/* LEFT COLUMN: Top Story + Headlines */}
      <div className="hero-briefing-content">
        {/* Top Story */}
        {topStory && (
          <div
            className="top-story-block top-story-clickable"
            onClick={() => onArticleClick?.(topStory)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick?.(topStory); }}
          >
            <div className="hero-briefing-label">Top Story</div>
            {isRead && !isRead(topStory.link, topStory.title) && <span className="unread-dot unread-dot-top-story" />}
            <TopStoryVisual article={topStory} />
            <h1 className="hero-briefing-headline">{topStory.title}</h1>
            {getArticleTeaser(topStory) && (
              <p className="hero-briefing-text">{getArticleTeaser(topStory)}</p>
            )}
            {topStory.author && (
              <p className="hero-briefing-text">Von {topStory.author}</p>
            )}
            {!getArticleTeaser(topStory) && topStory.description && topStory.description !== 'Comments' && (
              <p className="hero-briefing-text">{topStory.description}</p>
            )}
            <div className="top-story-meta">
              {topStory.source && <span className="top-story-source">{topStory.source}</span>}
              {topStory.reading_time_minutes && (
                <span className="top-story-reading-time">{topStory.reading_time_minutes} Min. Lesezeit</span>
              )}
              <span className="top-story-original-link">Details ansehen →</span>
            </div>
          </div>
        )}

        {/* Schlagzeilen — 3 in 30 Sekunden — always clickable */}
        {filteredHeadlines.length > 0 && (
          <div className="headlines-30s">
            <div className="headlines-30s-header">
              <span className="headlines-30s-icon">📰</span>
              <span className="headlines-30s-title">Schlagzeilen — 3 in 30 Sekunden</span>
            </div>
            <ul className="headlines-30s-list">
              {filteredHeadlines.slice(0, 3).map((h, i) => (
                (() => {
                  const unread = !!(isRead && !isRead(h.url || '', h.text));
                  return (
                <li
                  key={i}
                  className={`headlines-30s-item headlines-30s-clickable${unread ? ' headlines-30s-item-unread' : ''}`}
                  onClick={() => openHeadlineModal(h)}
                  role="button"
                  tabIndex={0}
                >
                  {unread && <span className="unread-dot-inline" />}
                  <span className="headlines-30s-text">{h.text}</span>
                  {h.source && (
                    <span className="headlines-30s-source"> — {h.source}</span>
                  )}
                  {h.summary && (
                    <p className="headlines-30s-summary">{h.summary}</p>
                  )}
                </li>
                  );
                })()
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Status Cards */}
      <div className="hero-briefing-status">
        {/* 1. Wetter — quer */}
        <div
          className="status-card status-card-weather status-card-weather-horizontal status-card-clickable"
          onClick={() => setWeatherModalOpen(true)}
          role="button"
          tabIndex={0}
        >
          <div className="status-card-header-inline">
            <span className="status-card-icon">🌤️</span>
            <span className="status-card-label">Wetter</span>
          </div>
          <div className="weather-horizontal-layout">
            <div className="weather-horizontal-main">
              <div className="weather-location-line">{weatherSummary}</div>
              {weather ? (
                <div className="weather-horizontal-hero">
                  <div className="weather-temp-display">{weather.temp}°C</div>
                  <div className="weather-condition-icon" aria-hidden="true">{getWeatherEmoji(weather.icon)}</div>
                </div>
              ) : (
                <div className="status-card-detail">Wetter nicht verfügbar</div>
              )}
              {weather && (
                <div className="weather-temp-subline">
                  Gefühlt {weather.feelsLike}°
                </div>
              )}
            </div>
            <div className="weather-horizontal-metrics">
              {weather && (
                <>
                  <div className="weather-metric-card">
                    <span className="weather-detail-label">Gefühlt</span>
                    <span className="weather-detail-value">{weather.feelsLike}°</span>
                  </div>
                  <div className="weather-metric-card">
                    <span className="weather-detail-label">Min/Max</span>
                    <span className="weather-detail-value">{weather.min}° / {weather.max}°</span>
                  </div>
                </>
              )}
              {pollen && (
                <div
                  className="weather-metric-card weather-metric-card-pollen status-card-clickable"
                  onClick={(e) => { e.stopPropagation(); setWeatherModalOpen(false); setPollenModalOpen(true); }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="weather-detail-label">Pollen</span>
                  <span className={`pollen-level pollen-level-${pollen.level.toLowerCase()}`}>
                    {pollen.level}
                  </span>
                  <span className="weather-metric-subtext">
                    {pollen.types.length > 0 ? pollen.types.join(', ') : pollen.description}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Tagesinfo — quer */}
        <div className="status-card status-card-dayinfo status-card-dayinfo-horizontal">
          <div className="status-card-header-inline">
            <span className="status-card-icon">☀️</span>
            <span className="status-card-label">Tagesinfo</span>
          </div>
          <div className="dayinfo-horizontal-layout">
            <div className="dayinfo-horizontal-main">
              <div className="dayinfo-horizontal-main-copy">
                <div className="dayinfo-topline">{weekdayLabel}</div>
                <div className="dayinfo-date-line">{fullDateLabel}</div>
              </div>
              <div className="dayinfo-nameplate">
                <span className="dayinfo-nameplate-label">Namenstag</span>
                <span className="dayinfo-nameplate-value">{dayInfo?.namenstag || 'Kein Eintrag'}</span>
              </div>
            </div>
            <div className="dayinfo-horizontal-metrics">
              <div className="dayinfo-metric-card">
                <span className="dayinfo-sun-label">Aufgang</span>
                <span className="dayinfo-sun-value">{dayInfo ? to24h(dayInfo.sunrise) : '--:--'}</span>
              </div>
              <div className="dayinfo-metric-card">
                <span className="dayinfo-sun-label">Untergang</span>
                <span className="dayinfo-sun-value">{dayInfo ? to24h(dayInfo.sunset) : '--:--'}</span>
              </div>
              <div className="dayinfo-metric-card">
                <span className="dayinfo-sun-label">Tageslänge</span>
                <span className="dayinfo-sun-value">{dayInfo?.dayLength || '--'}</span>
              </div>
              <div className="dayinfo-metric-card dayinfo-metric-card-kalenderwoche">
                <span className="dayinfo-sun-label">KW</span>
                <span className="dayinfo-sun-value">{calendarWeek}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dieser Tag in der Geschichte — fixed size, always 3 items */}
        {historyFacts.length > 0 && (
          <div className="status-card status-card-history">
            <div className="status-card-header-inline">
              <span className="status-card-icon">📜</span>
              <span className="status-card-label">Dieser Tag</span>
            </div>
            {historyAllFallback ? (
              <div className="status-card-detail" style={{ opacity: 0.6, fontStyle: 'italic', padding: '0.5rem 0' }}>
                Keine tagesaktuellen Einträge
              </div>
            ) : (
            <div className="status-card-history-list">
              {historyFacts.slice(0, 3).map((fact, i) => (
                <div
                  key={i}
                  className="status-card-history-item status-card-history-clickable"
                  onClick={() => openHistoryModal(fact)}
                  role="button"
                  tabIndex={0}
                >
                  {fact.image ? (
                    <img
                      src={fact.image}
                      alt={fact.text}
                      className="status-card-history-thumb"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="history-year-badge">{fact.year}</div>
                  )}
                  <span className="status-card-history-text">{fact.text}</span>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* 4. Termine — fills remaining space */}
        <div
          className={`status-card status-card-calendar${!calendarRevealed ? ' status-card-blurred' : ''}`}
        >
          <div className="status-card-header-inline">
            <span className="status-card-icon">📅</span>
            <span className="status-card-label">Termine</span>
          </div>
          {calendarCount > 0 ? (
            <>
              <div className="status-card-value-small calendar-blur-target">
                {calendarCount} heute
              </div>
              <div className="status-card-list calendar-blur-target">
                {calendar.map((ev, i) => (
                  <div key={i} className="status-card-list-item">
                    <span className="status-card-list-time">{ev.time}</span>
                    <span>{eventDisplayLabel(ev)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="status-card-value-small">Keine Termine heute</div>
          )}
        </div>
      </div>

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

      {pollenModalOpen && pollen && (() => {
        // Build bar chart data from pollen_detail or fallback from types + level
        const levelToValue: Record<string, number> = { keine: 0, niedrig: 1, gering: 1, mittel: 2, maessig: 2, mäßig: 2, hoch: 3, stark: 4, sehr_hoch: 5 };
        const defaultValue = levelToValue[pollen.level.toLowerCase()] || 1;
        const pollenBars = pollen.detail
          ? pollen.detail.map((d: { name: string; level: number }) => ({ name: d.name, value: d.level }))
          : pollen.types.map(t => ({ name: t, value: defaultValue }));
        const barColor = (v: number) => v <= 1 ? '#51cf66' : v <= 2 ? '#fcc419' : v <= 3 ? '#ff922b' : '#ff6b6b';
        const barLabel = (v: number) => v === 0 ? 'keine' : v === 1 ? 'niedrig' : v === 2 ? 'mittel' : v === 3 ? 'hoch' : v === 4 ? 'stark' : 'sehr hoch';

        return (
        <div className="modal-overlay" onClick={() => setPollenModalOpen(false)}>
          <div className="modal-content pollen-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPollenModalOpen(false)} aria-label="Schließen">×</button>
            <div className="pollen-modal-header">
              <span className="pollen-modal-icon">🌿</span>
              <span className="pollen-modal-title">Pollenflug</span>
            </div>
            <div className={`pollen-modal-level pollen-modal-level-${pollen.level.toLowerCase()}`}>
              {pollen.level.toUpperCase()}
            </div>
            <div className="pollen-modal-chart">
              {pollenBars.map((bar: { name: string; value: number }, i: number) => (
                <div key={i} className="pollen-bar-row">
                  <span className="pollen-bar-label">{bar.name}</span>
                  <div className="pollen-bar-track">
                    <div
                      className="pollen-bar-fill"
                      style={{ width: `${(bar.value / 5) * 100}%`, background: barColor(bar.value) }}
                    />
                  </div>
                  <span className="pollen-bar-value">{barLabel(bar.value)}</span>
                </div>
              ))}
            </div>
            {pollen.description && (
              <div className="pollen-modal-desc">{pollen.description}</div>
            )}
            <div className="pollen-modal-hint">
              💡 Bei Pollenallergie: Lüften nach Regen, Haare waschen vor dem Schlafen, Pollenfilter im Auto prüfen.
            </div>
          </div>
        </div>
        );
      })()}
    </section>
  );
}
