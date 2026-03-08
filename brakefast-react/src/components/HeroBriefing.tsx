import { useState } from 'react';
import type { NewspaperData, HistoryFact } from '../types';
import { BriefingModal } from './BriefingModal';
import { translateWeather, formatHeadline } from '../utils/textUtils';

interface Props {
  data: NewspaperData;
}

export function HeroBriefing({ data }: Props) {
  const [calendarRevealed, setCalendarRevealed] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

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
                  {h.url ? (
                    <a
                      className="headlines-30s-link"
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="headlines-30s-text">{h.text}</span>
                      {h.source && (
                        <span className="headlines-30s-source"> — {h.source}</span>
                      )}
                    </a>
                  ) : (
                    <>
                      <span className="headlines-30s-text">{h.text}</span>
                      {h.source && (
                        <span className="headlines-30s-source"> — {h.source}</span>
                      )}
                    </>
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

      <div className="hero-briefing-status">
        {/* 1. Wetter — kompakt */}
        <div className="status-card status-card-weather">
          <div className="status-card-header-inline">
            <span className="status-card-icon">🌤️</span>
            <span className="status-card-label">Wetter</span>
            <span className="status-card-value-inline">
              {weather ? `${weather.temp}°C` : '—'}
            </span>
          </div>
          <div className="status-card-detail">
            {weather ? `${weather.location} · ${translateWeather(weather.description)}` : 'Keine Daten'}
          </div>
          {weather && (
            <div className="status-card-detail">
              Gefühlt {weather.feelsLike}° · ↓ {weather.min}° / ↑ {weather.max}°
            </div>
          )}
        </div>

        {/* 2. Tagesinfo — kompakt */}
        <div className="status-card status-card-dayinfo">
          <div className="status-card-header-inline">
            <span className="status-card-icon">☀️</span>
            <span className="status-card-label">Tagesinfo</span>
          </div>
          <div className="status-card-detail">
            {dayInfo ? `☀ ${dayInfo.sunrise} — 🌙 ${dayInfo.sunset} · ${dayInfo.dayLength || '—'}` : 'Keine Daten'}
          </div>
          {dayInfo?.namenstag && (
            <div className="status-card-detail">🎂 {dayInfo.namenstag}</div>
          )}
        </div>

        {/* 3. Termine — grün (toggle pill for privacy) */}
        <div
          className={`status-card status-card-calendar${calendarRevealed ? '' : ' status-card-blurred'}`}
        >
          <div className="status-card-header-inline">
            <span className="status-card-icon">📅</span>
            <span className="status-card-label">
              Termine
              <button
                className="calendar-toggle-pill"
                onClick={() => setCalendarRevealed(prev => !prev)}
                aria-label={calendarRevealed ? 'Termine verbergen' : 'Termine anzeigen'}
              >
                {calendarRevealed ? 'Verbergen' : 'Anzeigen'}
              </button>
            </span>
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

        {/* 4. Dieser Tag in der Geschichte — lila */}
        <div className="status-card status-card-history">
          <div className="status-card-header-inline">
            <span className="status-card-icon">📜</span>
            <span className="status-card-label">Dieser Tag</span>
          </div>
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

      {showBriefing && (
        <BriefingModal
          headline={data.headline || 'Guten Morgen — dein persönlicher Überblick für heute.'}
          editorial={data.editorial}
          date={data.generated}
          onClose={() => setShowBriefing(false)}
        />
      )}
    </section>
  );
}
