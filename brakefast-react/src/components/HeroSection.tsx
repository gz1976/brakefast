import { useState } from 'react';
import type { Article, Category } from '../types';
import { SectionHeader } from './SectionHeader';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { smartTruncate, getReadingTime } from '../utils/textUtils';

interface Props {
  categories: Record<string, Category>;
  onArticleClick: (article: Article) => void;
}

const CATEGORY_STYLES: Record<string, { badge: string; color: string }> = {
  ai: { badge: 'badge-ai', color: 'text-purple' },
  security: { badge: 'badge-security', color: 'text-orange' },
  world: { badge: 'badge-world', color: 'text-blue' },
  local: { badge: 'badge-local', color: 'text-green' },
  tech: { badge: 'badge-dev', color: 'text-cyan' },
  dev: { badge: 'badge-dev', color: 'text-cyan' },
  ev: { badge: 'badge-ev', color: 'text-green' },
};

function getTopArticles(categories: Record<string, Category>): { article: Article; catId: string; catName: string }[] {
  const all: { article: Article; catId: string; catName: string; score: number }[] = [];
  for (const [catId, cat] of Object.entries(categories)) {
    for (const article of cat.articles) {
      all.push({
        article,
        catId,
        catName: cat.name,
        score: article.relevance_score ?? 0.5,
      });
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, 4);
}

function articleReadTime(article: Article): number | null {
  return getReadingTime(
    article.summary || article.description,
    article.reading_time_minutes,
  );
}

function truncateText(text: string, maxChars: number = 300): string {
  return smartTruncate(text, maxChars);
}

function HeroImage({ src, catId }: { src: string | undefined; catId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return (
      <img
        src={src}
        alt=""
        loading="eager"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="hero-placeholder"
      style={{ background: getCategoryGradient(catId) }}
    >
      <span className="hero-placeholder-icon">{getCategoryIcon(catId)}</span>
    </div>
  );
}

function SideCardImage({ src, catId }: { src: string | undefined; catId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: 140, minHeight: 120 }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="side-card-placeholder"
      style={{
        width: 140,
        minHeight: 120,
        background: getCategoryGradient(catId),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '28px',
        flexShrink: 0,
      }}
    >
      {getCategoryIcon(catId)}
    </div>
  );
}

export function HeroSection({ categories, onArticleClick }: Props) {
  const top = getTopArticles(categories);
  if (top.length === 0) return null;

  const hero = top[0];
  const sideCards = top.slice(1, 4);
  const heroStyle = CATEGORY_STYLES[hero.catId] || { badge: 'badge-ai', color: 'text-purple' };
  const heroExcerpt = truncateText(hero.article.summary || hero.article.description || '', 300);

  return (
    <>
      <SectionHeader id="top-stories" icon="🔥" title="Top Stories" />
      <div className="hero-grid">
        <div
          className="hero-main"
          onClick={() => onArticleClick(hero.article)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(hero.article); }}
        >
          <HeroImage src={hero.article.image} catId={hero.catId} />
          <div className="overlay">
            <span className={`cat-badge ${heroStyle.badge}`}>{hero.catName}</span>
            <h1>{hero.article.title}</h1>
            <div className="meta">
              <span>{hero.article.source}</span>
              <span>·</span>
              {articleReadTime(hero.article) && <span>{articleReadTime(hero.article)} Min. Lesezeit</span>}
            </div>
            {heroExcerpt && <p className="excerpt">{heroExcerpt}</p>}
          </div>
        </div>
        <div className="hero-sidebar">
          {sideCards.map((sc, i) => {
            const style = CATEGORY_STYLES[sc.catId] || { badge: 'badge-ai', color: 'text-purple' };
            return (
              <div
                key={i}
                className="hero-side-card"
                onClick={() => onArticleClick(sc.article)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onArticleClick(sc.article); }}
              >
                <SideCardImage src={sc.article.image} catId={sc.catId} />
                <div className="content">
                  <div className={`cat-badge-sm ${style.color}`}>{sc.catName}</div>
                  <h3>{sc.article.title}</h3>
                  <div className="meta">
                    {sc.article.source}{articleReadTime(sc.article) ? ` · ${articleReadTime(sc.article)} Min.` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
