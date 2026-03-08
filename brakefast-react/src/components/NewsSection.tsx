import type { Article } from '../types';
import { smartTruncate, getReadingTime } from '../utils/textUtils';

interface Props {
  securityArticles: Article[];
  worldArticles: Article[];
  onArticleClick: (article: Article) => void;
}

export function NewsSection({ securityArticles, worldArticles, onArticleClick }: Props) {
  const hasSecurity = securityArticles.length > 0;
  const hasWorld = worldArticles.length > 0;

  if (!hasSecurity && !hasWorld) return null;

  return (
    <div className="news-section" id="security">
      <div className="section-title-bar">
        <h2 className="section-title">Security / Welt / Logistik</h2>
        <p className="section-subtitle">Rubriken, die Profil geben und deine Zeitung erwachsener machen</p>
      </div>

      <div className="news-section-cards">
        {hasSecurity && (
          <div className="news-card-group">
            <div className="category-badge cat-security">Security</div>
            {securityArticles.slice(0, 3).map((article, i) => (
              <a
                key={i}
                className="news-article-item"
                href={article.link || '#'}
                onClick={(e) => { e.preventDefault(); onArticleClick(article); }}
              >
                <h4>{article.title}</h4>
                <p>{smartTruncate(article.summary || article.description || '', 150)}</p>
                <span className="news-item-meta">{article.source}{getReadingTime(article.summary || article.description, article.reading_time_minutes) ? ` · ${getReadingTime(article.summary || article.description, article.reading_time_minutes)} Min.` : ''}</span>
              </a>
            ))}
          </div>
        )}

        {hasWorld && (
          <div className="news-card-group">
            <div className="category-badge cat-world">Welt</div>
            {worldArticles.slice(0, 3).map((article, i) => (
              <a
                key={i}
                className="news-article-item"
                href={article.link || '#'}
                onClick={(e) => { e.preventDefault(); onArticleClick(article); }}
              >
                <h4>{article.title}</h4>
                <p>{smartTruncate(article.summary || article.description || '', 150)}</p>
                <span className="news-item-meta">{article.source}{getReadingTime(article.summary || article.description, article.reading_time_minutes) ? ` · ${getReadingTime(article.summary || article.description, article.reading_time_minutes)} Min.` : ''}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
