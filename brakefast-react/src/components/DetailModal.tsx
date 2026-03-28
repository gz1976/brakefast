import { useEffect, useState } from 'react';
import { sanitizeHtml } from '../utils/textUtils';
import { getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';

interface Props {
  title: string;
  text?: string;
  html?: boolean;
  source?: string;
  url?: string;
  image?: string;
  categoryId?: string;
  onClose: () => void;
}

/** Generic detail modal for headlines, KNAPP signals, history facts, dev digest, ki modelle etc. */
export function DetailModal({ title, text, html, source, url, image, categoryId, onClose }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {image && !imgFailed ? (
          <img
            className="modal-image"
            src={image}
            alt={title}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="modal-image-placeholder"
            style={{ background: getCategoryGradient(categoryId || 'default') }}
          >
            <span style={{ fontSize: '48px' }}>{getCategoryIcon(categoryId || 'default')}</span>
          </div>
        )}

        <div className="modal-body">
          {source && (
            <div className="modal-meta-top">
              <span className="modal-source">{source}</span>
            </div>
          )}

          <h2 className="modal-title">{title}</h2>

          {text && (
            html
              ? <div className="modal-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />
              : <div className="modal-text">{text}</div>
          )}

          {!text && (
            <div className="modal-text modal-text-empty">Keine weiteren Details verfügbar.</div>
          )}

          {url && (
            <div className="modal-links">
              <a
                className="modal-source-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Weiterlesen →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
