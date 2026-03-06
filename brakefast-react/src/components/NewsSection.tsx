import type { Article } from '../types';

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
              <div
                key={i}
                className="news-article-item"
                onClick={() => onArticleClick(article)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
              >
                <h4>{article.title}</h4>
                <p>{(article.summary || article.description || '').slice(0, 150)}</p>
                <span className="news-item-meta">{article.source} · {article.reading_time_minutes || 2} Min.</span>
              </div>
            ))}
          </div>
        )}

        {hasWorld && (
          <div className="news-card-group">
            <div className="category-badge cat-world">Welt</div>
            {worldArticles.slice(0, 3).map((article, i) => (
              <div
                key={i}
                className="news-article-item"
                onClick={() => onArticleClick(article)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
              >
                <h4>{article.title}</h4>
                <p>{(article.summary || article.description || '').slice(0, 150)}</p>
                <span className="news-item-meta">{article.source} · {article.reading_time_minutes || 2} Min.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
