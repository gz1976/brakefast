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
  // Support both single media_tip and array media_tips
  const mediaTips = data.morning_tiles?.media_tips
    || (data.morning_tiles?.media_tip ? [data.morning_tiles.media_tip] : []);
  const wordOfDay = data.widgets?.word_of_day;
  const quote = data.widgets?.quote;
  const events = data.morning_tiles?.events || [];
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Filter events: only show those with a url (verified source)
  const verifiedEvents = events.filter(ev => ev.url);

  // Only render if we have at least one real tile
  const hasTiles = wordOfDay || mediaTips.length > 0 || quote || events.length > 0;
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

      {/* 2. Hör-/Lesetipps — supports 1-3 items */}
      {mediaTips.length > 0 && (
        <div className="morning-tile morning-tile-media">
          <div className="morning-tile-header">
            <span className="morning-tile-icon">🎙️</span>
            <span className="morning-tile-label">Podcasts</span>
          </div>
          <div className="morning-tile-body">
            <div className="morning-tile-media-list">
              {mediaTips.slice(0, 3).map((tip, i) => (
                <span
                  key={i}
                  className={`morning-tile-link morning-tile-link-enhanced morning-tile-media-content${tip.url ? ' morning-tile-clickable' : ''}`}
                  onClick={() => tip.url
                    ? window.open(tip.url, '_blank', 'noopener,noreferrer')
                    : undefined
                  }
                  role={tip.url ? 'button' : undefined}
                  tabIndex={tip.url ? 0 : undefined}
                >
                  {tip.type && tip.type.toLowerCase() !== 'podcast' && (
                    <div className="morning-tile-media-type">{tip.type}</div>
                  )}
                  <div className="morning-tile-media-title">{tip.title}</div>
                  <div className="morning-tile-media-meta">
                    {tip.source}
                    {tip.duration && ` · ${tip.duration}`}
                  </div>
                  {tip.url && <span className="morning-tile-arrow">→</span>}
                </span>
              ))}
            </div>
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
            <blockquote className="morning-tile-quote-text">&bdquo;{quote.text}&ldquo;</blockquote>
            {quote.author && <div className="morning-tile-quote-author">— {quote.author}</div>}
          </div>
        </div>
      )}

      {/* 4. Events Bezirk Voitsberg */}
      <div className="morning-tile morning-tile-events">
        <div className="morning-tile-header">
          <span className="morning-tile-icon">🎉</span>
          <span className="morning-tile-label">Events</span>
        </div>
        <div className="morning-tile-body">
          {verifiedEvents.length > 0 ? (
            <ul className="morning-tile-events-list">
              {verifiedEvents.slice(0, 4).map((ev, i) => (
                <li key={i} className="morning-tile-event-item">
                  <a
                    className="morning-tile-event-title morning-tile-event-link"
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ev.title}
                  </a>
                  <span className="morning-tile-event-meta">{ev.date} · {ev.location}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="morning-tile-empty">Keine Events im Bezirk Voitsberg verfügbar</div>
          )}
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
