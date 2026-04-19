/**
 * WCAG 2.1 contrast-ratio helpers.
 * Self-contained — no external color library needed.
 * See https://www.w3.org/TR/WCAG21/#contrast-minimum
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a 6-digit hex color (with or without leading #) into an RGB object.
 * Throws if the input is not a valid 6-digit hex triplet.
 */
export function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`hexToRgb expected 6-digit hex, got "${hex}"`);
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Linearise one sRGB channel per WCAG 2.1 §Relative luminance.
 * Input: 0-255 integer; output: 0..1 linear value.
 */
function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Compute the WCAG relative luminance for an RGB triplet.
 * Returns a value in [0, 1] where 0 is black and 1 is white.
 */
export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/**
 * WCAG contrast ratio between two hex colors.
 * Result is in [1, 21] where 21 = black-on-white maximum contrast.
 * AA body text requires >= 4.5:1; AA large / AAA body >= 3:1 / >= 7:1.
 */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const [lmax, lmin] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lmax + 0.05) / (lmin + 0.05);
}
