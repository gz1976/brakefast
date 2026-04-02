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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {image && !imgFailed && (
          <img
            className={`modal-image${/\.svg[./]|logo|icon|flag/i.test(image) ? ' modal-image-logo' : ''}`}
            src={image}
            alt={title}
            onError={() => setImgFailed(true)}
          />
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
