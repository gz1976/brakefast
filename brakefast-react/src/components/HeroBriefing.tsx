import { useState } from 'react';
import type { NewspaperData, HistoryFact } from '../types';

interface Props {
  data: NewspaperData;
}

export function HeroBriefing({ data }: Props) {
  const [calendarRevealed, setCalendarRevealed] = useState(false);

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

        {/* Schlagzeilen — 3 in 30 Sekunden */}
        {headlines.length > 0 && (
          <div className="headlines-30s">
            <div className="headlines-30s-header">
              <span className="headlines-30s-icon">📰</span>
              <span className="headlines-30s-title">Schlagzeilen — 3 in 30 Sekunden</span>
            </div>
            <ul className="headlines-30s-list">
              {headlines.slice(0, 3).map((h, i) => (
                <li key={i} className="headlines-30s-item">
                  <span className="headlines-30s-text">{h.text}</span>
                  {h.source && (
                    <span className="headlines-30s-source"> — {h.source}</span>
                  )}
                </li>
              ))}
            </ul>
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

        {/* 3. Termine — grün (toggle pill for privacy) */}
        <div
          className={`status-card status-card-calendar${calendarRevealed ? '' : ' status-card-blurred'}`}
        >
          <div className="status-card-icon">📅</div>
          <div className="status-card-label">
            Termine
            <button
              className="calendar-toggle-pill"
              onClick={() => setCalendarRevealed(prev => !prev)}
              aria-label={calendarRevealed ? 'Termine verbergen' : 'Termine anzeigen'}
            >
              {calendarRevealed ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
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

        {/* 4. Dieser Tag in der Geschichte — lila */}
        <div className="status-card status-card-history">
          <div className="status-card-icon">📜</div>
          <div className="status-card-label">Dieser Tag</div>
          {historyFacts.length > 0 ? (
            <div className="status-card-history-list">
              {historyFacts.slice(0, 3).map((fact, i) => (
                <div key={i} className="status-card-history-item">
                  <span className="status-card-history-year">{fact.year}</span>
                  <span className="status-card-history-text">{fact.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="status-card-detail">Kein historisches Ereignis für heute</div>
          )}
        </div>
      </div>
    </section>
  );
}
