import { useState, useRef, useCallback, useMemo } from 'react';
import type { NewspaperData, Article } from '../types';

interface Props {
  data: NewspaperData;
}

export function HeroBriefing({ data }: Props) {
  const [calendarRevealed, setCalendarRevealed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = useCallback(() => {
    pressTimer.current = setTimeout(() => {
      setCalendarRevealed(prev => !prev);
    }, 5000);
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const weather = data.widgets?.weather;
  const dayInfo = data.widgets?.dayInfo;
  const calendar = data.widgets?.calendar || [];
  const calendarCount = calendar.length;
  const bauernregel = data.widgets?.bauernregel;

  // Find best reading recommendation: highest relevance_score across all categories
  const topArticle = useMemo<Article | null>(() => {
    const allArticles: Article[] = [];
    for (const cat of Object.values(data.categories)) {
      if (cat?.articles) allArticles.push(...cat.articles);
    }
    if (allArticles.length === 0) return null;
    return allArticles.reduce((best, a) =>
      (a.relevance_score ?? 0) > (best.relevance_score ?? 0) ? a : best
    , allArticles[0]);
  }, [data.categories]);

  return (
    <section className="hero-briefing" id="top-stories">
      <div className="hero-briefing-content">
        <div className="hero-briefing-upper">
          <div className="hero-briefing-label">Ottos Briefing</div>
          <h1 className="hero-briefing-headline">
            {data.headline || 'Guten Morgen — dein persönlicher Überblick für heute.'}
          </h1>
          {data.editorial && (
            <p className="hero-briefing-text">{data.editorial}</p>
          )}
        </div>

        {/* Leseempfehlung */}
        {topArticle && (
          <div className="reading-rec">
            <div className="reading-rec-header">
              <span className="reading-rec-icon">📖</span>
              <span className="reading-rec-title">Leseempfehlung</span>
            </div>
            <div className="reading-rec-text">
              „{topArticle.title}"
              {topArticle.source && (
                <span className="reading-rec-source"> — {topArticle.source}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="hero-briefing-status">
        {/* 1. Wetter — blau */}
        <div className="status-card status-card-weather">
          <div className="status-card-icon">🌤️</div>
          <div className="status-card-label">Wetter</div>
          <div className="status-card-value">
            {weather ? `${weather.temp}°C` : '—'}
          </div>
          <div className="status-card-detail">
            {weather ? `${weather.location} · ${weather.description}` : 'Keine Daten'}
          </div>
          {weather && (
            <div className="status-card-extra">
              <span>Gefühlt {weather.feelsLike}°</span>
              <span>↓ {weather.min}° / ↑ {weather.max}°</span>
            </div>
          )}
        </div>

        {/* 2. Tagesinfo — amber */}
        <div className="status-card status-card-dayinfo">
          <div className="status-card-icon">☀️</div>
          <div className="status-card-label">Tagesinfo</div>
          <div className="status-card-value">
            {dayInfo ? `☀ ${dayInfo.sunrise} — 🌙 ${dayInfo.sunset}` : '—'}
          </div>
          <div className="status-card-detail">
            {dayInfo ? `Tageslänge ${dayInfo.dayLength || '—'}` : 'Keine Daten'}
          </div>
          {dayInfo?.namenstag && (
            <div className="status-card-extra">
              <span>🎂 Namenstag: {dayInfo.namenstag}</span>
            </div>
          )}
        </div>

        {/* 3. Termine — grün (blur privacy, hidden tap on icon) */}
        <div
          className={`status-card status-card-calendar${calendarRevealed ? '' : ' status-card-blurred'}`}
        >
          <div
            className="status-card-icon status-card-icon-tap"
            onMouseDown={startPress}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
          >📅</div>
          <div className="status-card-label">Termine</div>
          <div className="status-card-value">
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

        {/* 4. Bauernregel — lila */}
        <div className="status-card status-card-bauernregel">
          <div className="status-card-icon">🌾</div>
          <div className="status-card-label">Bauernregel</div>
          {bauernregel ? (
            <>
              <div className="status-card-quote">„{bauernregel.text}"</div>
              {bauernregel.meaning && (
                <div className="status-card-detail">{bauernregel.meaning}</div>
              )}
            </>
          ) : (
            <>
              <div className="status-card-quote">„Gibt's im März zu früh schon Hitze, kommt im April noch eine Pfütze."</div>
              <div className="status-card-detail">Noch keine Bauernregel für heute</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
