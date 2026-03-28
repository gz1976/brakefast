import { describe, it, expect } from 'vitest';
import {
  scoreArticle,
  pickTopStory,
  HIGH_CONTENT_BONUS,
  MEDIUM_CONTENT_BONUS,
  IMAGE_BONUS,
  SUMMARY_PRESENT_SCORE,
  DEK_ONLY_SCORE,
  NO_SUMMARY_SCORE,
} from './scoring';
import type { Article } from '../types';

function createArticle(overrides?: Partial<Article>): Article {
  return {
    title: 'Test Article',
    link: 'https://example.com/article',
    description: 'A test article description',
    date: '2026-03-27',
    source: 'Test Source',
    ...overrides,
  };
}

describe('scoreArticle', () => {
  it('scores high content_quality higher than low by exactly HIGH_CONTENT_BONUS', () => {
    const high = createArticle({ relevance_score: 0.5, content_quality: 'high', summary: 'text' });
    const low = createArticle({ relevance_score: 0.5, content_quality: 'low', summary: 'text' });
    const diff = scoreArticle(high) - scoreArticle(low);
    expect(diff).toBeCloseTo(HIGH_CONTENT_BONUS, 10);
  });

  it('scores medium content_quality higher than low by MEDIUM_CONTENT_BONUS', () => {
    const medium = createArticle({ relevance_score: 0.5, content_quality: 'medium', summary: 'text' });
    const low = createArticle({ relevance_score: 0.5, content_quality: 'low', summary: 'text' });
    const diff = scoreArticle(medium) - scoreArticle(low);
    expect(diff).toBeCloseTo(MEDIUM_CONTENT_BONUS, 10);
  });

  it('adds IMAGE_BONUS for valid image with quality >= 0.5', () => {
    const withImage = createArticle({
      relevance_score: 0.5,
      image: 'https://example.com/a-reasonable-length-image-url.jpg',
      image_quality_score: 0.8,
    });
    const withoutImage = createArticle({ relevance_score: 0.5 });
    const diff = scoreArticle(withImage) - scoreArticle(withoutImage);
    expect(diff).toBeCloseTo(IMAGE_BONUS, 10);
  });

  it('does not add IMAGE_BONUS for image with quality < 0.5', () => {
    const lowQualityImage = createArticle({
      relevance_score: 0.5,
      image: 'https://example.com/a-reasonable-length-image-url.jpg',
      image_quality_score: 0.3,
    });
    const noImage = createArticle({ relevance_score: 0.5 });
    const diff = scoreArticle(lowQualityImage) - scoreArticle(noImage);
    expect(diff).toBeCloseTo(0, 10);
  });

  it('uses SUMMARY_PRESENT_SCORE when summary exists but no summary_quality_score', () => {
    const article = createArticle({ summary: 'A summary' });
    // Score = 0 (relevance) + SUMMARY_PRESENT_SCORE + 0 (content) + 0 (image)
    expect(scoreArticle(article)).toBeCloseTo(SUMMARY_PRESENT_SCORE, 10);
  });

  it('uses DEK_ONLY_SCORE when dek exists but no summary', () => {
    const article = createArticle({ dek: 'A dek line' });
    expect(scoreArticle(article)).toBeCloseTo(DEK_ONLY_SCORE, 10);
  });

  it('uses NO_SUMMARY_SCORE when neither summary nor dek exists', () => {
    const article = createArticle();
    expect(scoreArticle(article)).toBeCloseTo(NO_SUMMARY_SCORE, 10);
  });

  it('uses summary_quality_score when explicitly provided', () => {
    const article = createArticle({ summary: 'text', summary_quality_score: 0.9 });
    expect(scoreArticle(article)).toBeCloseTo(0.9, 10);
  });

  it('includes relevance_score in the total', () => {
    const article = createArticle({ relevance_score: 0.6 });
    expect(scoreArticle(article)).toBeCloseTo(0.6 + NO_SUMMARY_SCORE, 10);
  });
});

describe('pickTopStory', () => {
  it('returns null for empty categories', () => {
    expect(pickTopStory({ categories: {} })).toBeNull();
  });

  it('returns null when all categories have empty articles arrays', () => {
    expect(pickTopStory({
      categories: { ai: { articles: [] }, tech: { articles: [] } },
    })).toBeNull();
  });

  it('returns the highest-scoring article across multiple categories', () => {
    const lowArticle = createArticle({ title: 'Low', relevance_score: 0.1 });
    const highArticle = createArticle({ title: 'High', relevance_score: 0.9, content_quality: 'high', summary: 'Great summary' });

    const result = pickTopStory({
      categories: {
        tech: { articles: [lowArticle] },
        ai: { articles: [highArticle] },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe('High');
  });

  it('handles categories with no articles array gracefully', () => {
    const article = createArticle({ title: 'Only Article', relevance_score: 0.5 });
    const result = pickTopStory({
      categories: {
        ai: { articles: [article] },
        broken: {} as { articles?: Article[] },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Only Article');
  });

  it('returns the single article when only one exists', () => {
    const article = createArticle({ title: 'Solo' });
    const result = pickTopStory({
      categories: { tech: { articles: [article] } },
    });
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Solo');
  });
});
