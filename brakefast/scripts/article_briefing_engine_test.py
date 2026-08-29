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


def _run(eng, payload, workers, checkpoint_path=None):
    previous = os.environ.get("BRAKEFAST_ENRICHMENT_WORKERS")
    os.environ["BRAKEFAST_ENRICHMENT_WORKERS"] = str(workers)
    try:
        return eng.enrich(payload, checkpoint_path=checkpoint_path)
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


if __name__ == "__main__":
    names = [n for n in sorted(globals()) if n.startswith("test_")]
    for name in names:
        globals()[name]()
        print(f"  ok  {name}")
    print(f"ALL {len(names)} TESTS PASS")
