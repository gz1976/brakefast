import type { NewspaperData } from '../types';

interface Props {
  data: NewspaperData;
}

export function MorningTiles({ data }: Props) {
  const knapp = data.morning_tiles?.knapp;
  const streaming = data.morning_tiles?.streaming || [];
  const events = data.morning_tiles?.events || [];
  const mediaTip = data.morning_tiles?.media_tip;

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
                {s.url ? (
                  <a className="morning-tile-link" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.text}
                    {s.source && <span className="morning-tile-source"> — {s.source}</span>}
                  </a>
                ) : (
                  <>
                    {s.text}
                    {s.source && <span className="morning-tile-source"> — {s.source}</span>}
                  </>
                )}
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

      {/* 2. Streaming-Tipps */}
      <div className="morning-tile morning-tile-streaming">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎬</span>
          <span className="morning-tile-label">Streaming-Tipps</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {streaming.slice(0, 3).map((s, i) => (
              <li key={i} className="morning-tile-signal">
                {s.url ? (
                  <a className="morning-tile-link" href={s.url} target="_blank" rel="noopener noreferrer">
                    <span className="morning-tile-streaming-title">{s.title}</span>
                    <span className="morning-tile-streaming-meta"> — {s.platform} · {s.type}</span>
                  </a>
                ) : (
                  <>
                    <span className="morning-tile-streaming-title">{s.title}</span>
                    <span className="morning-tile-streaming-meta"> — {s.platform} · {s.type}</span>
                  </>
                )}
              </li>
            ))}
            {streaming.length === 0 && (
              <li className="morning-tile-signal morning-tile-empty">
                Keine Streaming-Tipps heute
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 3. Hör-/Lesetipp */}
      <div className="morning-tile morning-tile-media">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎧</span>
          <span className="morning-tile-label">Hör-/Lesetipp</span>
        </div>
        <div className="morning-tile-body">
          {mediaTip ? (
            mediaTip.url ? (
              <a className="morning-tile-link morning-tile-media-content" href={mediaTip.url} target="_blank" rel="noopener noreferrer">
                <div className="morning-tile-media-type">{mediaTip.type}</div>
                <div className="morning-tile-media-title">{mediaTip.title}</div>
                <div className="morning-tile-media-meta">
                  {mediaTip.source}
                  {mediaTip.duration && ` · ${mediaTip.duration}`}
                </div>
              </a>
            ) : (
              <div className="morning-tile-media-content">
                <div className="morning-tile-media-type">{mediaTip.type}</div>
                <div className="morning-tile-media-title">{mediaTip.title}</div>
                <div className="morning-tile-media-meta">
                  {mediaTip.source}
                  {mediaTip.duration && ` · ${mediaTip.duration}`}
                </div>
              </div>
            )
          ) : (
            <p className="morning-tile-empty">Kein Tipp heute</p>
          )}
        </div>
      </div>

      {/* 4. Events / Was ist los? */}
      <div className="morning-tile morning-tile-events">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎉</span>
          <span className="morning-tile-label">Events</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {events.slice(0, 3).map((ev, i) => (
              <li key={i} className="morning-tile-signal morning-tile-event-item">
                {ev.url ? (
                  <a className="morning-tile-link" href={ev.url} target="_blank" rel="noopener noreferrer">
                    <span className="morning-tile-event-title">{ev.title}</span>
                    <span className="morning-tile-event-meta">
                      {ev.date} · {ev.location}
                    </span>
                  </a>
                ) : (
                  <>
                    <span className="morning-tile-event-title">{ev.title}</span>
                    <span className="morning-tile-event-meta">
                      {ev.date} · {ev.location}
                    </span>
                  </>
                )}
              </li>
            ))}
            {events.length === 0 && (
              <li className="morning-tile-signal morning-tile-empty">
                Keine Events diese Woche
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
