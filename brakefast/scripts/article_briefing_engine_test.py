"""Regression tests for the concurrent enrichment pass.

Hermetic: no network, no LLM, no real cache file. Runs under pytest, and also
standalone via `python3 -c "import article_briefing_engine_test as t; ..."`
because pytest is not installed on every machine that touches this pipeline.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import types
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

# The engine attaches a RotatingFileHandler to output/enrichment.log at import
# time, and pulls in trafilatura transitively. Both have to exist before import.
(SCRIPT_DIR.parent / "output").mkdir(parents=True, exist_ok=True)
if "trafilatura" not in sys.modules:
    _stub = types.ModuleType("trafilatura")
    _stub.extract = lambda *a, **k: None
    _stub.bare_extraction = lambda *a, **k: None
    sys.modules["trafilatura"] = _stub
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import article_briefing_engine as engine  # noqa: E402


def _payload(shape: dict[str, int]) -> dict:
    """Build a raw payload: {category_id: article_count}."""
    categories = {}
    for cat, count in shape.items():
        categories[cat] = {
            "name": cat.upper(),
            "articles": [
                {
                    "title": f"{cat}-{i}",
                    "link": f"https://example.invalid/{cat}/{i}",
                    "source_url": f"https://example.invalid/{cat}/{i}",
                    "source": "Testquelle",
                }
                for i in range(count)
            ],
        }
    return {"generated": "2026-07-31T05:30:00Z", "categories": categories}


def _engine_with_fake(fake) -> engine.ArticleBriefingEngine:
    """Engine whose per-article work is replaced — no network, no LLM."""
    cache = engine.ArticleCache(Path(tempfile.mkdtemp()) / "cache.json")
    eng = engine.ArticleBriefingEngine(cache)
    eng._enrich_article = types.MethodType(fake, eng)
    return eng


def _fake_ok(sleep_s: float = 0.05):
    def _f(self, article, category_id):
        time.sleep(sleep_s)
        return {**article, "full_text": "x" * 500, "category": category_id}
    return _f


def _run(eng, payload, workers, checkpoint_path=None, stats_path=None):
    previous = os.environ.get("BRAKEFAST_ENRICHMENT_WORKERS")
    os.environ["BRAKEFAST_ENRICHMENT_WORKERS"] = str(workers)
    try:
        return eng.enrich(payload, checkpoint_path=checkpoint_path, stats_path=stats_path)
    finally:
        if previous is None:
            os.environ.pop("BRAKEFAST_ENRICHMENT_WORKERS", None)
        else:
            os.environ["BRAKEFAST_ENRICHMENT_WORKERS"] = previous


def test_order_preserved():
    """Completion order must never leak into the output — curation reads positionally."""
    payload = _payload({"ai": 5, "tech": 4, "ev": 3})
    # Stagger the work so completion order is guaranteed NOT to match input order.
    def _f(self, article, category_id):
        idx = int(article["title"].rsplit("-", 1)[1])
        time.sleep(0.02 * (5 - idx))
        return {**article, "full_text": "x" * 500}
    result = _run(_engine_with_fake(_f), payload, workers=5)

    assert list(result["categories"].keys()) == ["ai", "tech", "ev"], list(result["categories"].keys())
    for cat, cat_data in payload["categories"].items():
        got = [a["title"] for a in result["categories"][cat]["articles"]]
        want = [a["title"] for a in cat_data["articles"]]
        assert got == want, f"{cat}: {got} != {want}"


def test_counts_and_shape():
    payload = _payload({"ai": 5, "tech": 4, "ev": 3})
    result = _run(_engine_with_fake(_fake_ok()), payload, workers=5)

    assert set(result.keys()) == {"generated", "totalArticles", "categories"}, set(result.keys())
    summed = sum(len(c["articles"]) for c in result["categories"].values())
    assert result["totalArticles"] == summed == 12, (result["totalArticles"], summed)


def test_sequential_equivalence():
    """workers=1 is the rollback knob on the VPS — it must reproduce serial behaviour."""
    payload = _payload({"ai": 4, "tech": 3, "world": 3})
    serial = _run(_engine_with_fake(_fake_ok(0.01)), payload, workers=1)
    parallel = _run(_engine_with_fake(_fake_ok(0.01)), payload, workers=5)
    assert serial == parallel


def test_checkpoint_valid_json():
    """brakefast-daily.sh consumes this exact file on timeout — it must never be half-written."""
    payload = _payload({"ai": 5, "tech": 4, "ev": 3})
    tmp = Path(tempfile.mkdtemp()) / "enriched.json"
    _run(_engine_with_fake(_fake_ok(0.01)), payload, workers=5, checkpoint_path=tmp)

    assert tmp.exists(), "checkpoint file was never written"
    data = json.loads(tmp.read_text())  # raises if truncated or interleaved
    assert set(data["categories"].keys()) == {"ai", "tech", "ev"}
    for cat, cat_data in payload["categories"].items():
        assert len(data["categories"][cat]["articles"]) == len(cat_data["articles"]), cat


def test_worker_exception_isolated():
    """One bad article must not cost the whole run — the old code let any non-fetch raise abort it."""
    payload = _payload({"ai": 5, "tech": 4})

    def _f(self, article, category_id):
        if article["title"] == "ai-2":
            raise RuntimeError("simulierter Ausfall")
        return {**article, "full_text": "x" * 500}

    result = _run(_engine_with_fake(_f), payload, workers=5)
    ai = result["categories"]["ai"]["articles"]
    assert len(ai) == 5, len(ai)
    assert [a["title"] for a in ai] == ["ai-0", "ai-1", "ai-2", "ai-3", "ai-4"]
    failed = next(a for a in ai if a["title"] == "ai-2")
    assert failed is not None and failed.get("title") == "ai-2"
    assert not failed.get("full_text"), "failed slot must fall back to the raw article"


def test_concurrency_actually_parallel():
    """Guards against a future refactor silently serialising the pool again."""
    payload = _payload({"ai": 10})
    start = time.monotonic()
    _run(_engine_with_fake(_fake_ok(0.2)), payload, workers=5)
    elapsed = time.monotonic() - start
    assert elapsed < 1.2, f"took {elapsed:.2f}s — sequential would be ~2.0s, so the pool is not parallel"


def test_worker_count_clamped():
    """Bad env values must not crash the morning run."""
    for raw, want in (("5", 5), ("1", 1), ("0", 1), ("99", 16), ("-3", 1), ("abc", 5), ("", 5)):
        os.environ["BRAKEFAST_ENRICHMENT_WORKERS"] = raw
        got = engine._enrichment_workers()
        assert got == want, f"{raw!r} -> {got}, erwartet {want}"
    os.environ.pop("BRAKEFAST_ENRICHMENT_WORKERS", None)
    assert engine._enrichment_workers() == 5


def test_curation_index_exposes_date_and_age_to_the_model():
    categories = {
        "tech": {
            "articles": [
                {
                    "title": "Fresh platform release",
                    "source": "Example",
                    "published_at": "2026-08-09T06:00:00Z",
                }
            ]
        }
    }
    now = datetime(2026, 8, 10, 6, 0, tzinfo=timezone.utc)

    index = engine.build_curation_article_index(categories, now=now)
    prompt_list = engine.format_curation_article_list(index)

    assert index[0]["published_at"] == "2026-08-09T06:00:00Z"
    assert index[0]["age_hours"] == 24
    assert "24h alt" in prompt_list



# ---------------------------------------------------------------------------
# LLM-Bilanz (Befund 31.08.-01.09.2026: alle Provider HTTP 401, Telemetrie
# meldete trotzdem status=ok). Die Engine muss zaehlen, ob ueberhaupt ein
# LLM-Call ein brauchbares Briefing geliefert hat.
# ---------------------------------------------------------------------------

from openclaw_client import ChatResponse  # noqa: E402

_GOOD_LLM_JSON = json.dumps({
    "dek": "Kurzer Vorspann.",
    "summary": "Satz eins mit Inhalt. Satz zwei mit Inhalt. Satz drei mit Inhalt. "
               "Satz vier mit noch mehr Inhalt und Woertern.",
    "bullet_points": ["Punkt eins", "Punkt zwei", "Punkt drei"],
    "why_it_matters": "Weil es Otto betrifft.",
    "topics": ["Test", "Bilanz"],
})


class _FakeClient:
    """Stand-in fuer OpenClawChatClient: gescriptete Antworten, kein Netz."""

    def __init__(self, enabled=True, content=None):
        self.enabled = enabled
        self.content = content  # None -> jeder Call scheitert (alle Provider down)
        self.last_error = "teamo-pro: request failed: HTTP 401" if content is None else ""
        self.calls = 0

    def describe_chain(self):
        return "fake-a -> fake-b" if self.enabled else "heuristic"

    def complete_json(self, **kwargs):
        self.calls += 1
        if self.content is None:
            return None
        return ChatResponse(provider_name="fake", model="m", content=self.content, payload={})


def _build(builder, title="Testartikel"):
    return builder.build(
        article={"title": title, "source": "Testquelle", "description": "Beschreibung " * 20},
        category_id="ai",
        full_text="Volltext mit Inhalt. " * 40,
        fallback_text="",
    )


def test_llm_stats_all_calls_failed_is_failed():
    builder = engine.BriefingBuilder(client=_FakeClient(content=None))
    _, used_llm_1 = _build(builder, "A")
    _, used_llm_2 = _build(builder, "B")
    stats = builder.llm_stats()

    assert (used_llm_1, used_llm_2) == (False, False)
    assert stats["llm_status"] == "failed", stats
    assert (stats["llm_calls"], stats["llm_responses"], stats["llm_briefings"]) == (2, 0, 0), stats
    assert stats["llm_last_error"] == "teamo-pro: request failed: HTTP 401"
    assert stats["provider_chain"] == "fake-a -> fake-b"


def test_llm_stats_unusable_response_is_response_but_no_briefing():
    builder = engine.BriefingBuilder(client=_FakeClient(content="kein json"))
    _build(builder)
    stats = builder.llm_stats()

    assert stats["llm_status"] == "failed", stats
    assert (stats["llm_calls"], stats["llm_responses"], stats["llm_briefings"]) == (1, 1, 0), stats


def test_llm_stats_usable_briefing_is_ok():
    builder = engine.BriefingBuilder(client=_FakeClient(content=_GOOD_LLM_JSON))
    _, used_llm = _build(builder)
    stats = builder.llm_stats()

    assert used_llm is True
    assert stats["llm_status"] == "ok", stats
    assert (stats["llm_calls"], stats["llm_responses"], stats["llm_briefings"]) == (1, 1, 1), stats


def test_llm_stats_without_providers_is_unavailable():
    builder = engine.BriefingBuilder(client=_FakeClient(enabled=False))
    _build(builder)
    stats = builder.llm_stats()

    assert stats["llm_status"] == "unavailable", stats
    assert stats["llm_calls"] == 0, stats
    assert stats["provider_chain"] == "heuristic"


def test_llm_stats_without_calls_is_idle():
    builder = engine.BriefingBuilder(client=_FakeClient(content=_GOOD_LLM_JSON))
    stats = builder.llm_stats()

    assert stats["llm_status"] == "idle", stats
    assert stats["llm_calls"] == 0, stats


def test_enrich_writes_stats_file_with_cache_hits_and_llm_verdict():
    """brakefast-daily.sh liest genau diese Datei nach dem Enrichment-Schritt."""
    payload = {
        "generated": "2026-09-01T05:30:00Z",
        "categories": {
            "ai": {
                "name": "AI",
                "articles": [
                    # Zwei Artikel mit Cache-Treffer: kein LLM-Call noetig.
                    {"title": "ai-0", "link": "cached://ai/0", "source": "Q", "description": "Text " * 30},
                    {"title": "ai-1", "link": "cached://ai/1", "source": "Q", "description": "Text " * 30},
                    # Ohne Link: kein Fetch, aber ein LLM-Call ueber den Fallback-Text.
                    {"title": "ai-2", "link": "", "source": "Q", "description": "Frischer Text " * 30},
                ],
            },
        },
    }
    tmp_dir = Path(tempfile.mkdtemp())
    cache = engine.ArticleCache(tmp_dir / "cache.json")
    eng = engine.ArticleBriefingEngine(cache)
    eng.builder = engine.BriefingBuilder(client=_FakeClient(content=None))
    for article in payload["categories"]["ai"]["articles"][:2]:
        cache.set(article["link"], {
            "_cache_version": engine.CACHE_VERSION,
            "_fingerprint": eng._content_fingerprint(article),
            "summary": "aus dem Cache",
            "enrichment_method": "llm",
            "processing_status": "complete",
        })
    stats_path = tmp_dir / "enrichment-stats.json"

    result = _run(eng, payload, workers=2, stats_path=stats_path)

    stats = json.loads(stats_path.read_text())
    assert stats["articles"] == 3, stats
    assert stats["cache_hits"] == 2, stats
    assert stats["llm_status"] == "failed", stats
    assert (stats["llm_calls"], stats["llm_responses"], stats["llm_briefings"]) == (1, 0, 0), stats
    assert "0 of 1" in stats["summary"], stats["summary"]
    assert stats["llm_last_error"] == "teamo-pro: request failed: HTTP 401"
    methods = [a.get("enrichment_method") for a in result["categories"]["ai"]["articles"]]
    assert methods == ["llm", "llm", "heuristic"], methods


def test_heuristic_cache_entry_is_retried_not_served():
    """Ein Heuristik-Eintrag im Cache darf kein Treffer sein.

    Sonst friert der Cache jeden LLM-Ausfall ein: der Artikel bekommt bei
    jedem Lauf wieder den Fallback, solange sich der Fingerprint nicht
    aendert (Parallellauf 2026-09-02: 52/102 heuristic aus vergiftetem Cache).
    """
    payload = {
        "generated": "2026-09-02T05:30:00Z",
        "categories": {
            "ai": {
                "name": "AI",
                "articles": [
                    {"title": "ai-0", "link": "cached://ai/0", "source": "Q", "description": "Text " * 30},
                    {"title": "ai-1", "link": "cached://ai/1", "source": "Q", "description": "Text " * 30},
                ],
            },
        },
    }
    tmp_dir = Path(tempfile.mkdtemp())
    cache = engine.ArticleCache(tmp_dir / "cache.json")
    eng = engine.ArticleBriefingEngine(cache)
    eng.builder = engine.BriefingBuilder(client=_FakeClient(content=None))
    complete, heuristic = payload["categories"]["ai"]["articles"]
    cache.set(complete["link"], {
        "_cache_version": engine.CACHE_VERSION,
        "_fingerprint": eng._content_fingerprint(complete),
        "summary": "aus dem Cache",
        "enrichment_method": "llm",
        "processing_status": "complete",
    })
    cache.set(heuristic["link"], {
        "_cache_version": engine.CACHE_VERSION,
        "_fingerprint": eng._content_fingerprint(heuristic),
        "summary": "vergifteter Fallback",
        "enrichment_method": "heuristic",
        "processing_status": "heuristic",
    })
    stats_path = tmp_dir / "enrichment-stats.json"

    result = _run(eng, payload, workers=1, stats_path=stats_path)

    stats = json.loads(stats_path.read_text())
    assert stats["cache_hits"] == 1, stats
    assert stats["llm_calls"] == 1, stats
    summaries = [a.get("summary") for a in result["categories"]["ai"]["articles"]]
    assert summaries[0] == "aus dem Cache", summaries
    assert summaries[1] != "vergifteter Fallback", summaries


def test_main_writes_stats_next_to_enriched_output():
    """Der Shell-Orchestrator erwartet output/enrichment-stats.json neben enriched-articles.json."""
    tmp_dir = Path(tempfile.mkdtemp())
    raw_path = tmp_dir / "raw-articles.json"
    out_path = tmp_dir / "enriched-articles.json"
    raw_path.write_text(json.dumps({
        "generated": "2026-09-01T05:30:00Z",
        "categories": {"ai": {"name": "AI", "articles": [
            {"title": "ai-0", "link": "", "source": "Q", "description": "Frischer Text " * 30},
        ]}},
    }))
    saved_argv, saved_client = sys.argv, engine.OpenClawChatClient
    sys.argv = ["article_briefing_engine.py", str(raw_path), str(out_path), str(tmp_dir / "cache.json")]
    engine.OpenClawChatClient = lambda: _FakeClient(content=None)
    try:
        rc = engine.main()
    finally:
        sys.argv, engine.OpenClawChatClient = saved_argv, saved_client

    assert rc == 0
    assert out_path.exists()
    stats = json.loads((tmp_dir / "enrichment-stats.json").read_text())
    assert stats["llm_status"] == "failed", stats

if __name__ == "__main__":
    names = [n for n in sorted(globals()) if n.startswith("test_")]
    for name in names:
        globals()[name]()
        print(f"  ok  {name}")
    print(f"ALL {len(names)} TESTS PASS")


# ---------------------------------------------------------------------------
# Spec-Generierung: Budget des Shell-Schritts (BRAKEFAST_SPEC_TIMEOUT_SEC)
# wird als Deadline an die Provider-Kette gereicht.
# ---------------------------------------------------------------------------

import time  # noqa: E402


def test_spec_budget_comes_from_the_same_env_as_the_shell_step():
    saved = os.environ.get("BRAKEFAST_SPEC_TIMEOUT_SEC")
    try:
        for raw, want in (("600", 600), ("300", 300), ("abc", 300), ("", 300), ("0", 300), ("-5", 300)):
            os.environ["BRAKEFAST_SPEC_TIMEOUT_SEC"] = raw
            assert engine._spec_budget_seconds() == want, (raw, engine._spec_budget_seconds())
        os.environ.pop("BRAKEFAST_SPEC_TIMEOUT_SEC", None)
        assert engine._spec_budget_seconds() == 300
    finally:
        if saved is None:
            os.environ.pop("BRAKEFAST_SPEC_TIMEOUT_SEC", None)
        else:
            os.environ["BRAKEFAST_SPEC_TIMEOUT_SEC"] = saved


def test_curation_spec_passes_a_deadline_inside_the_budget():
    tmp_dir = Path(tempfile.mkdtemp())
    enriched = tmp_dir / "enriched.json"
    enriched.write_text(json.dumps({"categories": {"ai": {"articles": [
        {"title": "ai-0", "source": "Q", "summary": "Text", "published_at": "2026-09-10T05:00:00Z"},
    ]}}}))
    calls: list[dict] = []

    class _RecordingClient(_FakeClient):
        def complete_json(self, **kwargs):
            calls.append(kwargs)
            return None

    saved_client, saved_env = engine.OpenClawChatClient, os.environ.get("BRAKEFAST_SPEC_TIMEOUT_SEC")
    engine.OpenClawChatClient = lambda: _RecordingClient(content=None)
    os.environ["BRAKEFAST_SPEC_TIMEOUT_SEC"] = "600"
    try:
        started = time.monotonic()
        rc = engine.generate_curation_spec(enriched, tmp_dir / "spec.json")
    finally:
        engine.OpenClawChatClient = saved_client
        if saved_env is None:
            os.environ.pop("BRAKEFAST_SPEC_TIMEOUT_SEC", None)
        else:
            os.environ["BRAKEFAST_SPEC_TIMEOUT_SEC"] = saved_env

    assert rc == 1
    assert len(calls) == 1
    assert calls[0]["timeout"] == 150
    budget_left = calls[0]["deadline"] - started
    assert 570 <= budget_left < 571, budget_left  # 600 s minus 30 s Reserve, plus Messzeit


# ---------------------------------------------------------------------------
# Eigene Provider-Kette fuer die Kurations-Spec (BRAKEFAST_SPEC_PROVIDER_CHAIN).
# ---------------------------------------------------------------------------

import contextlib  # noqa: E402
import io  # noqa: E402


class _ChainRecordingClient(_FakeClient):
    """Merkt sich, mit welcher Kette die Engine den Client baut."""

    def __init__(self, providers=None, **kwargs):
        super().__init__(**kwargs)
        self.providers = providers

    def describe_chain(self):
        if self.providers:
            return " -> ".join(p.label for p in self.providers)
        return "text-a -> text-b"


def _with_env(**values):
    saved = {key: os.environ.get(key) for key in values}
    for key, value in values.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    return saved


def _restore_env(saved):
    for key, value in saved.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def _spec_chain_json(*names):
    return json.dumps([
        {"name": name, "base_url": "http://example.invalid/v1", "api_key": "k", "model": f"model-{name}"}
        for name in names
    ])


def test_spec_client_uses_the_text_chain_without_spec_variable():
    saved_client = engine.OpenClawChatClient
    saved_env = _with_env(BRAKEFAST_SPEC_PROVIDER_CHAIN=None)
    engine.OpenClawChatClient = _ChainRecordingClient
    try:
        client, source = engine._spec_client()
    finally:
        engine.OpenClawChatClient = saved_client
        _restore_env(saved_env)

    assert client.providers is None
    assert source == "text chain"


def test_spec_client_prefers_the_spec_chain():
    saved_client = engine.OpenClawChatClient
    saved_env = _with_env(BRAKEFAST_SPEC_PROVIDER_CHAIN=_spec_chain_json("flash", "mini"))
    engine.OpenClawChatClient = _ChainRecordingClient
    try:
        client, source = engine._spec_client()
    finally:
        engine.OpenClawChatClient = saved_client
        _restore_env(saved_env)

    assert [p.label for p in client.providers] == ["flash:model-flash", "mini:model-mini"]
    assert source == "spec chain"


def test_spec_client_warns_and_falls_back_when_spec_chain_is_unusable():
    saved_client = engine.OpenClawChatClient
    saved_env = _with_env(BRAKEFAST_SPEC_PROVIDER_CHAIN=json.dumps([{"name": "no-key", "base_url": "http://x", "model": "m"}]))
    engine.OpenClawChatClient = _ChainRecordingClient
    captured = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured):
            client, source = engine._spec_client()
    finally:
        engine.OpenClawChatClient = saved_client
        _restore_env(saved_env)

    assert client.providers is None
    assert source == "text chain"
    assert "WARN: BRAKEFAST_SPEC_PROVIDER_CHAIN" in captured.getvalue()


def test_curation_spec_reports_which_chain_it_used():
    tmp_dir = Path(tempfile.mkdtemp())
    enriched = tmp_dir / "enriched.json"
    enriched.write_text(json.dumps({"categories": {"ai": {"articles": [
        {"title": "ai-0", "source": "Q", "summary": "Text", "published_at": "2026-09-10T05:00:00Z"},
    ]}}}))
    saved_client = engine.OpenClawChatClient
    saved_env = _with_env(BRAKEFAST_SPEC_PROVIDER_CHAIN=_spec_chain_json("flash", "mini"))
    engine.OpenClawChatClient = _ChainRecordingClient
    captured = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured):
            rc = engine.generate_curation_spec(enriched, tmp_dir / "spec.json")
    finally:
        engine.OpenClawChatClient = saved_client
        _restore_env(saved_env)

    assert rc == 1  # Fake-Client liefert nichts; hier zaehlt nur die Kettenwahl
    assert "spec chain: flash:model-flash -> mini:model-mini" in captured.getvalue()
