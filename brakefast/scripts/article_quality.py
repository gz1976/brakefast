#!/usr/bin/env python3
"""Quality scoring helpers for BrakeFast article briefings."""

from __future__ import annotations

import re

BAD_IMAGE_PATTERNS = (
    r"static\.wikia\.nocookie",
    r"chatgpt",
    r"screenshot",
    r"placeholder",
    r"kein(?:%20|-)?titel",
    r"avatar",
    r"favicon",
    r"icon[-_]?\d",
    r"pixel\.gif",
    r"spacer\.gif",
    # Tracking-pixel "1x1" must sit immediately before the file extension —
    # otherwise legitimate asset names with size hints (e.g. Google's
    # "Group_Icons_1x1.max-1440x810.png") get rejected as fake.
    r"(?:^|[/_-])1x1\.(?:gif|png|jpe?g|webp)(?:[?#]|$)",
    r"blank\.(gif|png|jpg)",
    r"by-4\.0\.png",
    r"arxiv-logo",
    r"generic-github-.*logo",
    r"/icons?/",
    r"/logo",
    r"gravatar\.com",
    r"feeds\.feedburner",
    r"/embed/",
)

LOW_CONFIDENCE_IMAGE_PATTERNS = (
    r"wikipedia\.org",
    r"wikimedia\.org",
    r"upload\.wikimedia",
)


def is_valid_image_url(url: str) -> bool:
    if not url:
        return False
    if url.startswith("/images/") and len(url) > 10:
        return True
    if len(url) < 30:
        return False
    if not url.startswith("http") and not url.startswith("/"):
        return False
    if any(re.search(pattern, url, re.IGNORECASE) for pattern in BAD_IMAGE_PATTERNS):
        return False
    return True


def score_image_candidate(url: str, source: str = "") -> float:
    if not is_valid_image_url(url):
        return 0.0

    score = 0.55
    source_lower = (source or "").lower()
    if source_lower == "meta":
        score = 0.92
    elif source_lower == "jsonld":
        score = 0.9
    elif source_lower == "article":
        score = 0.82
    elif source_lower == "feed":
        score = 0.48

    if any(re.search(pattern, url, re.IGNORECASE) for pattern in LOW_CONFIDENCE_IMAGE_PATTERNS):
        score -= 0.4
    if url.startswith("/images/"):
        score = max(score, 0.75)
    if "logo" in url.lower():
        score -= 0.2
    return max(0.0, min(score, 1.0))


def score_summary(summary: str, full_text: str, used_llm: bool = False) -> float:
    text = (summary or "").strip()
    if not text:
        return 0.0

    words = len(text.split())
    if words < 18:
        return 0.2
    if words < 35:
        score = 0.45
    elif words < 70:
        score = 0.7
    else:
        score = 0.82

    if used_llm:
        score += 0.08
    if len((full_text or "").split()) < 120:
        score -= 0.1
    if text.endswith("...") or text.endswith("…"):
        score -= 0.12
    return max(0.0, min(score, 1.0))


def classify_content_quality(
    content_extracted: bool,
    summary_quality_score: float,
    image_quality_score: float,
) -> str:
    if content_extracted and summary_quality_score >= 0.75 and image_quality_score >= 0.7:
        return "high"
    if content_extracted and summary_quality_score >= 0.5:
        return "medium"
    return "low"
