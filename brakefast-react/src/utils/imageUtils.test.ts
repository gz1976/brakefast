import { describe, it, expect } from 'vitest';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from './imageUtils';

describe('isValidArticleImage', () => {
  it('returns false for undefined', () => {
    expect(isValidArticleImage(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidArticleImage('')).toBe(false);
  });

  it('returns false for very short URL (below MIN_IMAGE_URL_LENGTH)', () => {
    expect(isValidArticleImage('https://x.co/i.jpg')).toBe(false);
  });

  it('returns true for a valid image URL of reasonable length', () => {
    expect(isValidArticleImage('https://example.com/a-reasonable-length-image-url.jpg')).toBe(true);
  });

  it('returns false for wikia URLs', () => {
    expect(isValidArticleImage('https://static.wikia.nocookie.net/some-image.png')).toBe(false);
  });

  it('allows screenshot URLs because the generic filter was too aggressive', () => {
    expect(isValidArticleImage('https://example.com/images/screenshot-2026-03-27.png')).toBe(true);
  });

  it('returns false for placeholder URLs', () => {
    expect(isValidArticleImage('https://example.com/images/placeholder-image.jpg')).toBe(false);
  });

  it('allows non-flag Wikimedia Commons images', () => {
    expect(isValidArticleImage('https://upload.wikimedia.org/wikipedia/commons/image.jpg')).toBe(true);
  });

  it('returns false for favicon URLs', () => {
    expect(isValidArticleImage('https://example.com/assets/favicon-32x32.png')).toBe(false);
  });

  it('returns false for logo URLs', () => {
    expect(isValidArticleImage('https://example.com/assets/logo-company-name.png')).toBe(false);
  });

  it('returns true for local /images/ paths', () => {
    expect(isValidArticleImage('/images/article-hero.jpg')).toBe(true);
  });

  it('returns false for broken double-domain URLs', () => {
    expect(isValidArticleImage('https://teslamag.de/teslamag.de/image.jpg')).toBe(false);
  });

  it('returns false for gravatar URLs', () => {
    expect(isValidArticleImage('https://gravatar.com/avatar/some-hash-value-here')).toBe(false);
  });
});

describe('getCategoryGradient', () => {
  it('returns the AI gradient for "ai" category', () => {
    const gradient = getCategoryGradient('ai');
    expect(gradient).toContain('linear-gradient');
    expect(gradient).toContain('#1a1030');
  });

  it('returns the tech gradient as default for unknown category', () => {
    const techGradient = getCategoryGradient('tech');
    const unknownGradient = getCategoryGradient('nonexistent');
    expect(unknownGradient).toBe(techGradient);
  });

  it('returns distinct gradients for different categories', () => {
    expect(getCategoryGradient('ai')).not.toBe(getCategoryGradient('security'));
  });
});

describe('getCategoryIcon', () => {
  it('returns the robot icon for "ai" category', () => {
    expect(getCategoryIcon('ai')).toBe('\u{1F916}'); // robot emoji
  });

  it('returns newspaper icon as default for unknown category', () => {
    expect(getCategoryIcon('nonexistent')).toBe('\u{1F4F0}'); // newspaper emoji
  });

  it('returns lock icon for security category', () => {
    expect(getCategoryIcon('security')).toBe('\u{1F512}'); // lock emoji
  });
});
