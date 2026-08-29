"""Regression tests for deterministic editorial quality gates in curate.py."""

from datetime import datetime, timedelta, timezone

import pytest

import curate


NOW = datetime(2026, 8, 10, 6, 0, tzinfo=timezone.utc)


def test_repair_article_url_restores_missing_slash_after_tld():
    broken = (
        "https://plastxnow.deadditivx-additive-fertigung-lieferketten-"
        "ersatzteilmanagement-produktion-a-04d6f64ae63e8e08a37558c26f63708f"
    )

    assert curate.repair_article_url(broken) == (
        "https://plastxnow.de/additivx-additive-fertigung-lieferketten-"
        "ersatzteilmanagement-produktion-a-04d6f64ae63e8e08a37558c26f63708f"
    )


@pytest.mark.parametrize(
    "url",
    [
        "https://plastxnow.de/korrekter-artikel",
        "https://www.openai.com/index/introducing-gpt-5",
        "https://example.design/story",
    ],
)
def test_repair_article_url_leaves_valid_urls_unchanged(url):
    assert curate.repair_article_url(url) == url


def test_german_source_headline_wins_over_hallucinated_curated_headline():
    item = {"headline_de": "Feuerwehr rettet verletzten Mann vom Dach des Finanzamts"}
    source = {
        "title": "Feuerwehr rettet verletzten Jungstorch vom Dach des Finanzamts",
        "summary": "Der junge Storch wurde sicher geborgen.",
    }

    assert curate.select_article_headline(item, source) == source["title"]


def test_english_source_can_use_german_curated_headline():
    item = {"headline_de": "OpenAI stellt neues Sprachmodell vor"}
    source = {"title": "OpenAI launches a new language model"}

    assert curate.select_article_headline(item, source) == item["headline_de"]


def test_cross_category_selection_is_rejected():
    source = {"_raw_category": "tech", "title": "AMD and Taalas speed up AI inference"}

    assert not curate.article_matches_category(source, "ev")
    assert curate.article_matches_category(source, "tech")


def test_article_age_supports_iso_and_rfc_dates():
    assert curate.article_age_hours({"published_at": "2026-08-09T06:00:00Z"}, NOW) == pytest.approx(24)
    assert curate.article_age_hours({"pubDate": "Sun, 09 Aug 2026 06:00:00 GMT"}, NOW) == pytest.approx(24)


def test_stale_articles_are_not_eligible_for_daily_edition():
    fresh = {"published_at": "2026-08-08T06:00:00Z"}
    stale = {"published_at": "2026-07-25T06:00:00Z"}

    assert curate.is_article_fresh(fresh, NOW)
    assert not curate.is_article_fresh(stale, NOW)


def test_relevance_score_rewards_freshness_and_is_not_constant_default():
    common = {
        "trust": 8,
        "summary": "Substanzielle Zusammenfassung " * 15,
        "image": "https://example.com/image.jpg",
    }
    fresh = {**common, "published_at": "2026-08-10T05:00:00Z"}
    older = {**common, "published_at": "2026-08-05T05:00:00Z"}

    fresh_score = curate.calculate_relevance_score(fresh, NOW)
    older_score = curate.calculate_relevance_score(older, NOW)

    assert 0 < older_score < fresh_score <= 1
    assert fresh_score != 0.5


def test_vps_widget_prefers_host_container_count(monkeypatch):
    monkeypatch.setenv("BRAKEFAST_HOST_CONTAINER_COUNT", "13")
    monkeypatch.setattr(curate, "run", lambda *_args, **_kwargs: "")

    assert curate.fetch_vps()["containers"] == 13


def test_build_curated_applies_all_gates_before_category_backfill(monkeypatch):
    now = datetime.now(timezone.utc)
    fresh_date = (now - timedelta(hours=4)).isoformat()
    stale_date = (now - timedelta(days=20)).isoformat()
    broken_url = "https://plastxnow.deadditivx-additive-fertigung-a-123456"
    sources = [
        {
            "_raw_category": "tech",
            "title": "AMD and Taalas speed up AI inference",
            "link": "https://example.com/amd-taalas",
            "published_at": fresh_date,
            "summary": "A technical inference platform update.",
        },
        {
            "_raw_category": "ev",
            "title": "Neues Schnellladenetz startet in Österreich",
            "link": "https://example.at/schnellladenetz",
            "published_at": fresh_date,
            "summary": "Das neue Netz umfasst mehrere Ladepunkte.",
        },
        {
            "_raw_category": "ev",
            "title": "Alte Elektroauto-Meldung",
            "link": "https://example.at/alte-meldung",
            "published_at": stale_date,
            "summary": "Diese Meldung ist nicht mehr aktuell.",
        },
        {
            "_raw_category": "local",
            "title": "Feuerwehr rettet verletzten Jungstorch vom Dach des Finanzamts",
            "link": "https://example.at/jungstorch",
            "published_at": fresh_date,
            "summary": "Der junge Storch wurde sicher geborgen.",
        },
        {
            "_raw_category": "knapp",
            "title": "Additive Fertigung stärkt Ersatzteillieferketten",
            "link": broken_url,
            "published_at": fresh_date,
            "summary": "Additive Fertigung verkürzt Lieferwege.",
        },
    ]
    spec = {
        "edition_number": 1,
        "editorial": "Eine geprüfte Testausgabe.",
        "widgets": {"quote": {"text": "Test", "author": "Test"}},
        "categories": {
            "ev": [
                {"index": 0, "headline_de": "AMD beschleunigt Elektroautos"},
                {"index": 2},
                {"index": 1},
            ],
            "local": [
                {"index": 3, "headline_de": "Feuerwehr rettet verletzten Mann vom Dach"},
            ],
            "knapp": [{"index": 4}],
        },
    }

    monkeypatch.setattr(curate, "fetch_weather", lambda: ({}, {}))
    monkeypatch.setattr(curate, "fetch_vps", lambda: {"disk": "ok", "uptime": "", "containers": 1})
    monkeypatch.setattr(curate, "load_calendar", lambda: [])
    monkeypatch.setattr(curate, "fetch_onthisday_history", lambda _now: [])
    monkeypatch.setattr(curate, "enrich_history", lambda facts: facts)
    monkeypatch.setattr(curate, "choose_word_of_day", lambda *_args: {})
    monkeypatch.setattr(curate, "fetch_namenstag", lambda _now: "Testtag")
    monkeypatch.setattr(curate, "choose_media_tip", lambda *_args: {})
    monkeypatch.setattr(curate, "fetch_event_calendar", lambda: [])
    monkeypatch.setattr(curate, "fetch_local_events", lambda: [])
    monkeypatch.setattr(curate, "build_detail_section", lambda *_args, **_kwargs: {})

    result = curate.build_curated(spec, sources)

    ev_titles = [article["title"] for article in result["categories"]["ev"]["articles"]]
    tech_titles = [article["title"] for article in result["categories"]["tech"]["articles"]]
    all_titles = [
        article["title"]
        for category in result["categories"].values()
        for article in category["articles"]
    ]
    assert ev_titles == ["Neues Schnellladenetz startet in Österreich"]
    assert "AMD and Taalas speed up AI inference" in tech_titles
    assert "Alte Elektroauto-Meldung" not in all_titles
    assert result["categories"]["local"]["articles"][0]["title"] == sources[3]["title"]
    assert result["categories"]["knapp"]["articles"][0]["link"] == (
        "https://plastxnow.de/additivx-additive-fertigung-a-123456"
    )
