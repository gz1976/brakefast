import { describe, it, expect } from 'vitest';
import { hexToRgb, contrastRatio } from './contrast';

describe('contrast helper', () => {
  it('parses 6-digit hex with or without leading #', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('throws on malformed hex input', () => {
    expect(() => hexToRgb('#fff')).toThrow();
    expect(() => hexToRgb('not-a-color')).toThrow();
  });

  it('returns 21 for pure black on pure white (WCAG max)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric: contrastRatio(a, b) === contrastRatio(b, a)', () => {
    const ab = contrastRatio('#15140f', '#faf7f0');
    const ba = contrastRatio('#faf7f0', '#15140f');
    expect(ab).toBeCloseTo(ba, 6);
  });

  // A11Y-02 — Phase 4 acceptance gate for body contrast.
  it('Newsprint ink #15140f on paper #faf7f0 meets WCAG AA body (>= 4.5)', () => {
    const ratio = contrastRatio('#15140f', '#faf7f0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('Masthead red #8a1a1a on paper #faf7f0 meets WCAG AA (>= 4.5)', () => {
    const ratio = contrastRatio('#8a1a1a', '#faf7f0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
