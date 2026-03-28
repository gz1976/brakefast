import type { Article, NewspaperData } from '../types';

/** Parameters commonly added by analytics/tracking that don't affect content identity */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'fbclid', 'gclid', 'mc_cid', 'mc_eid',
]);

/** Content quality ranking for dedup selection */
const QUALITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Normalize a URL for deduplication: lowercase hostname, strip tracking params, remove trailing slash */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase();
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param);
    }
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${path}${url.search}`;
  } catch {
    return rawUrl.toLowerCase().replace(/\/+$/, '');
  }
}

/** Deduplicate articles across all categories by normalized URL, keeping highest quality */
export function deduplicateArticles(data: NewspaperData): NewspaperData {
  const result = { ...data, categories: { ...data.categories } };
  for (const [catKey, category] of Object.entries(result.categories)) {
    const seen = new Map<string, Article>();
    const deduped: Article[] = [];
    for (const article of category.articles) {
      const key = normalizeUrl(article.link);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, article);
        deduped.push(article);
      } else {
        const existingRank = QUALITY_RANK[existing.content_quality || ''] || 0;
        const newRank = QUALITY_RANK[article.content_quality || ''] || 0;
        const existingSummaryLen = (existing.summary || '').length;
        const newSummaryLen = (article.summary || '').length;
        if (newRank > existingRank || (newRank === existingRank && newSummaryLen > existingSummaryLen)) {
          const idx = deduped.indexOf(existing);
          if (idx >= 0) deduped[idx] = article;
          seen.set(key, article);
        }
      }
    }
    result.categories[catKey] = { ...category, articles: deduped };
  }
  return result;
}
