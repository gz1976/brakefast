import { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { sanitizeHtml } from '../utils/textUtils';
interface Props {
  title: string;
  text?: string;
  html?: boolean;
  source?: string;
  url?: string;
  image?: string;
  onClose: () => void;
}

/** Generic detail modal for headlines, KNAPP signals, history facts, dev digest, ki modelle etc. */
export function DetailModal({ title, text, html, source, url, image, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useFocusTrap(containerRef, onClose);

  return (
    <div className="ed-modal-overlay modal-overlay" onClick={onClose}>
      <div
        className="ed-modal-panel ed-detail-modal-panel modal-content"
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ed-modal-header">
          <button
            className="ed-modal-close"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Schließen"
          >
            <span aria-hidden="true">✕</span>
            <span>Schließen</span>
          </button>
          {source && <div className="ed-modal-meta modal-source">{source}</div>}
        </div>

        <div className="ed-modal-rule" />

        {image && !imgFailed && (
          <img
            className={`ed-modal-image modal-image${/\.svg[./]|logo|icon|flag/i.test(image) ? ' modal-image-logo' : ''}`}
            src={image}
            alt={title}
            onError={() => setImgFailed(true)}
          />
        )}

        <div className="ed-modal-content modal-body">
          <div className="ed-modal-kicker">Detail</div>
          <h2 className="ed-modal-title modal-title">{title}</h2>
          <div className="ed-modal-divider" />

          {text && (
            html
              ? <div className="ed-modal-body modal-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />
              : <div className="ed-modal-body modal-text">{text}</div>
          )}

          {!text && (
            <div className="ed-modal-body modal-text modal-text-empty">Keine weiteren Details verfügbar.</div>
          )}

          {url?.trim() && (
            <div className="ed-modal-footer modal-links">
              <a
                className="ed-modal-link modal-source-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Original öffnen →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
