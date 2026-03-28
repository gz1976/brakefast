import { describe, it, expect } from 'vitest';
import {
  smartTruncate,
  smartTruncateHtml,
  getArticleTeaser,
  getArticleBody,
  getReadingTime,
  formatHeadline,
  sanitizeHtml,
  translateWeather,
  formatDate,
  to24h,
} from './textUtils';

function createArticle(overrides?: Record<string, unknown>) {
  return {
    title: 'Test',
    link: 'https://example.com',
    description: 'Desc',
    date: '2026-03-27',
    source: 'Test',
    ...overrides,
  };
}

describe('smartTruncate', () => {
  it('returns short text unchanged when under maxLength', () => {
    expect(smartTruncate('Short text.', 100)).toBe('Short text.');
  });

  it('returns empty string unchanged', () => {
    expect(smartTruncate('', 100)).toBe('');
  });

  it('cuts at last sentence boundary within maxLength', () => {
    const text = 'First sentence. Second sentence. Third sentence here.';
    const result = smartTruncate(text, 35);
    // Should cut after "Second sentence." (32 chars) which is within 35
    expect(result).toBe('First sentence. Second sentence.');
  });

  it('falls back to word boundary with ellipsis when no sentence boundary found', () => {
    const text = 'This is a very long single sentence without any punctuation that goes on and on and on forever';
    const result = smartTruncate(text, 40);
    expect(result).toContain('\u2026');
    expect(result.length).toBeLessThanOrEqual(42); // 40 + space + ellipsis
    expect(result).not.toMatch(/\w\u2026/); // Should not cut mid-word
  });

  it('handles text exactly at maxLength', () => {
    const text = 'Exact length.';
    expect(smartTruncate(text, text.length)).toBe(text);
  });
});

describe('smartTruncateHtml', () => {
  it('strips HTML tags before truncating', () => {
    const html = '<p>Hello <strong>world</strong>. This is a test.</p>';
    const result = smartTruncateHtml(html, 20);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('truncates the plain text result', () => {
    const html = '<p>First sentence. Second sentence. Third sentence.</p>';
    const result = smartTruncateHtml(html, 30);
    expect(result.length).toBeLessThanOrEqual(32);
  });
});

describe('getArticleTeaser', () => {
  it('returns briefing_blurb when present', () => {
    const article = createArticle({ briefing_blurb: 'Blurb text', dek: 'Dek', description: 'Desc' });
    expect(getArticleTeaser(article)).toBe('Blurb text');
  });

  it('returns dek when no briefing_blurb', () => {
    const article = createArticle({ dek: 'Dek text', description: 'Desc' });
    expect(getArticleTeaser(article)).toBe('Dek text');
  });

  it('falls back to summary when no briefing_blurb or dek', () => {
    const article = createArticle({ summary: 'Summary text' });
    expect(getArticleTeaser(article)).toBe('Summary text');
  });

  it('falls back to description as last resort', () => {
    const article = createArticle({ description: 'Description text' });
    expect(getArticleTeaser(article)).toBe('Description text');
  });

  it('returns empty string for undefined article', () => {
    expect(getArticleTeaser(undefined)).toBe('');
  });

  it('skips empty/whitespace fields', () => {
    const article = createArticle({ briefing_blurb: '  ', dek: '', description: 'Valid' });
    expect(getArticleTeaser(article)).toBe('Valid');
  });
});

describe('getArticleBody', () => {
  it('returns summary when present', () => {
    const article = createArticle({ summary: 'Full summary', description: 'Desc' });
    expect(getArticleBody(article)).toBe('Full summary');
  });

  it('falls back to briefing_blurb', () => {
    const article = createArticle({ briefing_blurb: 'Blurb body' });
    expect(getArticleBody(article)).toBe('Blurb body');
  });

  it('falls back to description as last resort', () => {
    const article = createArticle({ description: 'Desc body' });
    expect(getArticleBody(article)).toBe('Desc body');
  });

  it('returns empty string for undefined article', () => {
    expect(getArticleBody(undefined)).toBe('');
  });
});

describe('getReadingTime', () => {
  it('returns null for undefined text', () => {
    expect(getReadingTime(undefined)).toBeNull();
  });

  it('returns null for short text (fewer than 20 words)', () => {
    expect(getReadingTime('short')).toBeNull();
  });

  it('returns provided minutes when given', () => {
    const longText = 'word '.repeat(400);
    expect(getReadingTime(longText, 5)).toBe(5);
  });

  it('calculates ~2 minutes for 400 words at 200 wpm', () => {
    const text = 'word '.repeat(400);
    expect(getReadingTime(text)).toBe(2);
  });

  it('returns at least 1 minute for short-but-meaningful text', () => {
    const text = 'word '.repeat(25);
    expect(getReadingTime(text)).toBe(1);
  });

  it('rounds up to next minute', () => {
    // 250 words = 1.25 min -> ceil to 2
    const text = 'word '.repeat(250);
    expect(getReadingTime(text)).toBe(2);
  });
});

describe('formatHeadline', () => {
  it('returns pipe-delimited topics joined with |', () => {
    const result = formatHeadline('Topic A | Topic B | Topic C');
    expect(result).toBe('Topic A | Topic B | Topic C');
  });

  it('limits to maxTopics complete topics', () => {
    const result = formatHeadline('A | B | C | D | E', 120, 3);
    expect(result).toBe('A | B | C');
  });

  it('falls back to smartTruncate for non-piped headline', () => {
    const result = formatHeadline('A plain headline without pipes', 20);
    expect(result.length).toBeLessThanOrEqual(22); // 20 + possible ellipsis
  });

  it('returns empty/falsy input unchanged', () => {
    expect(formatHeadline('')).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('keeps safe tags (strong, em, br, a)', () => {
    const html = '<strong>Bold</strong> <em>italic</em> <br> <a href="#">link</a>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('strips unsafe tags', () => {
    const html = '<script>alert("xss")</script><div>content</div>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<div');
    expect(result).toContain('content');
  });

  it('returns falsy input unchanged', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('translateWeather', () => {
  it('translates known condition to German', () => {
    expect(translateWeather('Partly Cloudy')).toBe('Teilweise bewölkt');
  });

  it('translates case-insensitively', () => {
    expect(translateWeather('CLEAR')).toBe('Klar');
  });

  it('returns unknown conditions unchanged', () => {
    expect(translateWeather('unknown-condition')).toBe('unknown-condition');
  });

  it('returns falsy input unchanged', () => {
    expect(translateWeather('')).toBe('');
  });
});

describe('formatDate', () => {
  it('formats ISO date to German locale', () => {
    const result = formatDate('2026-03-27');
    expect(result).toContain('27');
    expect(result).toContain('2026');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns original string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('to24h', () => {
  it('converts AM time to 24h', () => {
    expect(to24h('06:27 AM')).toBe('06:27');
  });

  it('converts PM time to 24h', () => {
    expect(to24h('05:56 PM')).toBe('17:56');
  });

  it('converts 12:00 AM to 00:00', () => {
    expect(to24h('12:00 AM')).toBe('00:00');
  });

  it('converts 12:00 PM to 12:00', () => {
    expect(to24h('12:00 PM')).toBe('12:00');
  });

  it('returns already-24h time unchanged', () => {
    expect(to24h('14:30')).toBe('14:30');
  });

  it('returns falsy input unchanged', () => {
    expect(to24h('')).toBe('');
  });
});
