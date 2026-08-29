"""Regression tests for edition quality degradation."""

from datetime import datetime, timedelta, timezone

import validate_edition


def _article(title, link, age_days=0):
    return {
        "title": title,
        "link": link,
        "summary": "Eine belastbare Zusammenfassung.",
        "published_at": (datetime.now(timezone.utc) - timedelta(days=age_days)).isoformat(),
    }


def _edition(articles):
    return {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "totalArticles": len(articles),
        "editorial": "Eine ausreichend lange Einleitung.",
        "categories": {"tech": {"articles": articles}},
        "widgets": {
            "quote": {"text": "Test", "author": "Test"},
            "history": [
                {"wiki": "Test_1"},
                {"wiki": "Test_2"},
            ],
            "namenstag": "Testtag",
        },
    }


def test_invalid_joined_tld_url_is_removed_and_count_recomputed():
    data = _edition([
        _article("Gut", "https://example.com/gut"),
        _article("Kaputt", "https://plastxnow.deadditivx-lieferkette-a-123456"),
    ])

    _errors, warnings = validate_edition.validate(data)

    assert [article["title"] for article in data["categories"]["tech"]["articles"]] == ["Gut"]
    assert data["totalArticles"] == 1
    assert any("invalid link" in warning for warning in warnings)


def test_very_stale_article_is_removed_but_four_day_article_only_warns():
    data = _edition([
        _article("Vier Tage", "https://example.com/vier-tage", age_days=4),
        _article("Zwanzig Tage", "https://example.com/zwanzig-tage", age_days=20),
    ])

    _errors, warnings = validate_edition.validate(data)

    assert [article["title"] for article in data["categories"]["tech"]["articles"]] == ["Vier Tage"]
    assert any("older than 14 days" in warning for warning in warnings)
    assert any("days old" in warning for warning in warnings)
