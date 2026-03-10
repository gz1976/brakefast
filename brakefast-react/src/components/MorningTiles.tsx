import { useState } from 'react';
import type { NewspaperData } from '../types';
import { DetailModal } from './DetailModal';

interface Props {
  data: NewspaperData;
}

interface ModalData {
  title: string;
  text?: string;
  source?: string;
  url?: string;
}

export function MorningTiles({ data }: Props) {
  const streaming = data.morning_tiles?.streaming || [];
  const events = data.morning_tiles?.events || [];
  const mediaTip = data.morning_tiles?.media_tip;
  const wordOfDay = data.widgets?.word_of_day;
  const [modalData, setModalData] = useState<ModalData | null>(null);

  return (
    <section className="morning-tiles">
      {/* 1. Wort des Tages */}
      <div className="morning-tile morning-tile-word">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🔤</span>
          <span className="morning-tile-label">Wort des Tages</span>
        </div>
        <div className="morning-tile-body">
          <div className="word-of-day-content">
            <div className="word-of-day-term">{wordOfDay?.word || 'Serendipity'}</div>
            <div className="word-of-day-explanation">
              {wordOfDay?.explanation || 'Der glückliche Zufall — eine unerwartete, erfreuliche Entdeckung.'}
            </div>
            {wordOfDay?.origin && (
              <div className="word-of-day-origin">{wordOfDay.origin}</div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Streaming-Tipps — always clickable */}
      <div className="morning-tile morning-tile-streaming">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎬</span>
          <span className="morning-tile-label">Streaming-Tipps</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {streaming.slice(0, 3).map((s, i) => (
              <li key={i} className="morning-tile-signal">
                <span
                  className="morning-tile-link morning-tile-link-enhanced morning-tile-clickable"
                  onClick={() => s.url
                    ? window.open(s.url, '_blank', 'noopener,noreferrer')
                    : setModalData({ title: s.title, text: `${s.platform} · ${s.type}`, source: s.platform })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <span className="morning-tile-streaming-title">{s.title}</span>
                  <span className="morning-tile-streaming-meta"> — {s.platform} · {s.type}</span>
                  <span className="morning-tile-arrow">→</span>
                </span>
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

      {/* 3. Hör-/Lesetipp — always clickable */}
      <div className="morning-tile morning-tile-media">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎧</span>
          <span className="morning-tile-label">Hör-/Lesetipp</span>
        </div>
        <div className="morning-tile-body">
          {mediaTip ? (
            <span
              className="morning-tile-link morning-tile-link-enhanced morning-tile-media-content morning-tile-clickable"
              onClick={() => mediaTip.url
                ? window.open(mediaTip.url, '_blank', 'noopener,noreferrer')
                : setModalData({ title: mediaTip.title, text: `${mediaTip.type} · ${mediaTip.source}${mediaTip.duration ? ` · ${mediaTip.duration}` : ''}`, source: mediaTip.source })
              }
              role="button"
              tabIndex={0}
            >
              <div className="morning-tile-media-type">{mediaTip.type}</div>
              <div className="morning-tile-media-title">{mediaTip.title}</div>
              <div className="morning-tile-media-meta">
                {mediaTip.source}
                {mediaTip.duration && ` · ${mediaTip.duration}`}
              </div>
              <span className="morning-tile-arrow">→</span>
            </span>
          ) : (
            <p className="morning-tile-empty">Kein Tipp heute</p>
          )}
        </div>
      </div>

      {/* 4. Events / Was ist los? — always clickable */}
      <div className="morning-tile morning-tile-events">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎉</span>
          <span className="morning-tile-label">Events</span>
        </div>
        <div className="morning-tile-body">
          <ul className="morning-tile-signals">
            {events.slice(0, 3).map((ev, i) => (
              <li key={i} className="morning-tile-signal morning-tile-event-item">
                <span
                  className="morning-tile-link morning-tile-link-enhanced morning-tile-clickable"
                  onClick={() => ev.url
                    ? window.open(ev.url, '_blank', 'noopener,noreferrer')
                    : setModalData({ title: ev.title, text: `${ev.date} · ${ev.location} · ${ev.type}` })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <span className="morning-tile-event-title">{ev.title}</span>
                  <span className="morning-tile-event-meta">
                    {ev.date} · {ev.location}
                  </span>
                  <span className="morning-tile-arrow">→</span>
                </span>
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

      {modalData && (
        <DetailModal
          title={modalData.title}
          text={modalData.text}
          source={modalData.source}
          url={modalData.url}
          onClose={() => setModalData(null)}
        />
      )}
    </section>
  );
}
