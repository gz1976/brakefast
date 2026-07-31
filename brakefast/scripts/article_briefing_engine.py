#!/usr/bin/env python3
"""Build enriched article briefings from raw feed data."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

from article_extractors import extract_article_payload, normalize_url, smart_truncate, split_sentences
from article_quality import classify_content_quality, score_image_candidate, score_summary
from openclaw_client import OpenClawChatClient

SCRIPT_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = BRAKEFAST_DIR / "output"
DEFAULT_INPUT = OUTPUT_DIR / "raw-articles.json"
DEFAULT_OUTPUT = OUTPUT_DIR / "enriched-articles.json"
DEFAULT_CACHE = OUTPUT_DIR / "article-briefing-cache.json"
CACHE_VERSION = 7

enrichment_logger = logging.getLogger("brakefast.enrichment")
enrichment_logger.setLevel(logging.DEBUG)
_handler = RotatingFileHandler(OUTPUT_DIR / "enrichment.log", maxBytes=5_000_000, backupCount=3)
_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
enrichment_logger.addHandler(_handler)

CATEGORY_RELEVANCE = {
    "ai": "Relevanz: zeigt neue AI-Faehigkeiten, Tools oder Modelle, die fuer Automatisierung und Produktivitaet wichtig sein koennen.",
    "security": "Relevanz: kann direkte Folgen fuer Infrastruktur, Zugriffe oder Patch-Prioritaeten haben.",
    "tech": "Relevanz: betrifft Entwicklungs-Stack, Plattformen oder Tools mit moeglichem Einfluss auf Ottos Setup.",
    "world": "Relevanz: liefert geopolitischen Kontext, der Maerkte, Energie oder Technologiepolitik beeinflussen kann.",
    "local": "Relevanz: betrifft Steiermark, Oesterreich oder Themen mit unmittelbarem Alltagsbezug.",
    "ev": "Relevanz: betrifft Elektromobilitaet, Ladenetz, Tesla-Umfeld oder Infrastruktur-Trends.",
}


class ArticleCache:
    def __init__(self, cache_path: Path) -> None:
        self.cache_path = cache_path
        self._data: dict[str, dict[str, Any]] = {}
        if cache_path.exists():
            try:
                self._data = json.loads(cache_path.read_text())
            except json.JSONDecodeError:
                self._data = {}

    def _make_key(self, url: str) -> str:
        return hashlib.sha256(url.encode("utf-8")).hexdigest()

    def get(self, url: str) -> dict[str, Any] | None:
        if not url:
            return None
        return self._data.get(self._make_key(url))

    def set(self, url: str, payload: dict[str, Any]) -> None:
        if not url:
            return
        self._data[self._make_key(url)] = payload

    def save(self) -> None:
        self.cache_path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2))


class BriefingBuilder:
    PROMO_PATTERNS = (
        "subscribe",
        "newsletter",
        "learn more",
        "your browser does not support",
        "copy link",
        "share",
        "related stories",
        "get more stories",
        "register by",
        "fundraising",
        "actively scaling",
    )

    STOPWORDS = {
        "der", "die", "das", "und", "oder", "mit", "nach", "fuer", "from", "with",
        "about", "this", "that", "into", "einer", "einem", "einen", "eines", "einem",
        "new", "latest", "how", "what", "when", "why", "just", "über", "under",
        "they", "them", "their", "über", "eine", "einen", "mehr", "less", "than",
    }

    def __init__(self) -> None:
        self.client = OpenClawChatClient()
        self.enabled = self.client.enabled

    def mode_description(self) -> str:
        return self.client.describe_chain()

    def build(
        self,
        *,
        article: dict[str, Any],
        category_id: str,
        full_text: str,
        fallback_text: str,
    ) -> tuple[dict[str, Any], bool]:
        if self.enabled:
            text_for_llm = full_text or fallback_text
            if text_for_llm:
                llm_payload = self._build_with_llm(article, category_id, text_for_llm)
                if llm_payload:
                    return llm_payload, True
        # LLM failed or unavailable -- still produce heuristic but mark it
        heuristic = self._build_heuristic(article, category_id, full_text or fallback_text)
        return heuristic, False

    def _build_with_llm(
        self,
        article: dict[str, Any],
        category_id: str,
        full_text: str,
    ) -> dict[str, Any] | None:
        instructions = (
            "Du schreibst fuer BrakeFast, eine persoenliche Morgenzeitung. "
            "Erzeuge ein kompaktes JSON in deutscher Sprache. "
            "Antworte nur mit JSON und benutze exakt diese Felder: "
            "dek, summary, bullet_points, why_it_matters, topics. "
            "dek: 1-2 Saetze, sachlich, ohne Marketing. "
            "summary: 4-5 informative Saetze, kein Copy-Paste der Ueberschrift. "
            "bullet_points: genau 3 knappe Punkte mit echtem Informationswert. "
            "why_it_matters: 1 Satz, konkret fuer Gerhard/Otto, ohne Floskeln. "
            "topics: 3-5 kurze Schlagworte. "
            "Wenn der Artikel wenig Substanz hat, benenne die Grenzen klar statt zu halluzinieren."
        )
        response = self.client.complete_json(
            messages=[
                {"role": "system", "content": instructions},
                {
                    "role": "user",
                    "content": (
                        f"Titel: {article.get('title', '')}\n"
                        f"Quelle: {article.get('source', '')}\n"
                        f"Kategorie: {category_id}\n"
                        f"{CATEGORY_RELEVANCE.get(category_id, '')}\n\n"
                        f"Artikeltext:\n{full_text[:8000]}"
                    ),
                },
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout=40,
        )
        if response is None:
            enrichment_logger.warning("LLM returned None for '%s'. Last error: %s",
                                      article.get("title", "?")[:60], self.client.last_error)
            return None

        enrichment_logger.debug("LLM response for '%s' via %s: %.2000s",
                                article.get("title", "?")[:60], response.provider_name, response.content)

        try:
            parsed = self._parse_llm_json(response.content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            enrichment_logger.error("LLM parse failed for '%s': %s. Raw: %.2000s",
                                    article.get("title", "?")[:60], exc, response.content)
            return None

        if not parsed.get("summary") or len((parsed.get("summary") or "").split()) < 15:
            enrichment_logger.warning("LLM summary missing or too short for '%s' (%d words)",
                                      article.get("title", "?")[:60],
                                      len((parsed.get("summary") or "").split()))
            return None

        summary = self._cleanup_text(parsed.get("summary", ""))
        dek = self._cleanup_text(parsed.get("dek", ""))
        why_it_matters = self._cleanup_text(parsed.get("why_it_matters", ""))
        bullet_points = [
            smart_truncate(self._cleanup_text(point), 180)
            for point in parsed.get("bullet_points", [])[:3]
            if isinstance(point, str) and self._cleanup_text(point)
        ]

        return {
            "dek": smart_truncate(dek, 200),
            "summary": smart_truncate(summary, 720),
            "bullet_points": bullet_points,
            "why_it_matters": smart_truncate(why_it_matters, 180),
            "topics": [
                smart_truncate(self._cleanup_text(topic), 40)
                for topic in parsed.get("topics", [])[:5]
                if isinstance(topic, str) and self._cleanup_text(topic)
            ],
        }

    def _build_heuristic(
        self,
        article: dict[str, Any],
        category_id: str,
        text: str,
    ) -> dict[str, Any]:
        cleaned_text = self._cleanup_text(text)
        sentences = self._prepare_sentences(cleaned_text)
        if not sentences:
            fallback = article.get("description") or article.get("title") or ""
            fallback = self._cleanup_text(fallback)
            sentences = self._prepare_sentences(fallback) or [smart_truncate(fallback, 240)]

        summary_sentences = self._select_summary_sentences(
            article.get("title", ""),
            sentences,
            max_sentences=4,
        )
        summary = smart_truncate(" ".join(summary_sentences), 720)
        dek = self._build_dek(article.get("title", ""), summary_sentences)
        bullet_points = self._build_bullets(summary_sentences)
        topics = self._extract_topics(article.get("title", ""), article.get("source", ""), summary)
        why_it_matters = self._build_relevance_sentence(category_id, article, summary)

        return {
            "dek": dek,
            "summary": summary,
            "bullet_points": bullet_points,
            "why_it_matters": why_it_matters,
            "topics": topics,
        }

    def _cleanup_text(self, text: str) -> str:
        cleaned = (text or "").strip()
        if not cleaned:
            return ""
        cleaned = cleaned.replace("\\textbf{", "").replace("\\textit{", "")
        cleaned = cleaned.replace("\\emph{", "").replace("\\", "")
        cleaned = cleaned.replace("{", "").replace("}", "")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _parse_llm_json(self, content: Any) -> dict[str, Any]:
        if isinstance(content, list):
            text = "".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ).strip()
        elif isinstance(content, str):
            text = content.strip()
        else:
            raise TypeError("Unexpected LLM content type")

        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        return json.loads(text)

    def _prepare_sentences(self, text: str) -> list[str]:
        prepared: list[str] = []
        seen: set[str] = set()
        for raw_sentence in split_sentences(text):
            sentence = self._cleanup_text(raw_sentence)
            lowered = sentence.lower()
            if len(sentence.split()) < 7:
                continue
            if any(pattern in lowered for pattern in self.PROMO_PATTERNS):
                continue
            if lowered in seen:
                continue
            prepared.append(sentence)
            seen.add(lowered)
        return prepared

    def _title_keywords(self, title: str) -> list[str]:
        words = []
        for raw in (title or "").replace(":", " ").replace("-", " ").split():
            token = raw.strip(",.()[]{}!?\"' ")
            if len(token) < 4:
                continue
            if token.lower() in self.STOPWORDS:
                continue
            if token not in words:
                words.append(token)
            if len(words) >= 4:
                break
        return words

    def _score_sentence(self, sentence: str, index: int, keywords: list[str]) -> float:
        lowered = sentence.lower()
        score = 0.0
        if index == 0:
            score += 0.45
        elif index < 3:
            score += 0.28
        elif index < 6:
            score += 0.14

        length = len(sentence)
        if 90 <= length <= 240:
            score += 0.22
        elif 55 <= length <= 320:
            score += 0.12

        keyword_hits = sum(1 for keyword in keywords if keyword.lower() in lowered)
        score += min(keyword_hits * 0.12, 0.36)

        if re.search(r"\b\d+(\.\d+)?\b", sentence):
            score += 0.06
        if any(token in lowered for token in ("however", "but", "doch", "allerdings", "because", "therefore", "daher")):
            score += 0.05
        if any(pattern in lowered for pattern in self.PROMO_PATTERNS):
            score -= 0.45
        if lowered.startswith(("note:", "listen to article", "copy link")):
            score -= 0.3
        return score

    def _select_summary_sentences(self, title: str, sentences: list[str], max_sentences: int) -> list[str]:
        keywords = self._title_keywords(title)
        ranked = [
            (self._score_sentence(sentence, index, keywords), index, sentence)
            for index, sentence in enumerate(sentences[:14])
        ]
        chosen = sorted(
            [item for item in ranked if item[0] > 0][: max_sentences + 2],
            key=lambda item: (-item[0], item[1]),
        )[:max_sentences]
        if not chosen:
            return sentences[:max_sentences]
        return [sentence for _, _, sentence in sorted(chosen, key=lambda item: item[1])]

    def _build_dek(self, title: str, summary_sentences: list[str]) -> str:
        title_lower = (title or "").strip().lower()
        for sentence in summary_sentences:
            if sentence.lower() != title_lower:
                return smart_truncate(sentence, 200)
        return smart_truncate(summary_sentences[0], 200) if summary_sentences else smart_truncate(title, 200)

    def _build_bullets(self, summary_sentences: list[str]) -> list[str]:
        bullets: list[str] = []
        for sentence in summary_sentences[:3]:
            clean = smart_truncate(sentence, 170)
            if clean and clean not in bullets:
                bullets.append(clean)
        return bullets

    def _extract_topics(self, title: str, source: str, summary: str) -> list[str]:
        words = self._title_keywords(title)
        for raw in (summary or "").replace(":", " ").replace("-", " ").split():
            token = raw.strip(",.()[]{}!?\"' ")
            if len(token) < 5:
                continue
            if token.lower() in self.STOPWORDS:
                continue
            if token not in words:
                words.append(token)
            if len(words) >= 4:
                break
        if source and source not in words:
            words.append(source)
        return words[:5]

    def _build_relevance_sentence(self, category_id: str, article: dict[str, Any], summary: str) -> str:
        text = f"{article.get('title', '')} {summary}".lower()
        if category_id == "security":
            if any(token in text for token in ("vulnerability", "cve", "patch", "exploit", "malware", "ransomware")):
                return "Wichtig fuer Otto, weil das direkte Folgen fuer Risiko, Patch-Prioritaeten oder Angriffsvektoren haben kann."
            return "Wichtig fuer Otto, weil Security-Themen schnell operative Auswirkungen auf Infrastruktur und Zugriffe haben koennen."
        if category_id == "ai":
            if any(token in text for token in ("model", "copilot", "agent", "search", "workflow", "automation")):
                return "Wichtig fuer Otto, weil sich daraus neue AI-Workflows, Produktivitaetsgewinne oder bessere Agentenprozesse ableiten lassen."
            return "Wichtig fuer Otto, weil AI-Themen direkten Einfluss auf Automatisierung und Tool-Auswahl haben koennen."
        if category_id == "tech":
            return "Wichtig fuer Otto, weil das Entwicklungswerkzeuge, Plattformen oder den technischen Stack konkret beeinflussen kann."
        if category_id == "ev":
            return "Wichtig fuer Otto, weil das Elektromobilitaet, Ladeinfrastruktur oder Tesla-nahe Entwicklungen beruehrt."
        if category_id == "local":
            return "Wichtig fuer Otto, weil das unmittelbaren Oesterreich- oder Steiermark-Bezug hat."
        if category_id == "world":
            return "Relevant fuer Otto, weil geopolitische Entwicklungen oft direkte Folgen fuer Energie, Maerkte und Technologiepolitik haben."
        title = article.get("title", "").strip()
        if title:
            return smart_truncate(f"Relevant fuer Otto, weil {title.lower()} strategische oder praktische Folgen haben kann.", 180)
        return smart_truncate(f"Relevant fuer Otto, weil {summary.lower()}", 180)


class ArticleBriefingEngine:
    def __init__(self, cache: ArticleCache) -> None:
        self.cache = cache
        self.builder = BriefingBuilder()

    def enrich(self, raw_payload: dict[str, Any], checkpoint_path: Path | None = None) -> dict[str, Any]:
        categories = raw_payload.get("categories", {})
        result_categories: dict[str, Any] = {}
        total_articles = 0

        for category_id, category_data in categories.items():
            articles = category_data.get("articles", [])
            enriched_articles = []
            for idx, article in enumerate(articles):
                enriched_articles.append(self._enrich_article(article, category_id))
                if checkpoint_path is not None:
                    self._write_checkpoint(
                        raw_payload=raw_payload,
                        result_categories=result_categories,
                        current_category_id=category_id,
                        current_category_data=category_data,
                        current_articles=enriched_articles,
                        remaining_articles=articles[idx + 1:],
                        output_path=checkpoint_path,
                    )
            enriched_articles = self._deduplicate_articles(enriched_articles)
            total_articles += len(enriched_articles)
            result_categories[category_id] = {
                **category_data,
                "articles": enriched_articles,
            }

        return {
            "generated": raw_payload.get("generated"),
            "totalArticles": total_articles,
            "categories": result_categories,
        }

    def _write_checkpoint(
        self,
        *,
        raw_payload: dict[str, Any],
        result_categories: dict[str, Any],
        current_category_id: str,
        current_category_data: dict[str, Any],
        current_articles: list[dict[str, Any]],
        remaining_articles: list[dict[str, Any]],
        output_path: Path,
    ) -> None:
        categories = raw_payload.get("categories", {})
        checkpoint_categories: dict[str, Any] = {}

        for category_id, category_data in categories.items():
            if category_id in result_categories:
                checkpoint_categories[category_id] = result_categories[category_id]
            elif category_id == current_category_id:
                checkpoint_categories[category_id] = {
                    **current_category_data,
                    "articles": self._deduplicate_articles(current_articles + remaining_articles),
                }
            else:
                checkpoint_categories[category_id] = category_data

        total_articles = 0
        for category_data in checkpoint_categories.values():
            if isinstance(category_data, dict):
                total_articles += len(category_data.get("articles", []))

        payload = {
            "generated": raw_payload.get("generated"),
            "totalArticles": total_articles,
            "categories": checkpoint_categories,
        }
        tmp_path = output_path.with_name(f"{output_path.name}.tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        tmp_path.replace(output_path)
        self.cache.save()

    def _deduplicate_articles(self, articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Remove duplicate articles by normalized URL, keeping the higher-quality version (D-09)."""
        quality_rank = {"high": 3, "medium": 2, "low": 1}
        seen: dict[str, dict[str, Any]] = {}
        result: list[dict[str, Any]] = []
        for article in articles:
            url = (article.get("source_url") or article.get("link") or "").strip()
            key = normalize_url(url)
            existing = seen.get(key)
            if existing is None:
                seen[key] = article
                result.append(article)
            else:
                existing_rank = quality_rank.get(existing.get("content_quality", ""), 0)
                new_rank = quality_rank.get(article.get("content_quality", ""), 0)
                existing_summary_len = len(existing.get("summary", ""))
                new_summary_len = len(article.get("summary", ""))
                if new_rank > existing_rank or (new_rank == existing_rank and new_summary_len > existing_summary_len):
                    idx = result.index(existing)
                    result[idx] = article
                    seen[key] = article
        return result

    def _enrich_article(self, article: dict[str, Any], category_id: str) -> dict[str, Any]:
        article_url = (article.get("source_url") or article.get("link") or "").strip()
        cached = self.cache.get(article_url)
        cache_key = self._content_fingerprint(article)
        if (
            cached
            and cached.get("_fingerprint") == cache_key
            and cached.get("_cache_version") == CACHE_VERSION
        ):
            return {**article, **cached, "image": cached.get("best_image") or cached.get("image", "")}

        extracted = {
            "canonical_url": article_url or article.get("canonical_url", ""),
            "headline": article.get("title", ""),
            "author": "",
            "published_at": article.get("date", ""),
            "full_text": "",
            "image_candidates": [],
        }

        if article_url.startswith("http"):
            try:
                extracted = extract_article_payload(
                    article_url,
                    fallback_title=article.get("title", ""),
                    feed_image=article.get("image", ""),
                )
            except Exception as exc:
                print(f"WARN: Briefing extraction failed for {article_url}: {exc}", file=sys.stderr)

        full_text = extracted.get("full_text") or ""
        fallback_parts = [
            extracted.get("meta_description"),
            article.get("description"),
            article.get("title"),
        ]
        fallback_text = " ".join(part.strip() for part in fallback_parts if isinstance(part, str) and part.strip())
        is_accessible_for_free = extracted.get("is_accessible_for_free")
        is_paywalled = is_accessible_for_free is False
        briefing, used_llm = self.builder.build(
            article=article,
            category_id=category_id,
            full_text=full_text,
            fallback_text=fallback_text,
        )

        if is_paywalled and not full_text:
            paywall_summary = extracted.get("meta_description") or article.get("description") or article.get("title", "")
            paywall_summary = smart_truncate(paywall_summary, 320)
            if paywall_summary:
                briefing["dek"] = extracted.get("alternative_headline") or briefing.get("dek") or paywall_summary
                briefing["summary"] = f"{paywall_summary} Volltext liegt hinter einer Paywall; das Briefing basiert daher nur auf frei sichtbaren Angaben."
                briefing["bullet_points"] = [
                    smart_truncate(paywall_summary, 180),
                    "Volltext ist nicht frei zugänglich.",
                    "Einordnung basiert nur auf Teaser und Metadaten.",
                ]

        image_candidates = extracted.get("image_candidates", [])
        best_image = ""
        best_image_score = 0.0
        for candidate in image_candidates:
            score = score_image_candidate(candidate.get("url", ""), candidate.get("source", ""))
            if score > best_image_score:
                best_image_score = score
                best_image = candidate.get("url", "")
        if best_image_score < 0.5:
            best_image = ""

        summary_text = briefing.get("summary") or fallback_text
        summary_quality_score = score_summary(summary_text, full_text, used_llm=used_llm)
        content_extracted = bool(full_text and len(full_text.split()) >= 80)
        content_quality = classify_content_quality(content_extracted, summary_quality_score, best_image_score)
        canonical_url = extracted.get("canonical_url") or article.get("source_url") or article.get("link", "")
        final_headline = extracted.get("headline") or article.get("title", "")
        if extracted.get("alternative_headline") and "kleinezeitung.at" in canonical_url:
            final_headline = f"{extracted['alternative_headline']}: {final_headline}"

        payload = {
            "_cache_version": CACHE_VERSION,
            "_fingerprint": cache_key,
            "canonical_url": canonical_url,
            "headline": final_headline,
            "title": final_headline,
            "dek": briefing.get("dek", ""),
            "briefing_blurb": briefing.get("dek") or smart_truncate(summary_text, 180),
            "summary": summary_text,
            "bullet_points": briefing.get("bullet_points", []),
            "why_it_matters": briefing.get("why_it_matters", ""),
            "otto_comment": briefing.get("why_it_matters", ""),
            "author": extracted.get("author") or article.get("author", ""),
            "published_at": extracted.get("published_at") or article.get("date", ""),
            "date": extracted.get("published_at") or article.get("date", ""),
            "full_text": full_text,
            "topics": briefing.get("topics", []),
            "entities": briefing.get("topics", []),
            "is_accessible_for_free": is_accessible_for_free,
            "is_paywalled": is_paywalled,
            "content_extracted": content_extracted,
            "summary_quality_score": round(summary_quality_score, 2),
            "image_quality_score": round(best_image_score, 2),
            "content_quality": content_quality,
            "processing_status": "complete" if used_llm else ("heuristic" if (full_text or fallback_text) else "unprocessed"),
            "enrichment_method": "llm" if used_llm else "heuristic",
            "needs_review": (summary_quality_score < 0.5 or not content_extracted) and not is_paywalled,
            "image_candidates": image_candidates,
            "best_image": best_image,
            "image": best_image,
            "reading_time_minutes": article.get("reading_time_minutes") or self._reading_time(full_text or summary_text),
            "source_url": article.get("source_url") or article.get("link", ""),
            "discussion_url": article.get("discussion_url"),
        }

        if article_url:
            self.cache.set(article_url, payload)

        merged = {**article, **payload}
        if not merged.get("description"):
            merged["description"] = briefing.get("dek") or smart_truncate(summary_text, 220)
        if not merged.get("image"):
            merged["image"] = ""
        return merged

    def _content_fingerprint(self, article: dict[str, Any]) -> str:
        relevant = {
            "title": article.get("title"),
            "link": article.get("link"),
            "description": article.get("description"),
            "image": article.get("image"),
            "date": article.get("date"),
        }
        return hashlib.sha256(json.dumps(relevant, sort_keys=True).encode("utf-8")).hexdigest()

    def _reading_time(self, text: str) -> int:
        words = len((text or "").split())
        if words <= 0:
            return 1
        return max(1, min(8, (words + 199) // 200))


def load_json(path: Path) -> dict[str, Any]:
    with path.open() as handle:
        return json.load(handle)


def generate_curation_spec(enriched_path: Path, spec_output: Path) -> int:
    """Use LLM to generate a curation spec from enriched articles.

    The spec includes: editorial, article selections per category (by index),
    ki_modelle, dev_digest, quote, history, and bauernregel.
    curate.py reads this spec and assembles the final JSON with deterministic
    widgets (weather, pollen, VPS, calendar).
    """
    from datetime import datetime, timezone

    if not enriched_path.exists():
        print(f"ERROR: Enriched file not found: {enriched_path}", file=sys.stderr)
        return 1

    data = load_json(enriched_path)
    categories = data.get("categories", {})

    # Build compact article index for the LLM prompt
    article_index: list[dict[str, str]] = []
    global_idx = 0
    cat_ranges: dict[str, tuple[int, int]] = {}
    for cat_id, cat_data in categories.items():
        start = global_idx
        for art in cat_data.get("articles", []):
            article_index.append({
                "idx": global_idx,
                "cat": cat_id,
                "title": (art.get("title") or "")[:80],
                "source": (art.get("source") or "")[:30],
                "summary": (art.get("summary") or art.get("description") or "")[:150],
                "has_image": bool(art.get("image")),
                "lang": "de" if any(w in (art.get("title") or "").lower() for w in
                    ["der ", "die ", "das ", "und ", "für ", "mit ", "ist ", "wird ", "nach "]) else "en",
            })
            global_idx += 1
        cat_ranges[cat_id] = (start, global_idx)

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%A, %d. %B %Y")
    article_list = "\n".join(
        f"[{a['idx']}] ({a['cat']}) {a['title']} — {a['source']} "
        f"{'[DE]' if a['lang'] == 'de' else '[EN]'} "
        f"{'[IMG]' if a['has_image'] else ''}"
        for a in article_index
    )

    instructions = f"""Du bist Otto, der persoenliche Kurator fuer BrakeFast — eine deutschsprachige Morgenzeitung.
Heute ist {today_str}. Erstelle eine Kurations-Spezifikation als JSON.

VERFUEGBARE ARTIKEL (Index, Kategorie, Titel, Quelle):
{article_list}

DENKE ZUERST KURZ STRUKTURIERT NACH (nicht im JSON ausgeben, nur fuer dich):
1. Was sind die 3-5 wichtigsten Stories des Tages ueber alle Kategorien hinweg?
2. Welche Artikel decken dieselbe Story aus verschiedenen Quellen ab? (Duplikate identifizieren)
3. Welche Artikel sind reines PR/Marketing, Listicles, oder thematisch falsch einsortiert?

AUFGABE — Erzeuge dann exakt dieses JSON-Format:
{{
  "editorial": "3-4 Saetze tagesaktueller Aufmacher, der die Top-Themen buendelt. Deutsch, persoenlich.",
  "categories": {{
    "ai": [{{"index": <int>, "headline_de": "<deutsch, max 80 Zeichen>"}}],
    "security": [...],
    "tech": [...],
    "ev": [...],
    "world": [...],
    "knapp": [...],
    "local": [...]
  }},
  "ki_modelle": {{
    "<modell_name>": {{"title": "...", "summary": "1 Satz", "link": "<url aus Artikel>"}}
  }},
  "dev_digest": {{
    "<tool_name>": {{"title": "...", "summary": "1 Satz", "link": "<url aus Artikel>"}}
  }},
  "widgets": {{
    "quote": {{"text": "<deutsches Zitat>", "author": "<Autor>"}},
    "history": [
      {{"year": <int>, "text": "<Ereignis am heutigen Tag>", "wiki": "<Wikipedia-Slug_mit_Underscores>"}},
      {{"year": <int>, "text": "...", "wiki": "..."}},
      {{"year": <int>, "text": "...", "wiki": "..."}}
    ],
    "bauernregel": {{"text": "<passend zum Monat>", "meaning": "<Erklaerung>"}}
  }}
}}

KURATIONS-REGELN (in dieser Reihenfolge anwenden):

A. DEDUPLIZIERUNG: Wenn 2+ Artikel dieselbe Story abdecken: nur den besten waehlen.
   Praeferenz: deutsche Quelle > englische Quelle, mit Bild > ohne Bild, taggenau > Aggregator.

B. QUALITAETSFILTER (skippen, nicht auswaehlen):
   - Reines PR / Produkt-Marketing ohne Substanz
   - Listicles wie "100 Dinge die...", "Top 10 ...", "X Trends fuer ..."
   - Clickbait-Titel ("Sie werden nicht glauben...", "Das aendert alles")
   - Thematisch falsch einsortiert (z.B. Security-Story landete in AI)

C. AUSWAHL pro Kategorie: bis zu 5 Artikel, sortiert nach Relevanz absteigend
   (wichtigste = erster Eintrag). Wenn nach Filterung <5 uebrig: weniger ist OK, NICHT mit Filler auffuellen.
   Top-Position pro Kategorie muss substanziell und aktuell sein.

D. AUSWAHL fuer "ai"-Kategorie speziell: an Position [0] gehoert der wichtigste echte AI-Artikel des Tages
   (Modell-Release, Research-Durchbruch, signifikantes Produkt-Update). NICHT Filler, NICHT misskategorisiert.

E. HEADLINE_DE: kurz, aktiv, praezise. KEINE Marketing-Floskeln. KEINE wortwoertliche
   Uebersetzung wenn das Deutsche unnatuerlich klingt — frei aber treu uebertragen.

F. SONST: Deutsche Quellen bevorzugen. ki_modelle: 2-3 neue Modelle/Tools aus AI-Artikeln.
   dev_digest: 2-3 Dev-Tools/Plattform-News aus Tech/Security.
   history: 3 Ereignisse von HEUTE ({now.strftime('%d. %B')}), verschiedene Epochen.
   quote: deutsches Zitat (nicht Alan Kay, nicht englisch).
   bauernregel: passend zu {now.strftime('%B')}.

Antworte NUR mit dem JSON, kein Reasoning-Text, kein Markdown-Wrapper."""

    client = OpenClawChatClient()
    if not client.enabled:
        print("ERROR: No LLM providers available for curation spec", file=sys.stderr)
        return 1

    print(f"Generating curation spec via LLM ({client.describe_chain()})...", file=sys.stderr)
    response = client.complete_json(
        messages=[
            {"role": "system", "content": "Du bist ein JSON-Generator. Antworte ausschliesslich mit validem JSON."},
            {"role": "user", "content": instructions},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
        timeout=150,
    )

    if response is None:
        print(f"ERROR: LLM curation spec generation failed: {client.last_error}", file=sys.stderr)
        return 1

    # Parse and validate the spec
    try:
        content = response.content
        if isinstance(content, str):
            # Strip markdown code fences if present
            content = re.sub(r"^```(?:json)?\s*\n?", "", content.strip())
            content = re.sub(r"\n?```\s*$", "", content.strip())
            spec = json.loads(content)
        else:
            spec = content
    except (json.JSONDecodeError, TypeError) as exc:
        print(f"ERROR: Could not parse LLM curation spec: {exc}", file=sys.stderr)
        enrichment_logger.error("Curation spec parse failed: %s. Raw: %.3000s", exc, response.content)
        return 1

    # Validate minimum structure
    if not isinstance(spec, dict):
        print("ERROR: Curation spec is not a dict", file=sys.stderr)
        return 1
    if "categories" not in spec:
        print("ERROR: Curation spec missing 'categories'", file=sys.stderr)
        return 1
    if not spec.get("editorial"):
        spec["editorial"] = "Ihre Morgenzeitung fuer den Bezirk Voitsberg."

    # Validate article indices are in range
    max_idx = len(article_index) - 1
    for cat_id, items in spec.get("categories", {}).items():
        if not isinstance(items, list):
            continue
        for item in items:
            idx = item.get("index")
            if isinstance(idx, int) and (idx < 0 or idx > max_idx):
                enrichment_logger.warning("Curation spec: index %d out of range for %s (max %d)",
                                          idx, cat_id, max_idx)

    spec_output.write_text(json.dumps(spec, ensure_ascii=False, indent=2))
    print(f"Curation spec written to {spec_output}", file=sys.stderr)
    enrichment_logger.info("Curation spec generated via %s (%s): editorial=%d chars, cats=%s",
                           response.provider_name, response.model,
                           len(spec.get("editorial", "")),
                           list(spec.get("categories", {}).keys()))
    return 0


def main() -> int:
    # Check for --curation-spec mode
    if "--curation-spec" in sys.argv:
        sys.argv.remove("--curation-spec")
        enriched_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
        spec_output = OUTPUT_DIR / "curation-spec.json"
        if len(sys.argv) > 2:
            spec_output = Path(sys.argv[2])
        return generate_curation_spec(enriched_path, spec_output)

    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    cache_path = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_CACHE

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        return 1

    raw_payload = load_json(input_path)
    cache = ArticleCache(cache_path)
    engine = ArticleBriefingEngine(cache)
    mode = engine.builder.mode_description()
    print(f"Briefing builder mode: {mode}", file=sys.stderr)
    enriched = engine.enrich(raw_payload, checkpoint_path=output_path)

    output_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))
    cache.save()

    print(f"Enriched articles written to {output_path}", file=sys.stderr)

    # Phase 04.02: persist scraper telemetry (per-run + monthly digest).
    # Lazy import keeps article_briefing_engine importable when scraper_proxy
    # is unavailable (e.g., partial rollback of Phase 04.02). Telemetry
    # failure must never crash the pipeline — flush_stats wraps its own
    # body in try/except, this outer guard catches an ImportError or any
    # unexpected attribute error from a stale module on disk.
    try:
        from scraper_proxy import flush_stats
        flush_stats()
    except Exception as exc:
        enrichment_logger.warning("scraper_proxy.flush_stats failed: %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
