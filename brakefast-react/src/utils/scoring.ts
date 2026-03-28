/**
 * Article scoring and top story selection for BrakeFast.
 *
 * Extracts the scoring logic from HeroBriefing.tsx into a testable,
 * reusable module with named constants replacing magic numbers.
 */

import type { Article } from '../types';
import { isValidArticleImage } from './imageUtils';

/** Default image quality score when none is provided by the pipeline */
export const DEFAULT_IMAGE_QUALITY_SCORE = 0.55;

/** Minimum image quality score to qualify as a "good" image */
export const MIN_GOOD_IMAGE_SCORE = 0.5;

/** Summary quality score when an article has a summary but no explicit score */
export const SUMMARY_PRESENT_SCORE = 0.7;

/** Summary quality score when an article has only a dek (no summary) */
export const DEK_ONLY_SCORE = 0.55;

/** Summary quality score when an article has neither summary nor dek */
export const NO_SUMMARY_SCORE = 0.2;

/** Bonus added for articles with content_quality === 'high' */
export const HIGH_CONTENT_BONUS = 0.18;

/** Bonus added for articles with content_quality === 'medium' */
export const MEDIUM_CONTENT_BONUS = 0.08;

/** Bonus added for articles with a valid, high-quality image */
export const IMAGE_BONUS = 0.16;

/**
 * Calculate a composite score for an article based on relevance,
 * summary quality, content quality, and image quality.
 *
 * Higher scores indicate better candidates for top story placement.
 */
export function scoreArticle(article: Article): number {
  const hasGoodImage =
    isValidArticleImage(article.image) &&
    (article.image_quality_score ?? DEFAULT_IMAGE_QUALITY_SCORE) >= MIN_GOOD_IMAGE_SCORE;

  const summaryScore =
    article.summary_quality_score ??
    (article.summary ? SUMMARY_PRESENT_SCORE : article.dek ? DEK_ONLY_SCORE : NO_SUMMARY_SCORE);

  const relevanceScore = article.relevance_score ?? 0;

  const contentBonus =
    article.content_quality === 'high'
      ? HIGH_CONTENT_BONUS
      : article.content_quality === 'medium'
        ? MEDIUM_CONTENT_BONUS
        : 0;

  const imageBonus = hasGoodImage ? IMAGE_BONUS : 0;

  return relevanceScore + summaryScore + contentBonus + imageBonus;
}

/**
 * Pick the best article as Top Story across all categories.
 *
 * Selects the article with the highest composite score from all
 * categories in the newspaper data. Returns null if no articles exist.
 */
export function pickTopStory(data: { categories: Record<string, { articles?: Article[] }> }): Article | null {
  const allArticles: Article[] = [];
  for (const cat of Object.values(data.categories)) {
    if (cat.articles) allArticles.push(...cat.articles);
  }
  if (allArticles.length === 0) return null;

  return [...allArticles].sort((a, b) => scoreArticle(b) - scoreArticle(a))[0] || null;
}
