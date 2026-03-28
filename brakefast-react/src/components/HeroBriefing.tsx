import { useState } from 'react';
import type { NewspaperData, HistoryFact, Article, WorldHeadline } from '../types';
import { BriefingModal } from './BriefingModal';
import { DetailModal } from './DetailModal';
import { formatHeadline, getArticleTeaser, to24h, translateWeather } from '../utils/textUtils';
import { getCategoryGradient, getCategoryIcon, isValidArticleImage } from '../utils/imageUtils';
import { pickTopStory } from '../utils/scoring';

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
  const valid = isValidArticleImage(article.image) && !failed;

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
  const [showBriefing, setShowBriefing] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const weather = data.widgets?.weather;
  const dayInfo = data.widgets?.dayInfo;
  const pollen = data.widgets?.pollen;
  const calendar = data.widgets?.calendar || [];
  const calendarCount = calendar.length;
  const headlines = data.morning_tiles?.headlines || [];
  const editionDate = new Date(data.generated);
  const weekdayLabel = editionDate.toLocaleDateString('de-AT', { weekday: 'long' });
  const fullDateLabel = editionDate.toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const calendarWeek = getCalendarWeek(editionDate);
  const weatherSummary = weather
    ? `${weather.location || 'Voitsberg'} · ${translateWeather(weather.description)}`
    : 'Wetter nicht verfügbar';

  // Normalize history: single object or array
  const historyRaw = data.widgets?.history;
  const historyFacts: HistoryFact[] = Array.isArray(historyRaw)
    ? historyRaw
    : historyRaw ? [historyRaw] : [];

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

        {/* Ottos Briefing — always visible */}
        {data.editorial && (
          <div
            className={`editorial-banner${topStory ? '' : ' editorial-banner-hero'}`}
            onClick={() => setShowBriefing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowBriefing(true); }}
          >
            <div className="editorial-banner-header">
              <span className="editorial-banner-icon">🤖</span>
              <span className="editorial-banner-label">Ottos Briefing</span>
            </div>
            {!topStory && data.headline && (
              <h1 className="hero-briefing-headline">{formatHeadline(data.headline)}</h1>
            )}
            <p className={`editorial-banner-text${topStory ? '' : ' editorial-banner-text-full'}`}>{data.editorial}</p>
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
        <div className="status-card status-card-weather status-card-weather-horizontal">
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
                  <div className="weather-condition-icon" aria-hidden="true">{weather.icon || '☁️'}</div>
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
                <div className="weather-metric-card weather-metric-card-pollen">
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

        {/* 3. Termine — nur anzeigen wenn es Termine gibt */}
        {calendarCount > 0 && (
          <div
            className={`status-card status-card-calendar${!calendarRevealed ? ' status-card-blurred' : ''}`}
          >
            <div className="status-card-header-inline">
              <span className="status-card-icon">📅</span>
              <span className="status-card-label">Termine</span>
            </div>
            <div className="status-card-value-small calendar-blur-target">
              {calendarCount} heute
            </div>
            <div className="status-card-list calendar-blur-target">
              {calendar.map((ev, i) => (
                <div key={i} className="status-card-list-item">
                  <span className="status-card-list-time">{ev.time}</span>
                  <span>{ev.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Dieser Tag in der Geschichte — clickable with popup */}
        {historyFacts.length > 0 && (
          <div className="status-card status-card-history">
            <div className="status-card-header-inline">
              <span className="status-card-icon">📜</span>
              <span className="status-card-label">Dieser Tag</span>
            </div>
            <div className="status-card-history-list">
              {historyFacts.slice(0, 3).map((fact, i) => (
                <div
                  key={i}
                  className="status-card-history-item status-card-history-clickable"
                  onClick={() => openHistoryModal(fact)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="history-item-content">
                    <span className="status-card-history-year">{fact.year}</span>
                    <span className="status-card-history-text">{fact.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Zitat des Tages */}
        {data.widgets?.quote && (
          <div className="status-card status-card-quote">
            <div className="status-card-header-inline">
              <span className="status-card-icon">💡</span>
              <span className="status-card-label">Zitat des Tages</span>
            </div>
            <blockquote className="quote-text">
              &bdquo;{data.widgets.quote.text}&ldquo;
            </blockquote>
            <div className="quote-author">— {data.widgets.quote.author}</div>
          </div>
        )}
      </div>

      {showBriefing && (
        <BriefingModal
          headline={data.headline || 'Guten Morgen — dein persönlicher Überblick für heute.'}
          editorial={data.editorial}
          date={data.generated}
          onClose={() => setShowBriefing(false)}
        />
      )}

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
    </section>
  );
}
