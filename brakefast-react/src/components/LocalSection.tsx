import { useState } from 'react';
import type { Article } from '../types';
import { SectionHeader } from './SectionHeader';
import { isValidArticleImage, getCategoryGradient } from '../utils/imageUtils';
import { getReadingTime } from '../utils/textUtils';

interface Props {
  articles: Article[];
  onArticleClick: (article: Article) => void;
}

function LocalFeaturedImage({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img src={src} alt="" onError={() => setFailed(true)} />;
  }

  return (
    <div
      style={{
        background: getCategoryGradient('local'),
        width: '100%',
        height: '100%',
        minHeight: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '48px',
        opacity: 0.2,
      }}
    >
      🏔️
    </div>
  );
}

export function LocalSection({ articles, onArticleClick }: Props) {
  if (articles.length === 0) return null;

  const featured = articles[0];
  const sideItems = articles.slice(1);

  return (
    <>
      <SectionHeader id="steiermark" icon="🏔" title="Steiermark & Lokal" tag={{ text: 'NEU', colorClass: 'tag-local' }} />
      <div className="local-grid">
        <a
          className="local-main"
          href={featured.link || '#'}
          onClick={(e) => { e.preventDefault(); onArticleClick(featured); }}
        >
          <LocalFeaturedImage src={featured.image} />
          <div className="overlay">
            <span className="cat-badge" style={{ background: 'var(--accent-green)' }}>Steiermark</span>
            <h3>{featured.title}</h3>
            <div className="meta">{featured.source}{getReadingTime(featured.summary || featured.description, featured.reading_time_minutes) ? ` · ${getReadingTime(featured.summary || featured.description, featured.reading_time_minutes)} Min.` : ''}</div>
          </div>
        </a>
        {sideItems.length > 0 && (
          <div className="local-sidebar">
            {sideItems.map((article, i) => (
              <a
                key={i}
                className="local-item"
                href={article.link || '#'}
                onClick={(e) => { e.preventDefault(); onArticleClick(article); }}
              >
                <h4>{article.title}</h4>
                <div className="meta">
                  {article.source}{getReadingTime(article.summary || article.description, article.reading_time_minutes) ? ` · ${getReadingTime(article.summary || article.description, article.reading_time_minutes)} Min.` : ''}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
