import { useEffect } from 'react';

interface Props {
  headline: string;
  editorial?: string;
  date?: string;
  onClose: () => void;
}

export function BriefingModal({ headline, editorial, date, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Split pipe-separated headline into individual topics
  const topics = headline.includes('|')
    ? headline.split('|').map(t => t.trim()).filter(Boolean)
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content briefing-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-body">
          <div className="modal-meta-top">
            <span className="modal-source">Ottos Briefing</span>
            {date && <span className="modal-date">{date}</span>}
          </div>

          {topics ? (
            <div className="briefing-topics">
              <h2 className="modal-title">Themen heute</h2>
              <ul className="briefing-topics-list">
                {topics.map((topic, i) => (
                  <li key={i} className="briefing-topic-item">{topic}</li>
                ))}
              </ul>
            </div>
          ) : (
            <h2 className="modal-title">{headline}</h2>
          )}

          {editorial && (
            <div className="modal-text briefing-modal-text">
              {editorial}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
