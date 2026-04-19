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
    const a1 = makeArticle({ title: 'Klimagipfel in Dubai startet', link: 'https://example.com/one', description: 'Weltklima-Konferenz beginnt.' });
    const a2 = makeArticle({ title: 'Neue Chipfabrik in Magdeburg', link: 'https://example.com/two', description: 'Halbleiter-Werk eröffnet.' });
    const data = wrapInData([a1, a2]);
    const result = deduplicateArticles(data);
    expect(result.categories['test'].articles).toHaveLength(2);
  });

  it('merges cross-source duplicates via title+summary similarity (Rattengift case)', () => {
    // Real-world example: Der Standard + Tagesschau both covering the Spar/Hipp incident
    const derStandard = makeArticle({
      title: 'Rattengift in Hipp-Glas im Burgenland festgestellt',
      link: 'https://www.derstandard.at/story/3000000317158/rueckruf-aller-hipp-glaeser-bei-spar',
      source: 'Der Standard',
      summary: 'Spar Österreich hat vorsorglich sein gesamtes Hipp-Sortiment zurückgerufen, nachdem in einem Glas der Sorte Karotte mit Kartoffel Rattengift nachgewiesen wurde.',
      content_quality: 'medium',
    });
    const tagesschau = makeArticle({
      title: 'Rattengift in Babynahrung in Österreich entdeckt',
      link: 'https://www.tagesschau.de/ausland/europa/oesterreich-hipp-erpressung-100.html',
      source: 'Tagesschau',
      summary: 'Ein Kunde entdeckte in Österreich ein Glas Babynahrung von Hipp, das mit Rattengift versetzt war. Die österreichische Gesundheitsagentur vermutet einen Erpressungsversuch gegen Hipp, der daraufhin betroffene Produkte zurückrief.',
      content_quality: 'medium',
    });
    const unrelated = makeArticle({
      title: 'Iran hat neues Luftabwehrsystem eingesetzt',
      link: 'https://example.com/iran',
      summary: 'Iranische Streitkräfte meldeten den Einsatz eines neuen Abwehrsystems gegen US-Kampfjets.',
    });
    const data = wrapInData([derStandard, tagesschau, unrelated]);
    const result = deduplicateArticles(data);
    const articles = result.categories['test'].articles;
    expect(articles).toHaveLength(2);
    // Longer summary (Tagesschau) should win the tie-breaker
    const kept = articles.find((a) => a.title.includes('Rattengift'));
    expect(kept?.source).toBe('Tagesschau');
  });

  it('does not merge unrelated articles that share a single common token', () => {
    const a = makeArticle({
      title: 'Neue Ransomware-Variante entdeckt',
      link: 'https://example.com/ransomware-a',
      summary: 'Sicherheitsforscher identifizieren eine bisher unbekannte Malware-Familie.',
    });
    const b = makeArticle({
      title: 'Ransomware-Angriff auf Krankenhaus',
      link: 'https://example.com/ransomware-b',
      summary: 'Ein Klinikum in Deutschland wurde Opfer eines Cyberangriffs.',
    });
    const data = wrapInData([a, b]);
    const result = deduplicateArticles(data);
    // Only "ransomware" overlaps as strong token — needs >=2 to merge
    expect(result.categories['test'].articles).toHaveLength(2);
  });
});
