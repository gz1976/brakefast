#!/usr/bin/env python3
"""Resolve BrakeFast images with a prioritized source chain and provider fallbacks."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from article_extractors import extract_article_payload
from article_quality import is_valid_image_url, score_image_candidate
from curate import build_image_search_candidates, localize_remote_image, search_wikimedia_image
from openclaw_runtime import OUTPUT_DIR, ProviderConfig, get_image_provider_chain

DEFAULT_OUTPUT_DIR = "/data/brakefast-public/images"
IMAGE_WIDTH = 800
IMAGE_HEIGHT = 500
MAX_RETRIES = 2
RETRY_DELAY = 5
STATE_FILE = OUTPUT_DIR / "image-provider-state.json"
EDITORIAL_DIR = Path(__file__).resolve().parent.parent / "assets" / "editorial"

CATEGORY_STYLES = {
    "ai": "futuristic digital art, neural networks, AI technology, blue and purple tones",
    "security": "cybersecurity, digital locks, shields, dark dramatic lighting, amber and red tones",
    "tech": "modern technology, devices, code, clean design, cyan and blue tones",
    "world": "global politics, world map, diplomacy, blue and teal tones",
    "local": "Austrian landscape, Styria, green hills, alpine scenery, green tones",
    "ev": "electric vehicles, charging stations, green energy, modern cars, green tones",
    "ki_modelle": "AI models, large language models, neural architecture, purple and blue tones",
    "dev_digest": "software development, code editor, GitHub, terminal, cyan and dark tones",
}


def slugify(value: str, max_len: int = 80) -> str:
    normalized = re.sub(r"[^a-z0-9äöüß]+", "-", (value or "").lower())
    normalized = normalized.strip("-")
    return normalized[:max_len] or "item"


def make_filename(title: str, suffix: str = "") -> str:
    title_hash = hashlib.md5(title.encode()).hexdigest()[:8]
    clean = re.sub(r"[^\w\s-]", "", title.lower())
    clean = re.sub(r"\s+", "-", clean.strip())[:40]
    return f"{clean}-{title_hash}{suffix}.jpg"


def save_image(image_bytes: bytes, output_dir: str, filename: str) -> None:
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "wb") as handle:
        handle.write(image_bytes)


def generate_prompt(title: str, category: str = "", content: str = "") -> str:
    clean_title = re.sub(r"[^\w\s\-äöüÄÖÜß]", "", title)
    style = CATEGORY_STYLES.get(category, "modern editorial illustration, professional magazine style")
    return (
        f"Editorial magazine cover illustration for article: {clean_title}. "
        f"Style: {style}. "
        f"Context hint: {content[:180]}. "
        "Professional, high-quality, no text, no watermarks, no logos, cinematic lighting, 16:10 aspect ratio."
    )


class ProviderState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: dict[str, Any] = {"providers": {}}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.data = {"providers": {}}

    def save(self) -> None:
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _entry(self, provider: ProviderConfig) -> dict[str, Any]:
        providers = self.data.setdefault("providers", {})
        return providers.setdefault(provider.name, {})

    def is_blocked(self, provider: ProviderConfig) -> bool:
        entry = self._entry(provider)
        blocked_until = entry.get("blocked_until")
        blocked_month = entry.get("blocked_month")
        now = datetime.now(timezone.utc)
        if blocked_until:
            try:
                until = datetime.fromisoformat(blocked_until)
                if until.tzinfo is None:
                    until = until.replace(tzinfo=timezone.utc)
                if until > now:
                    return True
            except ValueError:
                return False
        if blocked_month and blocked_month == now.strftime("%Y-%m"):
            return True
        return False

    def block(self, provider: ProviderConfig, *, status_code: int, reason: str) -> None:
        entry = self._entry(provider)
        now = datetime.now(timezone.utc)
        entry.update({
            "last_failure_at": now.isoformat(),
            "reason": reason,
            "status_code": status_code,
        })
        if status_code == 402:
            entry["blocked_month"] = now.strftime("%Y-%m")
            entry.pop("blocked_until", None)
        elif status_code == 429:
            entry["blocked_until"] = (now + timedelta(hours=1)).isoformat()
            entry.pop("blocked_month", None)
        else:
            entry["blocked_until"] = (now + timedelta(minutes=30)).isoformat()
            entry.pop("blocked_month", None)


class ImageProviderClient:
    def __init__(self, providers: list[ProviderConfig] | None = None, state: ProviderState | None = None) -> None:
        self.providers = providers if providers is not None else get_image_provider_chain()
        self.state = state if state is not None else ProviderState(STATE_FILE)

    @property
    def enabled(self) -> bool:
        return bool(self.providers)

    def describe_chain(self) -> str:
        if not self.providers:
            return "source-only"
        return " -> ".join(provider.label for provider in self.providers)

    def generate(self, *, title: str, category: str, content: str, output_dir: str, base_url: str) -> str:
        prompt = generate_prompt(title, category, content)
        for provider in self.providers:
            if self.state.is_blocked(provider):
                print(f"  Skipping blocked provider: {provider.label}", file=sys.stderr)
                continue
            image_bytes = self._call_provider(provider, prompt)
            if image_bytes:
                filename = make_filename(f"{category}-{title}")
                save_image(image_bytes, output_dir, filename)
                self.state.save()
                return f"{base_url}/{filename}"
        self.state.save()
        return ""

    def _call_provider(self, provider: ProviderConfig, prompt: str) -> bytes | None:
        if provider.provider != "huggingface":
            print(f"  WARN: Unsupported image provider {provider.provider or provider.name}", file=sys.stderr)
            return None

        import json as _json
        import urllib.request as _urlreq
        import urllib.error as _urlerr

        endpoint = f"{provider.base_url}/{provider.model}"
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json",
            **provider.headers,
        }
        payload = _json.dumps({
            "inputs": prompt,
            "parameters": {
                "width": IMAGE_WIDTH,
                "height": IMAGE_HEIGHT,
            },
        }).encode("utf-8")

        for attempt in range(MAX_RETRIES + 1):
            request = _urlreq.Request(endpoint, data=payload, headers=headers, method="POST")
            try:
                with _urlreq.urlopen(request, timeout=60) as response:
                    body = response.read()
                    content_type = response.headers.get("Content-Type", "")
                    if "image" in content_type:
                        return body
                    print(f"  WARN: Unexpected content type: {content_type}", file=sys.stderr)
                    return None
            except _urlerr.HTTPError as exc:
                body = exc.read()[:240].decode("utf-8", errors="ignore")
                if exc.code == 503 and attempt < MAX_RETRIES:
                    wait = RETRY_DELAY * (attempt + 1)
                    print(f"  Provider loading, waiting {wait}s... (attempt {attempt + 1}/{MAX_RETRIES + 1})", file=sys.stderr)
                    time.sleep(wait)
                    continue
                if exc.code in (402, 429):
                    self.state.block(provider, status_code=exc.code, reason=body)
                print(f"  ERROR: {provider.name} returned {exc.code}: {body[:200]}", file=sys.stderr)
                return None
            except Exception as exc:
                print(f"  ERROR: Image provider request failed: {exc}", file=sys.stderr)
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                    continue
                return None
        return None


def materialize_editorial_fallback(title: str, category: str, public_output_dir: str) -> str:
    if not EDITORIAL_DIR.exists():
        return ""
    candidates = [
        EDITORIAL_DIR / f"{slugify(title)}.png",
        EDITORIAL_DIR / f"{slugify(title)}.jpg",
        EDITORIAL_DIR / f"{slugify(category)}.png",
        EDITORIAL_DIR / f"{slugify(category)}.jpg",
        EDITORIAL_DIR / "default.png",
        EDITORIAL_DIR / "default.jpg",
    ]
    for candidate in candidates:
        if candidate.exists():
            target_dir = Path(public_output_dir) / "editorial"
            target_dir.mkdir(parents=True, exist_ok=True)
            target_file = target_dir / candidate.name
            if not target_file.exists():
                shutil.copy2(candidate, target_file)
            return f"/images/editorial/{candidate.name}"
    return ""


def _best_candidate_url(item: dict[str, Any], category: str) -> str:
    current = item.get("best_image") or item.get("image") or ""
    if is_valid_image_url(current):
        return current

    source_url = (
        item.get("canonical_url")
        or item.get("source_url")
        or item.get("link")
        or ""
    ).strip()
    title = item.get("title") or item.get("headline") or ""

    if source_url.startswith("http"):
        try:
            extracted = extract_article_payload(
                source_url,
                fallback_title=title,
                feed_image=current,
            )
        except Exception as exc:
            print(f"  WARN: Image extraction failed for {source_url}: {exc}", file=sys.stderr)
            extracted = {}

        candidates = extracted.get("image_candidates", [])
        best_url = ""
        best_score = 0.0
        for candidate in candidates:
            url = candidate.get("url", "")
            score = score_image_candidate(url, candidate.get("source", ""))
            if score > best_score:
                best_score = score
                best_url = url
        # Feed-sourced images score 0.48; admit them rather than leaving the
        # article image-less. Logo/low-confidence candidates stay below 0.45
        # after their penalties.
        if best_score >= 0.45 and best_url:
            return best_url

    if title:
        for search_title in build_image_search_candidates(title):
            fallback = search_wikimedia_image(search_title)
            if is_valid_image_url(fallback):
                return fallback

    return ""


def resolve_image(
    item: dict[str, Any],
    *,
    category: str,
    provider_client: ImageProviderClient,
    output_dir: str,
    base_url: str,
) -> bool:
    if is_valid_image_url(item.get("image")):
        return False

    resolved = _best_candidate_url(item, category)
    if resolved:
        if resolved.startswith("http"):
            item["image"] = localize_remote_image(resolved, item.get("title") or item.get("headline") or category, bucket="resolved")
        else:
            item["image"] = resolved
        return True

    editorial = materialize_editorial_fallback(
        item.get("title") or item.get("headline") or category,
        category,
        output_dir,
    )
    if editorial:
        item["image"] = editorial
        return True

    generated = provider_client.generate(
        title=item.get("title") or item.get("headline") or category,
        category=category,
        content=item.get("summary") or item.get("content") or item.get("description") or "",
        output_dir=output_dir,
        base_url=base_url,
    )
    if generated:
        item["image"] = generated
        return True
    return False


def iter_items(data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    items: list[tuple[str, dict[str, Any]]] = []
    for category_id, category in (data.get("categories") or {}).items():
        articles = category.get("articles", []) if isinstance(category, dict) else []
        for article in articles:
            if isinstance(article, dict):
                items.append((category_id, article))
    for section_name, category in (("ki_modelle", "ki_modelle"), ("dev_digest", "dev_digest")):
        for item in (data.get(section_name) or {}).values():
            if isinstance(item, dict):
                items.append((category, item))
    return items


def main() -> int:
    input_file = sys.argv[1] if len(sys.argv) > 1 else ""
    output_dir = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT_DIR

    if not input_file:
        print("Usage: resolve_images.py <input.json> [output_dir]", file=sys.stderr)
        return 1
    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}", file=sys.stderr)
        return 1

    with open(input_file, encoding="utf-8") as handle:
        data = json.load(handle)

    today = datetime.now().strftime("%Y/%m/%d")
    day_output_dir = os.path.join(output_dir, today)
    base_url = f"/images/{today}"
    provider_client = ImageProviderClient()

    print(f"Image resolution chain: source -> og/meta -> wikimedia -> editorial -> {provider_client.describe_chain()}", file=sys.stderr)

    generated_or_resolved = 0
    skipped = 0
    for category, item in iter_items(data):
        if is_valid_image_url(item.get("image")):
            skipped += 1
            continue
        title = (item.get("title") or item.get("headline") or category)[:60]
        print(f"  Resolving image for {category}: {title}...", file=sys.stderr)
        if resolve_image(item, category=category, provider_client=provider_client, output_dir=day_output_dir, base_url=base_url):
            generated_or_resolved += 1

    with open(input_file, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)

    provider_client.state.save()
    print(
        f"Image resolution complete: {generated_or_resolved} resolved, {skipped} already had images",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
