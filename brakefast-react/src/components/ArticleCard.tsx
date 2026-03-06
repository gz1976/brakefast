import { useState } from 'react';
import type { Article } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';

interface Props {
  article: Article;
  categoryLabel: string;
  colorClass: string;
  catId?: string;
  onArticleClick: (article: Article) => void;
}

function getReadingTime(article: Article): number {
  if (article.reading_time_minutes) return article.reading_time_minutes;
  const words = (article.summary || article.description || '').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function CardImage({ src, catId, categoryLabel }: { src: string | undefined; catId: string; categoryLabel: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return (
      <img
        className="thumb"
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="thumb card-placeholder"
      style={{ background: getCategoryGradient(catId) }}
    >
      <span className="card-placeholder-icon">{getCategoryIcon(catId)}</span>
      <span className="card-placeholder-label">{categoryLabel}</span>
    </div>
  );
}

export function ArticleCard({ article, categoryLabel, colorClass, catId = 'tech', onArticleClick }: Props) {
  const readTime = getReadingTime(article);

  return (
    <div
      className="article-card"
      onClick={() => onArticleClick(article)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
    >
      <CardImage src={article.image} catId={catId} categoryLabel={categoryLabel} />
      <div className="card-body">
        <div className={`card-cat ${colorClass}`}>{categoryLabel}</div>
        <h3>{article.title}</h3>
        <p className="card-excerpt">{article.description || article.summary}</p>
        <div className="card-meta">
          <span>{article.source}</span>
          <span className="reading-time">{readTime} Min.</span>
        </div>
      </div>
    </div>
  );
}
