import { useRef, useState } from 'react';
import type { Article } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { formatDate, getArticleBody, getReadingTime } from '../utils/textUtils';

interface Props {
  article: Article;
  categoryId?: string;
  onClose: () => void;
}

export function ArticleModal({ article, categoryId, onClose }: Props) {
  const readTime = getReadingTime(
    article.full_text || getArticleBody(article),
    article.reading_time_minutes,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = isValidArticleImage(article.image) && !imgFailed && (article.image_quality_score ?? 0.55) >= 0.5;
  const articleBody = getArticleBody(article);
  const bulletPoints = article.bullet_points?.filter(Boolean) || [];

  useFocusTrap(containerRef, onClose);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {showImage ? (
          <img
            className="modal-image"
            src={article.image}
            alt={article.title}
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
          <div className="modal-meta-top">
            <span className="modal-source">{article.source}</span>
            <span className="modal-date">{formatDate(article.published_at || article.date)}</span>
            {readTime && <span className="modal-reading">{readTime} Min. Lesezeit</span>}
          </div>

          <h2 className="modal-title">{article.title}</h2>

          {article.dek && (
            <div className="modal-standfirst">{article.dek}</div>
          )}

          <div className="modal-text">
            {articleBody ||
              (article.description && article.description !== 'Comments'
                ? article.description
                : 'Keine Zusammenfassung verfügbar.')}
          </div>

          {bulletPoints.length > 0 && (
            <ul className="modal-bullets">
              {bulletPoints.map((point, index) => (
                <li key={`${point}-${index}`}>{point}</li>
              ))}
            </ul>
          )}

          {article.why_it_matters && (
            <div className="modal-why">
              <span className="modal-why-label">Warum es wichtig ist</span>
              <p className="modal-why-text">{article.why_it_matters}</p>
            </div>
          )}

          {article.author && (
            <div className="modal-author">Autor: {article.author}</div>
          )}

          {(article.canonical_url || article.link) && (
            <div className="modal-links">
              <a
                className="modal-source-link"
                href={article.canonical_url || article.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Weiterlesen auf {article.source} →
              </a>
              {article.discussion_url && article.discussion_url !== article.link && (
                <a
                  className="modal-discussion-link"
                  href={article.discussion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Diskussion auf Hacker News →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
