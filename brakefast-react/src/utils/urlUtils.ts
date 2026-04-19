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

/** Common German + English stopwords (lowercased, no punctuation) excluded from similarity tokens */
const STOPWORDS = new Set([
  // German
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einer', 'eines', 'einem',
  'und', 'oder', 'aber', 'sondern', 'denn', 'weil', 'wenn', 'dass', 'damit',
  'von', 'vom', 'zum', 'zur', 'für', 'auf', 'bei', 'aus', 'mit', 'ohne', 'durch', 'über', 'unter',
  'nach', 'vor', 'gegen', 'beim', 'ins', 'hinter', 'neben', 'zwischen',
  'ist', 'sind', 'war', 'waren', 'wird', 'wurde', 'werden', 'sein', 'seine', 'seinen',
  'hat', 'hatte', 'haben', 'habe', 'hatten',
  'wie', 'was', 'wer', 'wo', 'dann', 'als', 'auch', 'noch', 'schon', 'mehr', 'sehr', 'nur',
  'doch', 'heute', 'hier', 'dort', 'damit', 'also', 'jedoch',
  'nicht', 'kein', 'keine', 'keinen', 'keiner', 'nichts',
  'sich', 'sie', 'ihr', 'ihre', 'ihren', 'ihrer', 'ihm', 'ihn', 'man', 'mich', 'dich',
  'nachdem', 'bevor', 'während', 'solange', 'seit', 'seitdem',
  // English
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'this', 'that', 'these', 'those',
  'have', 'has', 'had', 'will', 'was', 'were', 'been', 'being', 'are', 'but', 'not',
  'you', 'your', 'its', 'their', 'they', 'them', 'over', 'under', 'after', 'before',
  'which', 'while', 'during', 'between', 'through', 'against',
]);

/** Tokenize title + summary into content words for similarity comparison */
function tokenizeForSimilarity(article: Article): Set<string> {
  const text = `${article.title || ''} ${article.summary || article.description || ''}`;
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** Decide if two articles refer to the same story based on title+summary overlap.
 *  Duplicate if EITHER Jaccard >= 0.4 OR at least 2 shared "strong" tokens (>= 8 chars). */
function isNearDuplicate(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let intersect = 0;
  let strongOverlap = 0;
  for (const t of a) {
    if (b.has(t)) {
      intersect++;
      if (t.length >= 8) strongOverlap++;
    }
  }
  if (strongOverlap >= 2) return true;
  const jaccard = intersect / (a.size + b.size - intersect);
  return jaccard >= 0.4;
}

/** Tie-breaker: pick the article with more complete content.
 *  Priority: higher content_quality rank, then longer summary. */
function preferArticle(candidate: Article, existing: Article): boolean {
  const candidateRank = QUALITY_RANK[candidate.content_quality || ''] || 0;
  const existingRank = QUALITY_RANK[existing.content_quality || ''] || 0;
  if (candidateRank !== existingRank) return candidateRank > existingRank;
  const candidateLen = (candidate.summary || candidate.description || '').length;
  const existingLen = (existing.summary || existing.description || '').length;
  return candidateLen > existingLen;
}

/** Deduplicate articles across all categories — two passes: URL, then title/summary similarity */
export function deduplicateArticles(data: NewspaperData): NewspaperData {
  const result = { ...data, categories: { ...data.categories } };
  for (const [catKey, category] of Object.entries(result.categories)) {
    // Pass 1: exact URL dedup
    const seen = new Map<string, Article>();
    const afterUrl: Article[] = [];
    for (const article of category.articles) {
      const key = normalizeUrl(article.link);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, article);
        afterUrl.push(article);
      } else if (preferArticle(article, existing)) {
        const idx = afterUrl.indexOf(existing);
        if (idx >= 0) afterUrl[idx] = article;
        seen.set(key, article);
      }
    }

    // Pass 2: title+summary similarity dedup (cross-source duplicates)
    const tokenCache = new Map<Article, Set<string>>();
    const getTokens = (a: Article): Set<string> => {
      let t = tokenCache.get(a);
      if (!t) { t = tokenizeForSimilarity(a); tokenCache.set(a, t); }
      return t;
    };
    const final: Article[] = [];
    for (const article of afterUrl) {
      const tokens = getTokens(article);
      const dupIdx = final.findIndex((kept) => isNearDuplicate(getTokens(kept), tokens));
      if (dupIdx < 0) {
        final.push(article);
      } else if (preferArticle(article, final[dupIdx])) {
        final[dupIdx] = article;
      }
    }
    result.categories[catKey] = { ...category, articles: final };
  }
  return result;
}
