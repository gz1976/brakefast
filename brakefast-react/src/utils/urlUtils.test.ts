import { describe, it, expect } from 'vitest';
import { normalizeUrl, deduplicateArticles } from './urlUtils';
import type { Article, NewspaperData } from '../types';

describe('normalizeUrl', () => {
  it('strips utm_source, utm_medium, utm_campaign params', () => {
    const url = 'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=spring&id=42';
    const result = normalizeUrl(url);
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_medium');
    expect(result).not.toContain('utm_campaign');
    expect(result).toContain('id=42');
  });

  it('strips fbclid and gclid params', () => {
    const url = 'https://example.com/page?fbclid=abc123&gclid=def456';
    const result = normalizeUrl(url);
    expect(result).not.toContain('fbclid');
    expect(result).not.toContain('gclid');
    expect(result).toBe('https://example.com/page');
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/article/')).toBe('https://example.com/article');
  });

  it('lowercases hostname but preserves path case', () => {
    const result = normalizeUrl('https://EXAMPLE.COM/Article-Title');
    expect(result).toContain('example.com');
    expect(result).toContain('/Article-Title');
  });

  it('preserves non-tracking params (id, p, page)', () => {
    const url = 'https://example.com/article?id=42&p=news&page=2';
    const result = normalizeUrl(url);
    expect(result).toContain('id=42');
    expect(result).toContain('p=news');
    expect(result).toContain('page=2');
  });

  it('handles invalid URLs gracefully by returning lowercased input', () => {
    const result = normalizeUrl('not-a-valid-url');
    expect(result).toBe('not-a-valid-url');
  });

  it('lowercases and strips trailing slash for invalid URLs', () => {
    const result = normalizeUrl('NOT-A-URL/');
    expect(result).toBe('not-a-url');
  });
});

describe('deduplicateArticles', () => {
  const makeArticle = (overrides: Partial<Article> = {}): Article => ({
    title: 'Test Article',
    link: 'https://example.com/article',
    description: 'Description',
    date: '2026-01-01',
    source: 'Source',
    ...overrides,
  });

  const wrapInData = (articles: Article[]): NewspaperData => ({
    generated: '2026-01-01',
    totalArticles: articles.length,
    categories: {
      test: { name: 'Test', emoji: '', css_class: '', articles },
    },
  });

  it('removes duplicate URLs keeping higher content_quality', () => {
    const high = makeArticle({ content_quality: 'high', summary: 'short' });
    const low = makeArticle({ link: 'https://example.com/article/', content_quality: 'low', summary: 'much longer summary text here' });
    const data = wrapInData([low, high]);
    const result = deduplicateArticles(data);
    const articles = result.categories['test'].articles;
    expect(articles).toHaveLength(1);
    expect(articles[0].content_quality).toBe('high');
  });

  it('keeps article with longer summary when quality is equal', () => {
    const short = makeArticle({ content_quality: 'medium', summary: 'short' });
    const long = makeArticle({ link: 'https://example.com/article/', content_quality: 'medium', summary: 'a much longer and more detailed summary text' });
    const data = wrapInData([short, long]);
    const result = deduplicateArticles(data);
    const articles = result.categories['test'].articles;
    expect(articles).toHaveLength(1);
    expect(articles[0].summary).toBe('a much longer and more detailed summary text');
  });

  it('returns data unchanged when no duplicates exist', () => {
    const a1 = makeArticle({ link: 'https://example.com/one' });
    const a2 = makeArticle({ link: 'https://example.com/two' });
    const data = wrapInData([a1, a2]);
    const result = deduplicateArticles(data);
    expect(result.categories['test'].articles).toHaveLength(2);
  });
});
