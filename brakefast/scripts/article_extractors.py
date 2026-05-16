#!/usr/bin/env python3
"""Utilities for extracting article metadata, text, and images."""

from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import trafilatura

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
DEFAULT_TIMEOUT = 12
MAX_HTML_BYTES = 700_000

META_PATTERNS = {
    "canonical": ["canonical", "og:url"],
    "title": ["og:title", "twitter:title"],
    "author": ["author", "article:author", "parsely-author"],
    "description": ["description", "og:description", "twitter:description"],
    "published_at": [
        "article:published_time",
        "pubdate",
        "publish-date",
        "date",
        "dc.date",
    ],
    "images": ["og:image", "twitter:image", "twitter:image:src"],
}

BOILERPLATE_PATTERNS = (
    "cookie",
    "privacy policy",
    "sign up",
    "newsletter",
    "accept all",
    "advertisement",
    "enable javascript",
    "terms of service",
    "create account",
    "all rights reserved",
    "skip to content",
    "subscribe",
    "exklusiv für digitalabonnent",
    "datenschutzinformation von kleine zeitung",
)

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
TAG_RE = re.compile(r"<[^>]+>")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
SCRIPT_STYLE_RE = re.compile(
    r"<(script|style|noscript|svg|iframe)[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
BLOCK_STRIP_RE = re.compile(
    r"<(nav|footer|header|aside|form)[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
JSON_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
META_RE = re.compile(r"<meta\b([^>]+)>", re.IGNORECASE)
ATTR_RE = re.compile(r'([a-zA-Z_:][a-zA-Z0-9_:\-]*)\s*=\s*["\'](.*?)["\']')
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
ARTICLE_BLOCK_RE = re.compile(r"<article\b[^>]*>(.*?)</article>", re.IGNORECASE | re.DOTALL)
MAIN_BLOCK_RE = re.compile(r"<main\b[^>]*>(.*?)</main>", re.IGNORECASE | re.DOTALL)
BODY_BLOCK_RE = re.compile(r"<body\b[^>]*>(.*?)</body>", re.IGNORECASE | re.DOTALL)
IMG_RE = re.compile(r"<img\b([^>]+)>", re.IGNORECASE)
P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
REL_CANONICAL_RE = re.compile(r"<link\b([^>]+)>", re.IGNORECASE)
ARXIV_ABSTRACT_RE = re.compile(
    r'<blockquote[^>]*class="[^"]*abstract[^"]*"[^>]*>(.*?)</blockquote>',
    re.IGNORECASE | re.DOTALL,
)


def fetch_html(url: str, timeout: int = DEFAULT_TIMEOUT, max_bytes: int = MAX_HTML_BYTES) -> str:
    if not url:
        return ""

    # Phase 04.02: domain-allowlisted proxy dispatch (per D-05/D-06).
    # Returns None for non-allowlisted hosts → fall through to urllib.
    # Returns html string for allowlisted hosts.
    # Raises RuntimeError on proxy failure / block_mode → caller's
    # try/except (article_briefing_engine.py:515, resolve_images.py:251)
    # drops the article. Do NOT wrap in try/except here — swallowing the
    # RuntimeError would re-introduce the empty-body confabulation trap
    # that spec §"Failure Handling" explicitly rejects.
    try:
        from scraper_proxy import dispatch_fetch
    except ImportError:
        dispatch_fetch = None  # defensive: phase pre-deploy / module missing
    if dispatch_fetch is not None:
        proxy_html = dispatch_fetch(url)
        if proxy_html is not None:
            # Respect the existing byte cap — DataDome-bypass HTML can
            # exceed 700 KB on hard-fetched pages.
            return proxy_html[:max_bytes]

    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(max_bytes).decode("utf-8", errors="ignore")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def clean_html_text(value: str) -> str:
    if not value:
        return ""
    text = html.unescape(value)
    text = COMMENT_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    return normalize_whitespace(text)


def smart_truncate(text: str, max_length: int = 420) -> str:
    text = normalize_whitespace(text)
    if len(text) <= max_length:
        return text
    region = text[:max_length]
    for idx in range(len(region) - 1, int(max_length * 0.35), -1):
        if region[idx] in ".!?":
            return region[: idx + 1].strip()
    cut = region.rfind(" ")
    if cut > int(max_length * 0.35):
        return region[:cut].strip() + " …"
    return region.strip() + " …"


def split_sentences(text: str) -> list[str]:
    clean = normalize_whitespace(text)
    if not clean:
        return []
    return [part.strip() for part in SENTENCE_SPLIT_RE.split(clean) if part.strip()]


def _parse_tag_attrs(raw_attrs: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for key, value in ATTR_RE.findall(raw_attrs):
        attrs[key.lower()] = html.unescape(value.strip())
    return attrs


def _extract_meta_values(html_text: str, names: list[str]) -> list[str]:
    values: list[str] = []
    names_lower = {name.lower() for name in names}
    for raw_attrs in META_RE.findall(html_text):
        attrs = _parse_tag_attrs(raw_attrs)
        tag_name = (attrs.get("property") or attrs.get("name") or "").lower()
        if tag_name in names_lower:
            content = attrs.get("content", "").strip()
            if content:
                values.append(content)
    return values


def _extract_canonical_link(html_text: str, base_url: str) -> str:
    for raw_attrs in REL_CANONICAL_RE.findall(html_text):
        attrs = _parse_tag_attrs(raw_attrs)
        rel = attrs.get("rel", "").lower()
        href = attrs.get("href", "").strip()
        if "canonical" in rel and href:
            return urllib.parse.urljoin(base_url, href)
    meta_values = _extract_meta_values(html_text, META_PATTERNS["canonical"])
    if meta_values:
        return urllib.parse.urljoin(base_url, meta_values[0])
    return base_url


def _extract_title(html_text: str, fallback_title: str) -> str:
    candidates = _extract_meta_values(html_text, META_PATTERNS["title"])
    if candidates:
        return clean_html_text(candidates[0])
    title_match = TITLE_RE.search(html_text)
    if title_match:
        title = clean_html_text(title_match.group(1))
        if title:
            return title
    return fallback_title


def _extract_author(html_text: str) -> str:
    values = _extract_meta_values(html_text, META_PATTERNS["author"])
    return clean_html_text(values[0]) if values else ""


def _extract_meta_description(html_text: str) -> str:
    values = _extract_meta_values(html_text, META_PATTERNS["description"])
    return clean_html_text(values[0]) if values else ""


def _extract_published_at(html_text: str) -> str:
    values = _extract_meta_values(html_text, META_PATTERNS["published_at"])
    return values[0].strip() if values else ""


def _load_json_ld_blocks(html_text: str) -> list[Any]:
    blocks: list[Any] = []
    for raw_block in JSON_LD_RE.findall(html_text):
        payload = raw_block.strip()
        if not payload:
            continue
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            blocks.extend(data)
        else:
            blocks.append(data)
    return blocks


def _walk_json_ld(value: Any) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    if isinstance(value, dict):
        collected.append(value)
        for nested in value.values():
            collected.extend(_walk_json_ld(nested))
    elif isinstance(value, list):
        for item in value:
            collected.extend(_walk_json_ld(item))
    return collected


def _extract_json_ld_text(blocks: list[Any]) -> str:
    for block in blocks:
        for node in _walk_json_ld(block):
            article_body = node.get("articleBody")
            if isinstance(article_body, str):
                cleaned = normalize_whitespace(article_body)
                if len(cleaned) > 500:
                    return cleaned
    return ""


def _extract_json_ld_author(blocks: list[Any]) -> str:
    for block in blocks:
        for node in _walk_json_ld(block):
            author = node.get("author")
            if isinstance(author, dict):
                name = author.get("name")
                if isinstance(name, str) and name.strip():
                    return normalize_whitespace(name)
            if isinstance(author, list):
                names = [
                    normalize_whitespace(item.get("name", ""))
                    for item in author
                    if isinstance(item, dict) and item.get("name")
                ]
                if names:
                    return ", ".join(names)
    return ""


def _extract_json_ld_published(blocks: list[Any]) -> str:
    for block in blocks:
        for node in _walk_json_ld(block):
            value = node.get("datePublished")
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _extract_json_ld_access(blocks: list[Any]) -> bool | None:
    for block in blocks:
        for node in _walk_json_ld(block):
            value = node.get("isAccessibleForFree")
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"true", "false"}:
                    return lowered == "true"
    return None


def _extract_json_ld_alt_headline(blocks: list[Any]) -> str:
    for block in blocks:
        for node in _walk_json_ld(block):
            value = node.get("alternativeHeadline")
            if isinstance(value, str) and value.strip():
                return normalize_whitespace(value)
    return ""


def _extract_json_ld_images(blocks: list[Any], base_url: str) -> list[str]:
    urls: list[str] = []
    for block in blocks:
        for node in _walk_json_ld(block):
            image_value = node.get("image")
            candidates: list[str] = []
            if isinstance(image_value, str):
                candidates = [image_value]
            elif isinstance(image_value, list):
                candidates = [item for item in image_value if isinstance(item, str)]
            elif isinstance(image_value, dict):
                url = image_value.get("url")
                if isinstance(url, str):
                    candidates = [url]
            for candidate in candidates:
                resolved = urllib.parse.urljoin(base_url, candidate.strip())
                if resolved and resolved not in urls:
                    urls.append(resolved)
    return urls


def _strip_non_content(html_text: str) -> str:
    cleaned = COMMENT_RE.sub(" ", html_text)
    cleaned = SCRIPT_STYLE_RE.sub(" ", cleaned)
    cleaned = BLOCK_STRIP_RE.sub(" ", cleaned)
    return cleaned


def _pick_content_region(html_text: str) -> str:
    candidates: list[tuple[int, str]] = []
    for pattern in (ARTICLE_BLOCK_RE, MAIN_BLOCK_RE):
        for match in pattern.finditer(html_text):
            block = match.group(1)
            if len(block) < 400:
                continue
            score = block.lower().count("<p") * 500 + len(block)
            candidates.append((score, block))
    if candidates:
        return max(candidates, key=lambda item: item[0])[1]
    body_match = BODY_BLOCK_RE.search(html_text)
    if body_match and len(body_match.group(1)) > 400:
        return body_match.group(1)
    return html_text


def _paragraphs_from_html(html_text: str) -> list[str]:
    paragraphs: list[str] = []
    for raw_paragraph in P_RE.findall(html_text):
        text = clean_html_text(raw_paragraph)
        if len(text) < 40:
            continue
        lowered = text.lower()
        if any(pattern in lowered for pattern in BOILERPLATE_PATTERNS):
            continue
        paragraphs.append(text)
    return paragraphs


def _extract_arxiv_abstract(html_text: str) -> str:
    match = ARXIV_ABSTRACT_RE.search(html_text)
    if not match:
        return ""
    text = clean_html_text(match.group(1))
    text = re.sub(r"^Abstract:\s*", "", text, flags=re.IGNORECASE).strip()
    return text


def extract_main_text(html_text: str) -> str:
    arxiv_abstract = _extract_arxiv_abstract(html_text)
    if arxiv_abstract:
        return arxiv_abstract

    stripped = _strip_non_content(html_text)
    region = _pick_content_region(stripped)
    paragraphs = _paragraphs_from_html(region)
    if not paragraphs:
        paragraphs = _paragraphs_from_html(stripped)
    text = "\n\n".join(paragraphs[:18])
    return normalize_whitespace(text)


def extract_main_text_trafilatura(html_text: str, url: str = "") -> str:
    """Extract article text using trafilatura library."""
    result = trafilatura.extract(
        html_text,
        url=url,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
    )
    return normalize_whitespace(result) if result else ""


def extract_main_text_dual(html_text: str, url: str = "") -> str:
    """Run both extractors, return the higher-quality result.

    Per D-05: both extractors run on every URL. Compare by word count
    as primary quality signal. Prefer trafilatura when it extracts
    substantially more content or when regex extraction is very short.
    """
    regex_result = extract_main_text(html_text)
    traf_result = extract_main_text_trafilatura(html_text, url)

    regex_words = len(regex_result.split()) if regex_result else 0
    traf_words = len(traf_result.split()) if traf_result else 0

    # Prefer trafilatura when it extracts substantially more content
    # or when regex extraction is very short (likely failed)
    if traf_words > regex_words * 1.2 or regex_words < 80:
        return traf_result if traf_words >= 80 else regex_result
    return regex_result


def extract_image_candidates(html_text: str, page_url: str, feed_image: str = "") -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_candidate(url: str, source: str) -> None:
        resolved = urllib.parse.urljoin(page_url, (url or "").strip())
        if not resolved or resolved in seen:
            return
        seen.add(resolved)
        candidates.append({"url": resolved, "source": source})

    for meta_image in _extract_meta_values(html_text, META_PATTERNS["images"]):
        add_candidate(meta_image, "meta")

    json_ld_blocks = _load_json_ld_blocks(html_text)
    for json_ld_image in _extract_json_ld_images(json_ld_blocks, page_url):
        add_candidate(json_ld_image, "jsonld")

    region = _pick_content_region(html_text)
    for raw_attrs in IMG_RE.findall(region):
        attrs = _parse_tag_attrs(raw_attrs)
        src = attrs.get("src") or attrs.get("data-src") or attrs.get("srcset", "").split(" ")[0]
        if src:
            add_candidate(src, "article")
        if len(candidates) >= 5:
            break

    if feed_image:
        add_candidate(feed_image, "feed")

    return candidates


TRACKING_PARAMS = frozenset([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "source", "fbclid", "gclid", "mc_cid", "mc_eid",
])


def normalize_url(raw_url: str) -> str:
    """Normalize a URL for deduplication: lowercase hostname, strip tracking params, remove trailing slash.

    Mirrors the frontend normalizeUrl() in src/utils/urlUtils.ts for consistent dedup (D-08).
    """
    try:
        parsed = urlparse(raw_url)
        hostname = (parsed.hostname or "").lower()
        path = parsed.path.rstrip("/") or "/"
        params = parse_qs(parsed.query, keep_blank_values=True)
        filtered = {k: v for k, v in params.items() if k not in TRACKING_PARAMS}
        query = urlencode(sorted(filtered.items()), doseq=True) if filtered else ""
        return urlunparse((parsed.scheme, hostname, path, "", query, ""))
    except Exception:
        return raw_url.lower().rstrip("/")


def extract_article_payload(url: str, fallback_title: str = "", feed_image: str = "") -> dict[str, Any]:
    html_text = fetch_html(url)
    json_ld_blocks = _load_json_ld_blocks(html_text)

    author = _extract_author(html_text) or _extract_json_ld_author(json_ld_blocks)
    published_at = _extract_published_at(html_text) or _extract_json_ld_published(json_ld_blocks)
    full_text = _extract_json_ld_text(json_ld_blocks) or extract_main_text_dual(html_text, url)
    alt_headline = _extract_json_ld_alt_headline(json_ld_blocks)

    return {
        "html": html_text,
        "canonical_url": _extract_canonical_link(html_text, url),
        "headline": _extract_title(html_text, fallback_title),
        "alternative_headline": alt_headline,
        "author": author,
        "meta_description": _extract_meta_description(html_text),
        "published_at": published_at,
        "is_accessible_for_free": _extract_json_ld_access(json_ld_blocks),
        "full_text": full_text,
        "image_candidates": extract_image_candidates(html_text, url, feed_image=feed_image),
    }
