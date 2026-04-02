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
  const mediaTip = data.morning_tiles?.media_tip;
  const wordOfDay = data.widgets?.word_of_day;
  const quote = data.widgets?.quote;
  const events = data.morning_tiles?.events || [];
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Only render if we have at least one real tile
  const hasTiles = wordOfDay || mediaTip || quote || events.length > 0;
  if (!hasTiles) return null;

  return (
    <section className="morning-tiles">
      {/* 1. Wort des Tages */}
      {wordOfDay && (
        <div className="morning-tile morning-tile-word">
          <div className="morning-tile-header">
            <span className="morning-tile-icon">🔤</span>
            <span className="morning-tile-label">Wort des Tages</span>
          </div>
          <div className="morning-tile-body">
            <div className="word-of-day-content">
              <div className="word-of-day-term">{wordOfDay.word}</div>
              <div className="word-of-day-explanation">{wordOfDay.explanation || wordOfDay.meaning || ''}</div>
              {(wordOfDay.origin || wordOfDay.example) && (
                <div className="word-of-day-origin">{wordOfDay.origin || wordOfDay.example}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Hör-/Lesetipp */}
      {mediaTip && (
        <div className="morning-tile morning-tile-media">
          <div className="morning-tile-header">
            <span className="morning-tile-icon">🎧</span>
            <span className="morning-tile-label">Hör-/Lesetipp</span>
          </div>
          <div className="morning-tile-body">
            <span
              className={`morning-tile-link morning-tile-link-enhanced morning-tile-media-content${mediaTip.url ? ' morning-tile-clickable' : ''}`}
              onClick={() => mediaTip.url
                ? window.open(mediaTip.url, '_blank', 'noopener,noreferrer')
                : undefined
              }
              role={mediaTip.url ? 'button' : undefined}
              tabIndex={mediaTip.url ? 0 : undefined}
            >
              <div className="morning-tile-media-type">{mediaTip.type}</div>
              <div className="morning-tile-media-title">{mediaTip.title}</div>
              <div className="morning-tile-media-meta">
                {mediaTip.source}
                {mediaTip.duration && ` · ${mediaTip.duration}`}
              </div>
              {mediaTip.url && <span className="morning-tile-arrow">→</span>}
            </span>
          </div>
        </div>
      )}

      {/* 3. Zitat des Tages */}
      {quote && quote.text && (
        <div className="morning-tile morning-tile-quote">
          <div className="morning-tile-header">
            <span className="morning-tile-icon">💬</span>
            <span className="morning-tile-label">Zitat des Tages</span>
          </div>
          <div className="morning-tile-body">
            <blockquote className="morning-tile-quote-text">„{quote.text}"</blockquote>
            {quote.author && <div className="morning-tile-quote-author">— {quote.author}</div>}
          </div>
        </div>
      )}

      {/* 4. Events Bezirk Voitsberg */}
      {events.length > 0 && (
        <div className="morning-tile morning-tile-events">
          <div className="morning-tile-header">
            <span className="morning-tile-icon">🎉</span>
            <span className="morning-tile-label">Events</span>
          </div>
          <div className="morning-tile-body">
            <ul className="morning-tile-events-list">
              {events.slice(0, 4).map((ev, i) => (
                <li key={i} className="morning-tile-event-item">
                  <span className="morning-tile-event-title">{ev.title}</span>
                  <span className="morning-tile-event-meta">{ev.date} · {ev.location}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
