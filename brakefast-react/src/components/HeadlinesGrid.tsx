import type { Article } from '../types';
import { SectionHeader } from './SectionHeader';

interface Props {
  articles: Article[];
  onArticleClick: (article: Article) => void;
}

export function HeadlinesGrid({ articles, onArticleClick }: Props) {
  if (articles.length === 0) return null;

  return (
    <>
      <SectionHeader id="welt" icon="🌍" title="Welt & Politik" tag={{ text: 'NEU', colorClass: 'tag-world' }} />
      <div className="headlines-grid">
        {articles.slice(0, 6).map((article, i) => (
          <div
            key={i}
            className="headline-item"
            onClick={() => onArticleClick(article)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(article); }}
          >
            <div className="headline-num">{i + 1}</div>
            <div className="headline-content">
              <h3>{article.title}</h3>
              <div className="meta">
                {article.source} · {article.reading_time_minutes || 2} Min. Lesezeit
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
