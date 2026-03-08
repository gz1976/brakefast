import type { Article } from '../types';
import { SectionHeader } from './SectionHeader';
import { getReadingTime } from '../utils/textUtils';

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
          <a
            key={i}
            className="headline-item"
            href={article.link || '#'}
            onClick={(e) => { e.preventDefault(); onArticleClick(article); }}
          >
            <div className="headline-num">{i + 1}</div>
            <div className="headline-content">
              <h3>{article.title}</h3>
              <div className="meta">
                {article.source}{getReadingTime(article.summary || article.description, article.reading_time_minutes) ? ` · ${getReadingTime(article.summary || article.description, article.reading_time_minutes)} Min. Lesezeit` : ''}
              </div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
