#!/usr/bin/env python3
"""Build enriched article briefings from raw feed data."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from article_extractors import extract_article_payload, smart_truncate, split_sentences
from article_quality import classify_content_quality, score_image_candidate, score_summary
from openclaw_client import OpenClawChatClient

SCRIPT_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = BRAKEFAST_DIR / "output"
DEFAULT_INPUT = OUTPUT_DIR / "raw-articles.json"
DEFAULT_OUTPUT = OUTPUT_DIR / "enriched-articles.json"
DEFAULT_CACHE = OUTPUT_DIR / "article-briefing-cache.json"
CACHE_VERSION = 7

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
        if self.enabled and full_text:
            llm_payload = self._build_with_llm(article, category_id, full_text)
            if llm_payload:
                return llm_payload, True
        return self._build_heuristic(article, category_id, full_text or fallback_text), False

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
            return None

        try:
            parsed = self._parse_llm_json(response.content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
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

    def enrich(self, raw_payload: dict[str, Any]) -> dict[str, Any]:
        categories = raw_payload.get("categories", {})
        result_categories: dict[str, Any] = {}
        total_articles = 0

        for category_id, category_data in categories.items():
            articles = category_data.get("articles", [])
            enriched_articles = [
                self._enrich_article(article, category_id)
                for article in articles
            ]
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


def main() -> int:
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
    enriched = engine.enrich(raw_payload)

    output_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))
    cache.save()

    print(f"Enriched articles written to {output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
