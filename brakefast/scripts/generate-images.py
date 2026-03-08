#!/usr/bin/env python3
"""Generate missing article images for BrakeFast using HuggingFace Inference API.

Reads curated-articles.json, finds articles/items without images,
generates images via FLUX.1-schnell, saves them locally, and updates the JSON.

Usage:
    python3 generate-images.py [input.json] [output_dir]

Requires:
    - HF_TOKEN environment variable or /data/.openclaw/workspace/brakefast/config/hf_token.txt
    - requests library
"""
import json
import sys
import os
import re
import hashlib
import time
from datetime import datetime

# --- Configuration ---
DEFAULT_INPUT = None  # Set by brakefast-daily.sh
DEFAULT_OUTPUT_DIR = '/data/brakefast-public/images'
HF_MODEL = 'black-forest-labs/FLUX.1-schnell'
HF_API_URL = f'https://router.huggingface.co/hf-inference/models/{HF_MODEL}'
IMAGE_WIDTH = 800
IMAGE_HEIGHT = 500
MAX_RETRIES = 2
RETRY_DELAY = 5  # seconds

# Patterns for invalid/missing images (same as frontend imageUtils.ts)
BAD_IMAGE_PATTERNS = [
    r'static\.wikia\.nocookie',
    r'chatgpt',
    r'screenshot',
    r'placeholder',
    r'avatar',
    r'favicon',
    r'icon[-_]?\d',
    r'pixel\.gif',
    r'spacer\.gif',
    r'1x1',
    r'blank\.(gif|png|jpg)',
    r'gravatar\.com',
    r'feeds\.feedburner',
    r'/embed/',
]

# Category-specific style hints for better image generation
CATEGORY_STYLES = {
    'ai': 'futuristic digital art, neural networks, AI technology, blue and purple tones',
    'security': 'cybersecurity, digital locks, shields, dark dramatic lighting, amber and red tones',
    'tech': 'modern technology, devices, code, clean design, cyan and blue tones',
    'world': 'global politics, world map, diplomacy, blue and teal tones',
    'local': 'Austrian landscape, Styria, green hills, alpine scenery, green tones',
    'ev': 'electric vehicles, charging stations, green energy, modern cars, green tones',
    'ki_modelle': 'AI models, large language models, neural architecture, purple and blue tones',
    'dev_digest': 'software development, code editor, GitHub, terminal, cyan and dark tones',
}


def get_hf_token():
    """Get HuggingFace API token from env or file."""
    token = os.environ.get('HF_TOKEN')
    if token:
        return token.strip()

    # Also check relative to the script's directory (../../config/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    brakefast_dir = os.path.dirname(script_dir)
    token_files = [
        os.path.join(brakefast_dir, 'config', 'hf_token.txt'),
        '/data/.openclaw/workspace/brakefast/config/hf_token.txt',
        os.path.expanduser('~/.huggingface/token'),
        os.path.expanduser('~/.cache/huggingface/token'),
    ]
    for path in token_files:
        if os.path.exists(path):
            with open(path) as f:
                token = f.read().strip()
                if token:
                    return token
    return None


def is_valid_image(url):
    """Check if image URL is valid (mirrors frontend logic)."""
    if not url:
        return False
    # Local images served via nginx /images/ have shorter paths — allow them
    if url.startswith('/images/') and len(url) > 10:
        return True
    if len(url) < 30:
        return False
    if not url.startswith('http') and not url.startswith('/'):
        return False
    for pattern in BAD_IMAGE_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return False
    # Detect broken double-domain URLs (e.g. teslamag.de/teslamag.de/)
    if url.startswith('http'):
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            if parsed.hostname and parsed.hostname in parsed.path:
                return False
        except Exception:
            return False
    return True


def generate_prompt(title, category='', content=''):
    """Create an image generation prompt from article metadata."""
    # Extract key terms from title
    clean_title = re.sub(r'[^\w\s\-äöüÄÖÜß]', '', title)

    style = CATEGORY_STYLES.get(category, 'modern editorial illustration, professional magazine style')

    prompt = (
        f"Editorial magazine cover illustration for article: {clean_title}. "
        f"Style: {style}. "
        f"Professional, high-quality, no text, no watermarks, no logos, "
        f"cinematic lighting, 16:10 aspect ratio."
    )
    return prompt


def generate_image(prompt, hf_token, retries=MAX_RETRIES):
    """Generate an image via HuggingFace Inference API."""
    import requests

    headers = {"Authorization": f"Bearer {hf_token}"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "width": IMAGE_WIDTH,
            "height": IMAGE_HEIGHT,
        }
    }

    for attempt in range(retries + 1):
        try:
            response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=60)

            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'image' in content_type:
                    return response.content
                else:
                    print(f"  WARN: Unexpected content type: {content_type}", file=sys.stderr)
                    return None

            elif response.status_code == 503:
                # Model loading, retry
                wait = RETRY_DELAY * (attempt + 1)
                print(f"  Model loading, waiting {wait}s... (attempt {attempt+1}/{retries+1})", file=sys.stderr)
                time.sleep(wait)
                continue

            elif response.status_code == 429:
                # Rate limited
                wait = RETRY_DELAY * (attempt + 1) * 2
                print(f"  Rate limited, waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue

            else:
                print(f"  ERROR: HF API returned {response.status_code}: {response.text[:200]}", file=sys.stderr)
                return None

        except Exception as e:
            print(f"  ERROR: Request failed: {e}", file=sys.stderr)
            if attempt < retries:
                time.sleep(RETRY_DELAY)
                continue
            return None

    return None


def save_image(image_bytes, output_dir, filename):
    """Save image bytes to file, return relative URL path."""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    with open(filepath, 'wb') as f:
        f.write(image_bytes)
    return filepath


def make_filename(title, suffix=''):
    """Create a safe filename from article title."""
    # Create hash for uniqueness
    title_hash = hashlib.md5(title.encode()).hexdigest()[:8]
    # Clean title for filename
    clean = re.sub(r'[^\w\s-]', '', title.lower())
    clean = re.sub(r'\s+', '-', clean.strip())[:40]
    return f"{clean}-{title_hash}{suffix}.jpg"


def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else None
    output_dir = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT_DIR

    if not input_file:
        print("Usage: generate-images.py <input.json> [output_dir]", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    hf_token = get_hf_token()
    if not hf_token:
        print("WARN: No HuggingFace token found, skipping image generation", file=sys.stderr)
        print("Set HF_TOKEN env var or create /data/.openclaw/workspace/brakefast/config/hf_token.txt", file=sys.stderr)
        sys.exit(0)

    # Import requests here (after token check)
    try:
        import requests
    except ImportError:
        print("ERROR: requests library not installed. Run: pip3 install requests", file=sys.stderr)
        sys.exit(1)

    with open(input_file) as f:
        data = json.load(f)

    # Date-based subdirectory for images
    today = datetime.now().strftime('%Y/%m/%d')
    day_output_dir = os.path.join(output_dir, today)
    # Base URL for images (served by nginx)
    base_url = f"/images/{today}"

    generated_count = 0
    skipped_count = 0

    # --- Process category articles ---
    categories = data.get('categories', {})
    for cat_id, category in categories.items():
        articles = category.get('articles', [])
        for article in articles:
            if is_valid_image(article.get('image')):
                skipped_count += 1
                continue

            title = article.get('title', 'Untitled')
            print(f"  Generating image for: {title[:60]}...", file=sys.stderr)

            prompt = generate_prompt(title, cat_id, article.get('description', ''))
            image_bytes = generate_image(prompt, hf_token)

            if image_bytes:
                filename = make_filename(title)
                save_image(image_bytes, day_output_dir, filename)
                article['image'] = f"{base_url}/{filename}"
                generated_count += 1
                print(f"    ✓ Saved: {filename}", file=sys.stderr)
            else:
                print(f"    ✗ Failed to generate image", file=sys.stderr)

    # --- Process KI Modelle items ---
    ki_modelle = data.get('ki_modelle', {})
    for key in ['releases', 'benchmarks', 'pricing', 'tools']:
        item = ki_modelle.get(key)
        if not item:
            continue
        if is_valid_image(item.get('image')):
            skipped_count += 1
            continue

        title = item.get('title', key)
        print(f"  Generating image for KI Modelle/{key}: {title[:60]}...", file=sys.stderr)

        prompt = generate_prompt(title, 'ki_modelle', item.get('content', ''))
        image_bytes = generate_image(prompt, hf_token)

        if image_bytes:
            filename = make_filename(f"ki-{key}-{title}")
            save_image(image_bytes, day_output_dir, filename)
            item['image'] = f"{base_url}/{filename}"
            generated_count += 1
            print(f"    ✓ Saved: {filename}", file=sys.stderr)
        else:
            print(f"    ✗ Failed to generate image", file=sys.stderr)

    # --- Process Dev Digest items ---
    dev_digest = data.get('dev_digest', {})
    for key in ['github_trending', 'releases', 'hn_top', 'security_advisory']:
        item = dev_digest.get(key)
        if not item:
            continue
        if is_valid_image(item.get('image')):
            skipped_count += 1
            continue

        title = item.get('title', key)
        print(f"  Generating image for Dev Digest/{key}: {title[:60]}...", file=sys.stderr)

        prompt = generate_prompt(title, 'dev_digest', item.get('content', ''))
        image_bytes = generate_image(prompt, hf_token)

        if image_bytes:
            filename = make_filename(f"dev-{key}-{title}")
            save_image(image_bytes, day_output_dir, filename)
            item['image'] = f"{base_url}/{filename}"
            generated_count += 1
            print(f"    ✓ Saved: {filename}", file=sys.stderr)
        else:
            print(f"    ✗ Failed to generate image", file=sys.stderr)

    # --- Write updated JSON back ---
    with open(input_file, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Image generation complete: {generated_count} generated, {skipped_count} already had images", file=sys.stderr)


if __name__ == '__main__':
    main()
