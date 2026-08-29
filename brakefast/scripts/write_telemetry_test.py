"""Tests for the public BrakeFast pipeline telemetry writer."""

import json
import os
from datetime import datetime, timezone

import write_telemetry as telemetry


def _configure_paths(monkeypatch, tmp_path):
    output = tmp_path / "output"
    public = tmp_path / "public"
    output.mkdir()
    public.mkdir()
    monkeypatch.setattr(telemetry, "OUTPUT_DIR", output)
    monkeypatch.setattr(telemetry, "PUBLIC_DIR", public)
    monkeypatch.setattr(telemetry, "TELEMETRY_PATH", public / "pipeline-telemetry.json")
    monkeypatch.setattr(telemetry, "DATA_JSON_PATH", public / "data.json")
    monkeypatch.setattr(telemetry, "RUN_JSON_PATH", output / "pipeline-run.json")
    monkeypatch.setattr(telemetry, "FALLBACK_MARKER", output / ".fallback_used")
    monkeypatch.setattr(telemetry, "CURATED_PATH", output / "curated-articles.json")
    monkeypatch.setattr(telemetry, "ENRICHED_PATH", output / "enriched-articles.json")
    monkeypatch.setattr(telemetry, "FINAL_PATH", output / "final-data.json")
    return output, public


def _successful_entries():
    return [
        {"step": "fetch-feeds", "articles": 80},
        {"step": "enrichment", "status": "complete"},
        {"step": "curation", "mode": "llm"},
        {"step": "validation", "passed": True},
        {"step": "publish", "passed": True},
        {"step": "smoke-test", "passed": True},
    ]


def test_success_counts_nested_enriched_articles(monkeypatch, tmp_path):
    output, public = _configure_paths(monkeypatch, tmp_path)
    (output / "pipeline-run.json").write_text(json.dumps(_successful_entries()))
    (output / "curated-articles.json").write_text(json.dumps({"totalArticles": 37}))
    (output / "enriched-articles.json").write_text(json.dumps({
        "categories": {
            "ai": {"articles": [{}, {}]},
            "tech": {"articles": [{}, {}, {}]},
        }
    }))
    data_path = public / "data.json"
    data_path.write_text("{}")
    os.utime(data_path, (100, 100))

    result = telemetry.build_telemetry(
        "1970-01-01T00:01:00+00:00",
        "1970-01-01",
        ended_at=datetime.fromtimestamp(120, tz=timezone.utc),
    )

    assert result["last_run"]["publish_status"] == "ok"
    assert result["last_run"]["enriched_count"] == 5
    assert result["last_run"]["curated_count"] == 37


def test_nonzero_exit_records_failed_run_and_first_missing_step(monkeypatch, tmp_path):
    output, public = _configure_paths(monkeypatch, tmp_path)
    (output / "pipeline-run.json").write_text(json.dumps([
        {"step": "fetch-feeds", "articles": 80},
    ]))
    (output / "curated-articles.json").write_text(json.dumps({"totalArticles": 37}))
    (public / "data.json").write_text("{}")

    result = telemetry.build_telemetry("2026-08-10T05:30:00Z", "2026-08-10", exit_code=1)

    assert result["last_run"]["publish_status"] == "failed"
    assert result["last_run"]["exit_code"] == 1
    assert result["last_run"]["failing_step"] == "enrichment"


def test_same_day_update_does_not_duplicate_history(monkeypatch, tmp_path):
    _output, public = _configure_paths(monkeypatch, tmp_path)
    (public / "pipeline-telemetry.json").write_text(json.dumps({
        "last_run": {"edition_date": "2026-08-10", "publish_status": "failed"},
        "history": [
            {"edition_date": "2026-08-10", "publish_status": "failed"},
            {"edition_date": "2026-08-09", "publish_status": "ok"},
        ],
    }))

    assert telemetry.load_history("2026-08-10") == [
        {"edition_date": "2026-08-09", "publish_status": "ok"},
    ]


def test_warnings_are_structured_and_secrets_are_redacted(monkeypatch, tmp_path):
    output, _public = _configure_paths(monkeypatch, tmp_path)
    (output / "final-data.json").write_text(json.dumps({
        "meta": {
            "warnings": [
                "Source failed https://example.com/feed?token=secret",
                "api_key=super-secret",
            ]
        }
    }))

    warnings = telemetry.collect_warnings([])

    assert warnings == [
        "Source failed https://example.com/feed?[redacted]",
        "api_key=[redacted]",
    ]


def test_write_uses_atomic_replace(monkeypatch, tmp_path):
    _output, public = _configure_paths(monkeypatch, tmp_path)
    calls = []
    real_replace = os.replace

    def recording_replace(source, destination):
        calls.append((source, destination))
        real_replace(source, destination)

    monkeypatch.setattr(telemetry.os, "replace", recording_replace)
    payload = {"last_run": {"publish_status": "ok"}, "history": []}

    telemetry.write_telemetry(payload)

    assert len(calls) == 1
    assert calls[0][1] == public / "pipeline-telemetry.json"
    assert json.loads((public / "pipeline-telemetry.json").read_text()) == payload
