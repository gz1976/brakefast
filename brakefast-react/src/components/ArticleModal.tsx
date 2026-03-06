import { useEffect, useState } from 'react';
import type { Article } from '../types';
import { isValidArticleImage } from '../utils/imageUtils';

interface Props {
  article: Article;
  onClose: () => void;
}

function getReadingTime(article: Article): number {
  if (article.reading_time_minutes) return article.reading_time_minutes;
  const words = (article.summary || article.description || '').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function ArticleModal({ article, onClose }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = isValidArticleImage(article.image) && !imgFailed;

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

        {showImage && (
          <img
            className="modal-image"
            src={article.image}
            alt=""
            onError={() => setImgFailed(true)}
          />
        )}

        <div className="modal-body">
          <div className="modal-meta-top">
            <span className="modal-source">{article.source}</span>
            <span className="modal-date">{article.date}</span>
            <span className="modal-reading">{getReadingTime(article)} Min. Lesezeit</span>
          </div>

          <h2 className="modal-title">{article.title}</h2>

          <div className="modal-text">
            {article.summary || article.description || 'Keine Zusammenfassung verfügbar.'}
          </div>
        </div>
      </div>
    </div>
  );
}
