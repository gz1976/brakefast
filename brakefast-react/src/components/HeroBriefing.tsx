import { useState } from 'react';
import type { NewspaperData, HistoryFact, Article, WorldHeadline } from '../types';
import { BriefingModal } from './BriefingModal';
import { DetailModal } from './DetailModal';
import { formatHeadline, getArticleTeaser, to24h, translateWeather } from '../utils/textUtils';
import { getCategoryGradient, getCategoryIcon, isValidArticleImage } from '../utils/imageUtils';

interface Props {
  data: NewspaperData;
  calendarRevealed: boolean;
  onToggleCalendar?: () => void;
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

/** Pick the best article as Top Story (highest relevance or first with image) */
function pickTopStory(data: NewspaperData): Article | null {
  const allArticles: Article[] = [];
  for (const cat of Object.values(data.categories)) {
    if (cat.articles) allArticles.push(...cat.articles);
  }
  if (allArticles.length === 0) return null;

  const scoreArticle = (article: Article) => {
    const hasGoodImage = isValidArticleImage(article.image) && (article.image_quality_score ?? 0.55) >= 0.5;
    const summaryScore = article.summary_quality_score ?? (article.summary ? 0.7 : article.dek ? 0.55 : 0.2);
    const relevanceScore = article.relevance_score ?? 0;
    const contentBonus = article.content_quality === 'high' ? 0.18 : article.content_quality === 'medium' ? 0.08 : 0;
    const imageBonus = hasGoodImage ? 0.16 : 0;
    return relevanceScore + summaryScore + contentBonus + imageBonus;
  };

  return [...allArticles].sort((a, b) => scoreArticle(b) - scoreArticle(a))[0] || null;
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

export function HeroBriefing({ data, calendarRevealed, onToggleCalendar, onArticleClick, isRead, markAsRead }: Props) {
  const [showBriefing, setShowBriefing] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const weather = data.widgets?.weather;
  const dayInfo = data.widgets?.dayInfo;
  const calendar = data.widgets?.calendar || [];
  const calendarCount = calendar.length;
  const headlines = data.morning_tiles?.headlines || [];

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
    setModalData({
      title: `${fact.year}: ${fact.text}`,
      text: fact.description,
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
        {topStory ? (
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
        ) : (
          <div
            className="hero-briefing-upper hero-briefing-clickable"
            onClick={() => setShowBriefing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowBriefing(true); }}
          >
            <div className="hero-briefing-label">Ottos Briefing</div>
            <h1 className="hero-briefing-headline">
              {data.headline ? formatHeadline(data.headline) : 'Guten Morgen — dein persönlicher Überblick für heute.'}
            </h1>
            {data.editorial && (
              <p className="hero-briefing-text">{data.editorial}</p>
            )}
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
                <li
                  key={i}
                  className="headlines-30s-item headlines-30s-clickable"
                  onClick={() => openHeadlineModal(h)}
                  role="button"
                  tabIndex={0}
                >
                  {isRead && !isRead(h.url || '', h.text) && <span className="unread-dot-inline" />}
                  <span className="headlines-30s-text">{h.text}</span>
                  {h.source && (
                    <span className="headlines-30s-source"> — {h.source}</span>
                  )}
                  {h.summary && (
                    <p className="headlines-30s-summary">{h.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Status Cards */}
      <div className="hero-briefing-status">
        {/* 1. Wetter — kompakt */}
        <div className="status-card status-card-weather status-card-compact">
          <div className="status-card-header-inline">
            <span className="status-card-icon">🌤️</span>
            <span className="status-card-label">Wetter</span>
            {weather && (
              <span className="status-card-value-inline">
                {weather.temp}°C
              </span>
            )}
          </div>
          <div className="status-card-detail">
            {weather ? `${weather.location} · ${translateWeather(weather.description)}` : 'Wetter nicht verfügbar'}
          </div>
          {weather && (
            <div className="status-card-weather-details">
              <span>Gefühlt {weather.feelsLike}°</span>
              <span>↓ {weather.min}° / ↑ {weather.max}°</span>
              {weather.humidity != null && <span>💧 {weather.humidity}%</span>}
              {weather.wind && <span>💨 {weather.wind}</span>}
              {weather.forecast && <span className="weather-forecast-line">{weather.forecast}</span>}
            </div>
          )}
          {data.widgets?.pollen && (
            <div className="weather-pollen-sub">
              <span className="pollen-label">🌾 Pollen:</span>
              <span className={`pollen-level pollen-level-${data.widgets.pollen.level.toLowerCase()}`}>
                {data.widgets.pollen.level}
              </span>
              {data.widgets.pollen.types.length > 0 && (
                <span className="pollen-types">{data.widgets.pollen.types.join(', ')}</span>
              )}
            </div>
          )}
        </div>

        {/* 2. Tagesinfo — kompakt */}
        <div className="status-card status-card-dayinfo status-card-compact">
          <div className="status-card-header-inline">
            <span className="status-card-icon">☀️</span>
            <span className="status-card-label">Tagesinfo</span>
          </div>
          <div className="status-card-dayinfo-grid">
            {dayInfo ? (
              <>
                <div className="dayinfo-row">
                  <span className="dayinfo-icon">☀</span>
                  <span>{to24h(dayInfo.sunrise)}</span>
                  <span className="dayinfo-icon">🌙</span>
                  <span>{to24h(dayInfo.sunset)}</span>
                  {dayInfo.dayLength && <span className="dayinfo-length">{dayInfo.dayLength}</span>}
                </div>
                {dayInfo.namenstag && (
                  <div className="dayinfo-row">
                    <span className="dayinfo-icon">🎂</span>
                    <span>{dayInfo.namenstag}</span>
                  </div>
                )}
              </>
            ) : (
              <span className="status-card-detail">Keine Daten</span>
            )}
          </div>
        </div>

        {/* 3. Termine — grün */}
        <div
          className={`status-card status-card-calendar${calendarRevealed ? '' : ' status-card-blurred'}`}
        >
          <div className="status-card-header-inline">
            <span className="status-card-icon">📅</span>
            <span className="status-card-label">Termine</span>
            {onToggleCalendar && calendar.length > 0 && (
              <button className="calendar-toggle-pill" onClick={onToggleCalendar}>
                {calendarRevealed ? 'Verbergen' : 'Anzeigen'}
              </button>
            )}
          </div>
          <div className="status-card-value-small">
            {calendarCount > 0 ? `${calendarCount} heute` : 'Freier Tag'}
          </div>
          {calendar.length > 0 ? (
            <div className="status-card-list calendar-blur-target">
              {calendar.map((ev, i) => (
                <div key={i} className="status-card-list-item">
                  <span className="status-card-list-time">{ev.time}</span>
                  <span>{ev.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="status-card-detail">Keine Termine eingetragen</div>
          )}
        </div>

        {/* 4. Zitat des Tages */}
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

        {/* 5. Dieser Tag in der Geschichte — clickable with popup */}
        <div className="status-card status-card-history">
          <div className="status-card-header-inline">
            <span className="status-card-icon">📜</span>
            <span className="status-card-label">Dieser Tag</span>
          </div>
          {historyFacts.length > 0 ? (
            <div className="status-card-history-list">
              {historyFacts.slice(0, 3).map((fact, i) => (
                <div
                  key={i}
                  className="status-card-history-item status-card-history-clickable"
                  onClick={() => openHistoryModal(fact)}
                  role="button"
                  tabIndex={0}
                >
                  {fact.image && (
                    <img
                      src={fact.image}
                      alt={fact.text}
                      className="history-item-image"
                      loading="lazy"
                    />
                  )}
                  <div className="history-item-content">
                    <span className="status-card-history-year">{fact.year}</span>
                    <span className="status-card-history-text">{fact.text}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="status-card-detail">Kein historisches Ereignis für heute</div>
          )}
        </div>
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
