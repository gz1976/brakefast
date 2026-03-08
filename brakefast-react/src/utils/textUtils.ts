/**
 * Truncate text at the last complete sentence boundary within maxLength.
 * Returns the original text if it's shorter than maxLength.
 * Appends " …" only if text was actually truncated.
 */
export function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;

  const region = text.slice(0, maxLength);

  // Find the last sentence-ending punctuation (.!?) followed by space or at region end
  let bestCut = -1;
  for (let i = region.length - 1; i > maxLength * 0.3; i--) {
    const ch = region[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = i + 1 < region.length ? region[i + 1] : ' ';
      if (next === ' ' || next === '\n' || i + 1 === region.length) {
        bestCut = i + 1;
        break;
      }
    }
  }

  if (bestCut > 0) {
    return text.slice(0, bestCut).trimEnd();
  }

  // Fallback: cut at last word boundary to avoid mid-word breaks
  const lastSpace = region.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.3) {
    return region.slice(0, lastSpace).trimEnd() + ' \u2026';
  }

  return region.trimEnd() + ' \u2026';
}

/**
 * Strip HTML tags and truncate at sentence boundary.
 * Used for KI-Modelle and Dev-Digest cards that have HTML content.
 */
export function smartTruncateHtml(html: string, maxLength: number): string {
  const plain = html.replace(/<[^>]+>/g, '');
  return smartTruncate(plain, maxLength);
}

/**
 * Calculate reading time for an article.
 * Returns null if text has fewer than 20 words (no meaningful content).
 * Uses reading_time_minutes from data if available, otherwise calculates
 * from word count at 200 words/minute, rounded up, minimum 1.
 */
export function getReadingTime(
  text: string | undefined,
  providedMinutes?: number,
): number | null {
  const content = (text || '').trim();
  const words = content ? content.split(/\s+/).length : 0;

  // No meaningful content → hide reading time
  if (words < 20) return null;

  // Trust pipeline value if provided
  if (providedMinutes && providedMinutes > 0) return providedMinutes;

  // Calculate: ceil(words / 200), minimum 1
  return Math.max(1, Math.ceil(words / 200));
}
