import { useState } from 'react';
import type { Article } from '../types';
import { isValidLeadImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { getArticleTeaser, smartTruncate } from '../utils/textUtils';

interface Props {
  articles: Article[];
  categoryId: string;
  label: string;
  sectionId: string;
  editionNumber?: number;
  generatedDate?: string;
  onArticleClick: (article: Article) => void;
  isRead?: (link: string, title?: string) => boolean;
}

/**
 * Internal image sub-component for the lead article.
 * Mirrors the TopStoryVisual pattern from EditorialFirstScreen.tsx (lines 107-130).
 * Uses loading="lazy" because category sections live below the fold.
 */
function LeadImage({ article, categoryId }: { article: Article; categoryId: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidLeadImage(article.image) && !failed;
  if (valid) {
    return (
      <img
        src={article.image}
        alt={article.title}
        className="ed-cat-lead-img"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const source = article.source || '';
  return (
    <div
      className="ed-cat-lead-img ed-cat-lead-img-placeholder"
      style={{ background: getCategoryGradient(categoryId) }}
      aria-hidden="true"
    >
      {source && <span className="ed-cat-lead-img-source">{source}</span>}
      <span className="ed-cat-lead-img-icon">{getCategoryIcon(categoryId)}</span>
    </div>
  );
}

/**
 * Editorial newsprint-themed category section (Phase 5).
 * Renders one lead article (left 2/3 column with image) and up to 4 stacked
 * secondary headlines (right 1/3 column, no images — D-04).
 *
 * Click delegation: onArticleClick is called with the article; read-tracking is
 * handled upstream in BrakeFastApp.handleArticleClick (D-11).
 *
 * Returns null when the articles array is empty (matches CategorySection.tsx:49 idiom).
 */
export function EditorialCategorySection({
  articles,
  categoryId,
  label,
  sectionId,
  editionNumber,
  generatedDate,
  onArticleClick,
  isRead,
}: Props) {
  // Early-return on empty data — mirrors CategorySection.tsx:49 early-return idiom
  if (!articles?.length) return null;

  // D-05 resolved: 1 lead + up to 4 stacked items (5 total per section)
  const lead = articles[0];
  const stacked = articles.slice(1, 5);

  // D-06 dateline format: AUSGABE #{edition} • {de-AT date}
  const formattedDate = generatedDate
    ? new Date(generatedDate)
        .toLocaleDateString('de-AT', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()
    : '';
  const dateline =
    editionNumber != null
      ? `AUSGABE #${editionNumber}${formattedDate ? ' • ' + formattedDate : ''}`
      : formattedDate;

  // Body teaser — skip the block when source string is empty (per plan spec)
  const leadBody = smartTruncate(lead.description || lead.summary || '', 420);

  return (
    <section className="ed-category" id={sectionId}>
      {/* Section head: ALL-CAPS label + dateline + ink rule (D-06) */}
      <header className="ed-cat-head">
        <span className="ed-cat-head-name">{label}</span>
        {dateline && <span className="ed-cat-dateline">{dateline}</span>}
      </header>

      {/* Two-column grid: left lead (2fr) / right stack (1fr) — D-04 */}
      <div className="ed-cat-grid">
        {/* ── Left column: lead article ── */}
        <article className="ed-cat-lead">
          {/* Lead image — clickable */}
          <div
            className="ed-cat-lead-img-wrap"
            role="button"
            tabIndex={0}
            onClick={() => onArticleClick(lead)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onArticleClick(lead);
              }
            }}
          >
            <LeadImage article={lead} categoryId={categoryId} />
          </div>

          {/* Lead headline — clickable, with unread dot (D-12) */}
          <h2
            className="ed-cat-lead-headline"
            role="button"
            tabIndex={0}
            onClick={() => onArticleClick(lead)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onArticleClick(lead);
              }
            }}
          >
            {isRead && !isRead(lead.link, lead.title) && (
              <span className="ed-cat-unread" aria-hidden="true" />
            )}
            {lead.title}
          </h2>

          {/* Lead deck (full teaser) */}
          <p className="ed-cat-lead-deck">{getArticleTeaser(lead)}</p>

          {/* Lead body teaser — skipped when empty */}
          {leadBody && <p className="ed-cat-lead-body">{leadBody}</p>}

          {/* Lead byline */}
          <div className="ed-cat-lead-byline">
            {lead.source}
            {lead.reading_time_minutes ? ` · ${lead.reading_time_minutes} Min. Lesezeit` : ''}
          </div>
        </article>

        {/* ── Right column: stacked secondary articles ── */}
        <div className="ed-cat-stack">
          {stacked.map((article) => (
            <article
              key={article.link}
              className="ed-cat-stack-item"
              role="button"
              tabIndex={0}
              onClick={() => onArticleClick(article)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onArticleClick(article);
                }
              }}
            >
              {/* Source meta (9px uppercase) */}
              <div className="ed-cat-stack-source">{article.source}</div>

              {/* Stack headline with unread dot (D-12) */}
              <h3 className="ed-cat-stack-h">
                {isRead && !isRead(article.link, article.title) && (
                  <span className="ed-cat-unread" aria-hidden="true" />
                )}
                {article.title}
              </h3>

              {/* Stack deck — 2-line clamp via CSS */}
              <p className="ed-cat-stack-d">
                {smartTruncate(getArticleTeaser(article), 120)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
