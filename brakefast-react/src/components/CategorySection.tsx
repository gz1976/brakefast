import { useState } from 'react';
import type { Article } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { getArticleTeaser, smartTruncate } from '../utils/textUtils';

interface Props {
  articles: Article[];
  categoryId: string;
  label: string;
  sectionId: string;
  onArticleClick: (article: Article) => void;
  /** Optional extra cards to render after article secondaries */
  extraCards?: React.ReactNode;
  /** Check if an article has been read (for blue dot indicator) */
  isRead?: (link: string, title?: string) => boolean;
}

function LeadImage({ src, catId, alt }: { src: string | undefined; catId: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="lead-story-img lead-story-placeholder" style={{ background: getCategoryGradient(catId) }}>
      <span className="lead-placeholder-icon">{getCategoryIcon(catId)}</span>
    </div>
  );
}

function SecondaryThumb({ src, catId, alt }: { src: string | undefined; catId: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="secondary-story-thumb" src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="secondary-story-thumb-placeholder" style={{ background: getCategoryGradient(catId) }}>
      <span>{getCategoryIcon(catId)}</span>
    </div>
  );
}

export function CategorySection({ articles, categoryId, label, sectionId, onArticleClick, extraCards, isRead }: Props) {
  if (articles.length === 0 && !extraCards) return null;

  const lead = articles.length > 0 ? articles[0] : null;
  const secondary = articles.slice(1, 6);

  return (
    <section className="category-section" id={sectionId}>
      <div className="category-section-grid">
        {/* Lead Story */}
        {lead && (
          <a
            href={lead.link || '#'}
            className="lead-story"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey) return; e.preventDefault(); onArticleClick(lead); }}
          >
            <div className={`category-badge cat-${categoryId}`}>{label}</div>
            {isRead && !isRead(lead.link, lead.title) && <span className="unread-dot" />}
            <h2 className="lead-story-title">{lead.title}</h2>
            <p className="lead-story-excerpt">
              {getArticleTeaser(lead)}
            </p>
            <LeadImage src={lead.image} catId={categoryId} alt={lead.title} />
          </a>
        )}

        {/* Secondary Stories */}
        <div className="secondary-stories">
          {secondary.map((article, i) => (
            <a
              key={i}
              href={article.link || '#'}
              className="secondary-story"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey) return; e.preventDefault(); onArticleClick(article); }}
            >
              <div className={`category-badge cat-${categoryId}`}>{label}</div>
              {isRead && !isRead(article.link, article.title) && <span className="unread-dot" />}
              <div className="secondary-story-inner">
                <div className="secondary-story-text">
                  <h3 className="secondary-story-title">{article.title}</h3>
                  <p className="secondary-story-excerpt">
                    {smartTruncate(getArticleTeaser(article), 180)}
                  </p>
                </div>
                <SecondaryThumb src={article.image} catId={categoryId} alt={article.title} />
              </div>
            </a>
          ))}
          {extraCards}
        </div>
      </div>
    </section>
  );
}
