/**
 * Image validation and fallback utilities for BrakeFast
 *
 * Filters out low-quality images (Wikipedia screenshots, app screenshots,
 * generic placeholders) and provides gradient fallbacks.
 */

// Patterns that indicate a low-quality or irrelevant image
const BAD_IMAGE_PATTERNS = [
  /static\.wikia\.nocookie/i,
  /chatgpt/i,
  /placeholder/i,
  /kein(?:%20|-)?titel/i,
  /favicon/i,
  /icon[-_]?\d/i,
  /pixel\.gif/i,
  /spacer\.gif/i,
  // Tracking-pixel "1x1" must sit immediately before extension (no real-size
  // suffix between). Avoids false positives like "Group_Icons_1x1.max-1440x810.png".
  /(?:^|[/_-])1x1\.(?:gif|png|jpe?g|webp)(?:[?#]|$)/i,
  /blank\.(gif|png|jpg)/i,
  /by-4\.0\.png/i,
  /arxiv-logo/i,
  /\/icons?\//i,
  /gravatar\.com/i,
  /feeds\.feedburner/i,
  /\/embed\//i,  // YouTube embeds are not images
  /\/wikipedia\/commons\/.*Flag_of_/i,  // Flag images used as hero
  /\/default-image/i,
  /\/logo[-_]/i,
];

// Minimum dimensions we'd want for display images
const MIN_IMAGE_URL_LENGTH = 20;

export function isValidArticleImage(url: string | undefined): boolean {
  if (!url) return false;

  // Local images served via nginx /images/ have shorter paths — allow them
  if (url.startsWith('/images/') && url.length > 10) return true;

  if (url.length < MIN_IMAGE_URL_LENGTH) return false;

  // Must start with http or / (relative path for generated images)
  if (!url.startsWith('http') && !url.startsWith('/')) return false;

  // Check against bad patterns
  for (const pattern of BAD_IMAGE_PATTERNS) {
    if (pattern.test(url)) return false;
  }

  // Detect broken double-domain URLs (e.g. teslamag.de/teslamag.de/)
  if (url.startsWith('http')) {
    try {
      const u = new URL(url);
      if (u.pathname.includes(u.hostname)) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/** Minimum pixel width for lead/hero images */
const MIN_LEAD_IMAGE_WIDTH = 600;
/** Minimum pixel width for secondary thumbnails */
const MIN_THUMB_IMAGE_WIDTH = 120;

/**
 * Extract pixel width from image URL if encoded (e.g. Wikipedia thumbs: /300px-..., resize params: ?w=200)
 * Returns null if width cannot be determined from URL alone.
 */
function extractWidthFromUrl(url: string): number | null {
  // Wikipedia thumbnail pattern: /123px-Filename
  const wikiMatch = url.match(/\/(\d+)px-/);
  if (wikiMatch) return parseInt(wikiMatch[1], 10);

  // Common resize params: ?w=300, ?width=300, &w=300
  const paramMatch = url.match(/[?&](?:w|width)=(\d+)/);
  if (paramMatch) return parseInt(paramMatch[1], 10);

  // imgproxy/DerStandard pattern: rs:fill:WIDTH:HEIGHT or rs:fit:WIDTH:HEIGHT
  // Note: DerStandard CDN only serves rs:fill:150:0 — treat these as valid
  // despite the 150px label (actual image quality is acceptable)
  const rsMatch = url.match(/rs:(?:fill|fit):(\d+):/);
  if (rsMatch) {
    const rsWidth = parseInt(rsMatch[1], 10);
    if (url.includes('i.ds.at') || url.includes('derstandard')) return null; // skip width check for DS
    return rsWidth;
  }

  // Generic /NUMBERx or xNUMBER dimension patterns in path
  const dimMatch = url.match(/\/(\d{2,4})x\d{0,4}\//);
  if (dimMatch) return parseInt(dimMatch[1], 10);

  return null;
}

/** Check if image URL meets minimum width for a lead/hero image (>=600px) */
export function isValidLeadImage(url: string | undefined): boolean {
  if (!isValidArticleImage(url)) return false;
  const w = extractWidthFromUrl(url!);
  return w === null || w >= MIN_LEAD_IMAGE_WIDTH;
}

/** Check if image URL meets minimum width for a thumbnail (>=120px) */
export function isValidThumbImage(url: string | undefined): boolean {
  if (!isValidArticleImage(url)) return false;
  const w = extractWidthFromUrl(url!);
  return w === null || w >= MIN_THUMB_IMAGE_WIDTH;
}

// Category-based gradient backgrounds for articles without good images
const CATEGORY_GRADIENTS: Record<string, string> = {
  ai: 'linear-gradient(135deg, #1a1030 0%, #2d1b69 50%, #4a1d96 100%)',
  security: 'linear-gradient(135deg, #1a0f0a 0%, #6b2d10 50%, #8b3a15 100%)',
  tech: 'linear-gradient(135deg, #0a1a2a 0%, #0d3b66 50%, #1a5276 100%)',
  world: 'linear-gradient(135deg, #0a1a1a 0%, #0d4040 50%, #156060 100%)',
  local: 'linear-gradient(135deg, #1a140a 0%, #5a3a1a 50%, #7a5530 100%)',
  dev: 'linear-gradient(135deg, #0a1a2a 0%, #10404a 50%, #155a6a 100%)',
  ev: 'linear-gradient(135deg, #0a1a12 0%, #1a5a30 50%, #2d8a4a 100%)',
  ki: 'linear-gradient(135deg, #1a0a2a 0%, #3b1069 50%, #5a1d96 100%)',
  knapp: 'linear-gradient(135deg, #1a150a 0%, #6b4d10 50%, #8b6a15 100%)',
};

export function getCategoryGradient(catId: string): string {
  return CATEGORY_GRADIENTS[catId] || CATEGORY_GRADIENTS.tech;
}

// Category icons for placeholder display
const CATEGORY_ICONS: Record<string, string> = {
  ai: '🤖',
  security: '🔒',
  tech: '⚡',
  world: '🌍',
  local: '🏔️',
  dev: '💻',
  ev: '🔋',
  ki: '🧠',
  knapp: '🏭',
};

export function getCategoryIcon(catId: string): string {
  return CATEGORY_ICONS[catId] || '📰';
}
