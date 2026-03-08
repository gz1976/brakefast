import { useState } from 'react';
import type { Article } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { getReadingTime } from '../utils/textUtils';

interface Props {
  article: Article;
  categoryLabel: string;
  colorClass: string;
  catId?: string;
  onArticleClick: (article: Article) => void;
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
  const readTime = getReadingTime(
    article.summary || article.description,
    article.reading_time_minutes,
  );

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
          {readTime && <span className="reading-time">{readTime} Min.</span>}
        </div>
      </div>
    </div>
  );
}
