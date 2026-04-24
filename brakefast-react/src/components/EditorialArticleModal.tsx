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

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI & Tech',
  knapp: 'KNAPP',
  dev_digest: 'Dev Digest',
  ki_modelle: 'KI Modelle',
  security: 'Security',
  world: 'Welt',
  local: 'Steiermark',
  ev: 'E-Mobilität',
  'top-stories': 'Top Story',
};

export function EditorialArticleModal({ article, categoryId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const readTime = getReadingTime(
    article.full_text || getArticleBody(article),
    article.reading_time_minutes,
  );
  const showImage = isValidArticleImage(article.image) && !imgFailed && (article.image_quality_score ?? 0.55) >= 0.5;
  const articleBody = getArticleBody(article);
  const bulletPoints = article.bullet_points?.filter(Boolean) || [];
  const catLabel = CATEGORY_LABELS[categoryId || ''] || categoryId || '';
  const dateStr = formatDate(article.published_at || article.date);

  useFocusTrap(containerRef, onClose);

  return (
    <div className="ed-modal-overlay" onClick={onClose}>
      <div className="ed-modal-panel" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <div className="ed-modal-header">
          <button className="ed-modal-close modal-close" onClick={onClose}>
            ✕ Schließen
          </button>
          <div className="ed-modal-meta">
            {article.source}
            {dateStr && <> · {dateStr}</>}
          </div>
        </div>

        <div className="ed-modal-rule" />

        <div className="ed-modal-content">
          <div className="ed-modal-kicker">
            {catLabel && <span>{catLabel}</span>}
            {catLabel && readTime && <span> · </span>}
            {readTime && <span>{readTime} Min. Lesezeit</span>}
          </div>

          <h2 className="ed-modal-title">{article.title}</h2>

          {article.dek && (
            <p className="ed-modal-standfirst">{article.dek}</p>
          )}

          <div className="ed-modal-byline">
            Von {article.source}
            {dateStr && <> · {dateStr}</>}
            {readTime && <> · {readTime} Min. Lesezeit</>}
          </div>

          <div className="ed-modal-divider" />

          {showImage ? (
            <>
              <img
                className="ed-modal-image"
                src={article.image}
                alt={article.title}
                onError={() => setImgFailed(true)}
              />
              <div className="ed-modal-caption">{article.source}</div>
              <div className="ed-modal-divider" />
            </>
          ) : (
            <>
              <div
                className="ed-modal-image-placeholder"
                style={{ background: getCategoryGradient(categoryId || 'default') }}
              >
                <span>{getCategoryIcon(categoryId || 'default')}</span>
              </div>
              <div className="ed-modal-divider" />
            </>
          )}

          <div className="ed-modal-body">
            {articleBody ||
              (article.description && article.description !== 'Comments'
                ? article.description
                : 'Keine Zusammenfassung verfügbar.')}
          </div>

          {bulletPoints.length > 0 && (
            <>
              <div className="ed-modal-section-title">Im Überblick</div>
              <ul className="ed-modal-bullets">
                {bulletPoints.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
                ))}
              </ul>
            </>
          )}

          {article.why_it_matters && (
            <>
              <div className="ed-modal-section-title">Warum das wichtig ist</div>
              <p className="ed-modal-why">{article.why_it_matters}</p>
            </>
          )}

          {(article.canonical_url || article.link) && (
            <div className="ed-modal-footer">
              <a
                className="ed-modal-link"
                href={article.canonical_url || article.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Artikel öffnen →
              </a>
              {article.discussion_url && article.discussion_url !== article.link && (
                <a
                  className="ed-modal-link"
                  href={article.discussion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: '1.5rem' }}
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
