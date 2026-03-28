"""Tests for article_quality module."""

import pytest

from article_quality import classify_content_quality, score_image_candidate, score_summary


class TestScoreSummary:
    def test_empty_summary_scores_zero(self):
        assert score_summary("", "", used_llm=False) == 0.0

    def test_short_summary_scores_low(self):
        score = score_summary("Very short text.", "full text here", used_llm=False)
        assert score == 0.2

    def test_medium_summary_scores_higher(self):
        words = " ".join(["word"] * 40)
        score = score_summary(words, words, used_llm=False)
        assert score >= 0.5

    def test_long_summary_scores_high(self):
        words = " ".join(["word"] * 80)
        full = " ".join(["word"] * 200)
        score = score_summary(words, full, used_llm=False)
        assert score >= 0.7

    def test_llm_boost(self):
        words = " ".join(["word"] * 80)
        full = " ".join(["word"] * 200)
        without_llm = score_summary(words, full, used_llm=False)
        with_llm = score_summary(words, full, used_llm=True)
        assert with_llm > without_llm


class TestClassifyContentQuality:
    def test_high_quality(self):
        result = classify_content_quality(True, 0.8, 0.8)
        assert result == "high"

    def test_medium_quality(self):
        result = classify_content_quality(True, 0.6, 0.3)
        assert result == "medium"

    def test_low_quality(self):
        result = classify_content_quality(False, 0.3, 0.2)
        assert result == "low"


class TestScoreImageCandidate:
    def test_invalid_url_scores_zero(self):
        assert score_image_candidate("", "meta") == 0.0

    def test_meta_source_scores_high(self):
        score = score_image_candidate("https://example.com/images/article-photo-large.jpg", "meta")
        assert score >= 0.8

    def test_feed_source_scores_low(self):
        score = score_image_candidate("https://example.com/images/article-photo-large.jpg", "feed")
        assert score < 0.5

    def test_bad_pattern_scores_zero(self):
        score = score_image_candidate("https://example.com/favicon.ico", "meta")
        assert score == 0.0
