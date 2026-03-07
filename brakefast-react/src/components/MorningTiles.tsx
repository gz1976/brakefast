import type { NewspaperData } from '../types';

interface Props {
  data: NewspaperData;
}

export function MorningTiles({ data }: Props) {
  const knapp = data.morning_tiles?.knapp;
  const localArticles = data.categories.local?.articles || [];
  const aiArticles = data.categories.ai?.articles || [];
  const weather = data.widgets?.weather;
  const dayInfo = data.widgets?.dayInfo;
  const history = data.widgets?.history;
  const calendar = data.widgets?.calendar || [];

  return (
    <section className="morning-tiles">
      {/* 1. KNAPP / Intralogistik */}
      <div className="morning-tile morning-tile-knapp">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🏭</span>
          <span className="morning-tile-label">KNAPP & Intralogistik</span>
        </div>
        <div className="morning-tile-body">
          {knapp?.headline && (
            <div className="morning-tile-headline">{knapp.headline}</div>
          )}
          <ul className="morning-tile-signals">
            {(knapp?.signals || []).slice(0, 3).map((s, i) => (
              <li key={i} className="morning-tile-signal">
                {s.text}
                {s.source && <span className="morning-tile-source"> — {s.source}</span>}
              </li>
            ))}
            {!knapp?.signals?.length && (
              <li className="morning-tile-signal morning-tile-empty">
                Keine aktuellen Branchenmeldungen
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 2. Steiermark / Region */}
      <div className="morning-tile morning-tile-region">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🏔️</span>
          <span className="morning-tile-label">Steiermark</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {localArticles.slice(0, 3).map((a, i) => (
              <li key={i} className="morning-tile-signal">{a.title}</li>
            ))}
            {localArticles.length === 0 && (
              <li className="morning-tile-signal morning-tile-empty">
                Keine regionalen Meldungen
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 3. Technik & KI kompakt */}
      <div className="morning-tile morning-tile-tech">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🤖</span>
          <span className="morning-tile-label">Tech & KI kompakt</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {aiArticles.slice(0, 3).map((a, i) => (
              <li key={i} className="morning-tile-signal">{a.title}</li>
            ))}
            {aiArticles.length === 0 && (
              <li className="morning-tile-signal morning-tile-empty">
                Keine Tech-Meldungen
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 4. Heute nützlich */}
      <div className="morning-tile morning-tile-useful">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">📋</span>
          <span className="morning-tile-label">Heute nützlich</span>
        </div>
        <div className="morning-tile-body morning-tile-useful-body">
          {weather && (
            <div className="morning-tile-useful-row">
              <span className="morning-tile-useful-key">🌤️</span>
              <span className="morning-tile-useful-val">
                {weather.min}°/{weather.max}° {weather.description}
              </span>
            </div>
          )}
          {weather?.forecast && (
            <div className="morning-tile-useful-row">
              <span className="morning-tile-useful-key">📅</span>
              <span className="morning-tile-useful-val">{weather.forecast}</span>
            </div>
          )}
          {dayInfo?.namenstag && (
            <div className="morning-tile-useful-row">
              <span className="morning-tile-useful-key">🎂</span>
              <span className="morning-tile-useful-val">Namenstag: {dayInfo.namenstag}</span>
            </div>
          )}
          <div className="morning-tile-useful-row">
            <span className="morning-tile-useful-key">📅</span>
            <span className="morning-tile-useful-val">
              {calendar.length > 0 ? `${calendar.length} Termine heute` : 'Freier Tag'}
            </span>
          </div>
          {history && (
            <div className="morning-tile-useful-row">
              <span className="morning-tile-useful-key">📜</span>
              <span className="morning-tile-useful-val">
                {history.year}: {history.text}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
