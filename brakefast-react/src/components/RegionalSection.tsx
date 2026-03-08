import type { Article } from '../types';
import { smartTruncate } from '../utils/textUtils';

interface Props {
  localArticles: Article[];
  evArticles: Article[];
  onArticleClick: (article: Article) => void;
}

export function RegionalSection({ localArticles, evArticles, onArticleClick }: Props) {
  const hasLocal = localArticles.length > 0;
  const hasEv = evArticles.length > 0;

  if (!hasLocal && !hasEv) return null;

  const featured = hasLocal ? localArticles[0] : null;
  const otherLocal = hasLocal ? localArticles.slice(1, 4) : [];

  return (
    <section className="regional-section">
      {hasLocal && (
        <div className="regional-block" id="steiermark">
          <div className="section-title-bar">
            <h2 className="section-title">Steiermark / Lokal</h2>
            <p className="section-subtitle">Ein fixer Charakterbaustein aus deinem bestehenden Entwurf</p>
          </div>

          {featured && (
            <div
              className="regional-featured"
              onClick={() => onArticleClick(featured)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(featured); }}
            >
              <div className="category-badge cat-local">Lokal</div>
              <h3 className="regional-featured-title">{featured.title}</h3>
              <p className="regional-featured-text">
                {smartTruncate(featured.summary || featured.description || '', 200)}
              </p>
            </div>
          )}

          {otherLocal.map((article, i) => (
            <div
              key={i}
              className="regional-item"
              onClick={() => onArticleClick(article)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
            >
              <h4>{article.title}</h4>
              <span className="regional-item-meta">{article.source}</span>
            </div>
          ))}
        </div>
      )}

      {hasEv && (
        <div className="regional-block" id="ev">
          <div className="section-title-bar">
            <h2 className="section-title">E-Mobilität</h2>
            <p className="section-subtitle">Aus deinem aktuellen Konzept übernommen und inhaltlich klarer definiert</p>
          </div>

          {evArticles.slice(0, 4).map((article, i) => (
            <div
              key={i}
              className="regional-ev-item"
              onClick={() => onArticleClick(article)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
            >
              <h4>{article.title}</h4>
              <p>{smartTruncate(article.summary || article.description || '', 120)}</p>
              <span className="regional-item-meta">{article.source}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
