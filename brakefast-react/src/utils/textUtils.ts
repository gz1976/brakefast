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

type ArticleTextFields = {
  briefing_blurb?: string;
  dek?: string;
  summary?: string;
  description?: string;
};

export function getArticleTeaser(article: ArticleTextFields | undefined): string {
  if (!article) return '';
  const candidates = [
    article.briefing_blurb,
    article.dek,
    article.summary,
    article.description,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim();
  }
  return '';
}

export function getArticleBody(article: ArticleTextFields | undefined): string {
  if (!article) return '';
  const candidates = [
    article.summary,
    article.briefing_blurb,
    article.dek,
    article.description,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim();
  }
  return '';
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
  // Trust a valid pipeline value even when only a short teaser is available.
  if (typeof providedMinutes === 'number' && Number.isFinite(providedMinutes) && providedMinutes > 0) {
    return providedMinutes;
  }

  const content = (text || '').trim();
  const words = content ? content.split(/\s+/).length : 0;

  // No meaningful content → hide reading time
  if (words < 20) return null;

  // Calculate: ceil(words / 200), minimum 1
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Translate common English weather condition strings to German.
 * Falls back to the original string if no translation is found.
 */
const WEATHER_DE: Record<string, string> = {
  'clear': 'Klar',
  'sunny': 'Sonnig',
  'partly cloudy': 'Teilweise bewölkt',
  'cloudy': 'Bewölkt',
  'overcast': 'Bedeckt',
  'mist': 'Neblig',
  'fog': 'Nebel',
  'patchy rain possible': 'Vereinzelt Regen möglich',
  'patchy rain nearby': 'Vereinzelt Regen in der Nähe',
  'patchy snow possible': 'Vereinzelt Schnee möglich',
  'patchy sleet possible': 'Vereinzelt Schneeregen möglich',
  'patchy freezing drizzle possible': 'Vereinzelt Gefrierender Nieselregen möglich',
  'thundery outbreaks possible': 'Vereinzelt Gewitter möglich',
  'blowing snow': 'Schneeverwehungen',
  'blizzard': 'Schneesturm',
  'freezing fog': 'Gefrierender Nebel',
  'freezing drizzle': 'Gefrierender Nieselregen',
  'heavy freezing drizzle': 'Starker gefrierender Nieselregen',
  'patchy light drizzle': 'Leichter Nieselregen',
  'light drizzle': 'Leichter Nieselregen',
  'light rain': 'Leichter Regen',
  'moderate rain at times': 'Zeitweise mäßiger Regen',
  'moderate rain': 'Mäßiger Regen',
  'heavy rain at times': 'Zeitweise starker Regen',
  'heavy rain': 'Starker Regen',
  'light freezing rain': 'Leichter gefrierender Regen',
  'moderate or heavy freezing rain': 'Mäßiger bis starker gefrierender Regen',
  'light sleet': 'Leichter Schneeregen',
  'moderate or heavy sleet': 'Mäßiger bis starker Schneeregen',
  'patchy light snow': 'Vereinzelt leichter Schnee',
  'light snow': 'Leichter Schneefall',
  'patchy moderate snow': 'Vereinzelt mäßiger Schnee',
  'moderate snow': 'Mäßiger Schneefall',
  'patchy heavy snow': 'Vereinzelt starker Schnee',
  'heavy snow': 'Starker Schneefall',
  'ice pellets': 'Eiskörner',
  'light rain shower': 'Leichter Regenschauer',
  'moderate or heavy rain shower': 'Mäßiger bis starker Regenschauer',
  'torrential rain shower': 'Wolkenbruch',
  'light sleet showers': 'Leichte Schneeregenschauer',
  'moderate or heavy sleet showers': 'Mäßige bis starke Schneeregenschauer',
  'light snow showers': 'Leichte Schneeschauer',
  'moderate or heavy snow showers': 'Mäßige bis starke Schneeschauer',
  'patchy light rain with thunder': 'Leichter Regen mit Donner',
  'moderate or heavy rain with thunder': 'Mäßiger bis starker Regen mit Gewitter',
  'patchy light snow with thunder': 'Leichter Schnee mit Donner',
  'moderate or heavy snow with thunder': 'Mäßiger bis starker Schnee mit Gewitter',
  'rain': 'Regen',
  'snow': 'Schnee',
  'drizzle': 'Nieselregen',
  'thunderstorm': 'Gewitter',
  'hail': 'Hagel',
  'sleet': 'Schneeregen',
  'wind': 'Windig',
};

/**
 * Format a pipe-separated headline so no topic is cut mid-word.
 * Shows at most maxTopics complete topics, joined by " | ".
 * If the raw string has no pipes, falls back to smartTruncate.
 */
export function formatHeadline(raw: string, maxChars = 120, maxTopics = 3): string {
  if (!raw) return raw;

  const parts = raw.split('|').map(p => p.trim()).filter(Boolean);

  // No pipe separators → use smartTruncate
  if (parts.length <= 1) return smartTruncate(raw, maxChars);

  // Take as many complete topics as fit within maxChars
  let result = '';
  let count = 0;
  for (const part of parts) {
    if (count >= maxTopics) break;
    const candidate = count === 0 ? part : `${result} | ${part}`;
    if (candidate.length > maxChars && count > 0) break;
    result = candidate;
    count++;
  }

  return result;
}

/**
 * Sanitize HTML by allowing only safe tags: <strong>, <em>, <br>, <a>.
 * Strips all other tags to prevent XSS from external content.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return html;
  return html.replace(/<\/?(?!(?:strong|em|br|a)\b)[a-z][^>]*>/gi, '');
}

export function translateWeather(condition: string): string {
  if (!condition) return condition;
  const key = condition.toLowerCase().trim();
  return WEATHER_DE[key] || condition;
}

/**
 * Format a date string (ISO or RFC) into a German locale format.
 * Example: "2026-03-08T19:59:25Z" → "8. März 2026, 19:59 Uhr"
 */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const date = d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time} Uhr`;
}

/**
 * Convert AM/PM time strings to 24h format.
 * Example: "06:27 AM" → "06:27", "05:56 PM" → "17:56"
 */
export function to24h(timeStr: string): string {
  if (!timeStr) return timeStr;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}
