import { useState } from 'react';
import type { Article } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { smartTruncate } from '../utils/textUtils';

interface Props {
  articles: Article[];
  categoryId: string;
  label: string;
  sectionId: string;
  onArticleClick: (article: Article) => void;
  /** Optional extra cards to render after article secondaries */
  extraCards?: React.ReactNode;
}

function LeadImage({ src, catId }: { src: string | undefined; catId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="lead-story-img lead-story-placeholder" style={{ background: getCategoryGradient(catId) }}>
      <span className="lead-placeholder-icon">{getCategoryIcon(catId)}</span>
    </div>
  );
}

function SecondaryThumb({ src, catId }: { src: string | undefined; catId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="secondary-story-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="secondary-story-thumb-placeholder" style={{ background: getCategoryGradient(catId) }}>
      <span>{getCategoryIcon(catId)}</span>
    </div>
  );
}

export function CategorySection({ articles, categoryId, label, sectionId, onArticleClick, extraCards }: Props) {
  if (articles.length === 0 && !extraCards) return null;

  const lead = articles.length > 0 ? articles[0] : null;
  const secondary = articles.slice(1, 4);

  return (
    <section className="category-section" id={sectionId}>
      <div className="category-section-grid">
        {/* Lead Story */}
        {lead && (
          <a
            href={lead.link || '#'}
            className="lead-story"
            onClick={(e) => { e.preventDefault(); onArticleClick(lead); }}
          >
            <div className={`category-badge cat-${categoryId}`}>{label}</div>
            <h2 className="lead-story-title">{lead.title}</h2>
            <p className="lead-story-excerpt">
              {lead.summary || lead.description || ''}
            </p>
            {lead.otto_comment && (
              <div className="lead-story-relevance">
                Warum relevant: {lead.otto_comment}
              </div>
            )}
            <LeadImage src={lead.image} catId={categoryId} />
          </a>
        )}

        {/* Secondary Stories */}
        <div className="secondary-stories">
          {secondary.map((article, i) => (
            <a
              key={i}
              href={article.link || '#'}
              className="secondary-story"
              onClick={(e) => { e.preventDefault(); onArticleClick(article); }}
            >
              <div className={`category-badge cat-${categoryId}`}>{label}</div>
              <div className="secondary-story-inner">
                <div className="secondary-story-text">
                  <h3 className="secondary-story-title">{article.title}</h3>
                  <p className="secondary-story-excerpt">
                    {smartTruncate(article.summary || article.description || '', 180)}
                  </p>
                </div>
                <SecondaryThumb src={article.image} catId={categoryId} />
              </div>
            </a>
          ))}
          {extraCards}
        </div>
      </div>
    </section>
  );
}
