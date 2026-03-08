import { useState } from 'react';
import type { Article, Category } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { smartTruncate } from '../utils/textUtils';

interface Props {
  categories: Record<string, Category>;
  onArticleClick: (article: Article) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI & Tech',
  security: 'Security',
  ev: 'E-Mobilität',
  local: 'Steiermark',
  world: 'Welt',
  tech: 'Tech & Dev',
};

function getTopArticles(categories: Record<string, Category>): { article: Article; catId: string }[] {
  const all: { article: Article; catId: string; score: number }[] = [];
  for (const [catId, cat] of Object.entries(categories)) {
    for (const article of cat.articles) {
      all.push({ article, catId, score: article.relevance_score ?? 0.5 });
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, 4);
}

function LeadImage({ src, catId }: { src: string | undefined; catId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt="" loading="eager" onError={() => setFailed(true)} />;
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

export function TopStories({ categories, onArticleClick }: Props) {
  const top = getTopArticles(categories);
  if (top.length === 0) return null;

  const lead = top[0];
  const secondary = top.slice(1, 4);
  const leadLabel = CATEGORY_LABELS[lead.catId] || lead.catId;
  const leadExcerpt = lead.article.summary || lead.article.description || '';

  return (
    <section className="top-stories">
      <div className="top-stories-grid">
        <div
          className="lead-story"
          onClick={() => onArticleClick(lead.article)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(lead.article); }}
        >
          <div className={`category-badge cat-${lead.catId}`}>{leadLabel}</div>
          <h2 className="lead-story-title">{lead.article.title}</h2>
          <p className="lead-story-excerpt">{leadExcerpt}</p>
          {lead.article.otto_comment && (
            <div className="lead-story-relevance">
              Warum relevant: {lead.article.otto_comment}
            </div>
          )}
          <LeadImage src={lead.article.image} catId={lead.catId} />
        </div>

        <div className="secondary-stories">
          {secondary.map((item, i) => {
            const label = CATEGORY_LABELS[item.catId] || item.catId;
            return (
              <div
                key={i}
                className="secondary-story"
                onClick={() => onArticleClick(item.article)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(item.article); }}
              >
                <div className={`category-badge cat-${item.catId}`}>{label}</div>
                <div className="secondary-story-inner">
                  <div className="secondary-story-text">
                    <h3 className="secondary-story-title">{item.article.title}</h3>
                    <p className="secondary-story-excerpt">
                      {smartTruncate(item.article.summary || item.article.description || '', 180)}
                    </p>
                  </div>
                  <SecondaryThumb src={item.article.image} catId={item.catId} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
