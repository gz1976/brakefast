#!/usr/bin/env python3
"""Write public, structured telemetry for one BrakeFast pipeline run."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


OUTPUT_DIR = Path(os.environ.get(
    "BRAKEFAST_OUTPUT_DIR",
    "/data/.openclaw/workspace/brakefast/output",
))
PUBLIC_DIR = Path(os.environ.get("BRAKEFAST_PUBLIC_DIR", "/data/brakefast-public"))
TELEMETRY_PATH = PUBLIC_DIR / "pipeline-telemetry.json"
DATA_JSON_PATH = PUBLIC_DIR / "data.json"
RUN_JSON_PATH = OUTPUT_DIR / "pipeline-run.json"
FALLBACK_MARKER = OUTPUT_DIR / ".fallback_used"
CURATED_PATH = OUTPUT_DIR / "curated-articles.json"
ENRICHED_PATH = OUTPUT_DIR / "enriched-articles.json"
FINAL_PATH = OUTPUT_DIR / "final-data.json"
HISTORY_LIMIT = 14

STEP_ORDER = [
    "fetch-feeds",
    "enrichment",
    "curation",
    "validation",
    "publish",
    "smoke-test",
]


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, TypeError):
        return default


def load_run_entries() -> list[dict[str, Any]]:
    entries = _read_json(RUN_JSON_PATH, [])
    return [entry for entry in entries if isinstance(entry, dict)] if isinstance(entries, list) else []


def step_succeeded(entry: dict[str, Any]) -> bool:
    name = entry.get("step", "")
    if name == "fetch-feeds":
        return int(entry.get("articles", 0)) > 0
    if name == "enrichment":
        # "degraded" (kein brauchbares LLM-Briefing), "timeout" und "failed"
        # gelten als nicht bestanden, auch wenn die Edition publiziert wurde.
        return entry.get("status") == "complete"
    if name == "curation":
        return entry.get("mode") in ("llm", "auto-fallback", "auto")
    if name in ("validation", "publish"):
        return bool(entry.get("passed", True))
    if name == "smoke-test":
        return bool(entry.get("passed", False))
    return True


def determine_failing_step(
    entries: list[dict[str, Any]],
    data_json_fresh: bool,
    exit_code: int,
) -> str | None:
    seen = {entry.get("step"): entry for entry in entries}
    for step in STEP_ORDER:
        entry = seen.get(step)
        if entry is not None and not step_succeeded(entry):
            return step
        if entry is None and (exit_code != 0 or not data_json_fresh):
            return step
    return None


def _count_nested_articles(data: Any) -> int:
    if isinstance(data, list):
        return len(data)
    if not isinstance(data, dict):
        return 0
    try:
        declared = int(data.get("totalArticles", 0))
    except (TypeError, ValueError):
        declared = 0
    if declared > 0:
        return declared
    categories = data.get("categories", {})
    if isinstance(categories, dict):
        return sum(
            len(value.get("articles", []))
            for value in categories.values()
            if isinstance(value, dict) and isinstance(value.get("articles", []), list)
        )
    articles = data.get("articles", [])
    return len(articles) if isinstance(articles, list) else 0


def get_article_count(path: Path) -> int:
    return _count_nested_articles(_read_json(path, {}))


def _redact_warning(value: Any) -> str:
    text = str(value).strip()[:500]
    text = re.sub(r"(https?://[^\s?#]+)[?#][^\s]+", r"\1?[redacted]", text)
    text = re.sub(
        r"(?i)\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*\S+",
        r"\1=[redacted]",
        text,
    )
    return text[:300]


def _describe_failed_step(entry: dict[str, Any]) -> str:
    text = f"{entry.get('step', 'unknown')}: {entry.get('status', 'failed')}"
    llm_status = entry.get("llm_status")
    if llm_status:
        text += (
            f" (llm_status={llm_status}, "
            f"{entry.get('llm_briefings', 0)}/{entry.get('llm_calls', 0)} LLM calls usable"
        )
        if entry.get("llm_last_error"):
            text += f"; last error: {entry['llm_last_error']}"
        text += ")"
    return text


def collect_warnings(entries: list[dict[str, Any]], limit: int = 25) -> list[str]:
    """Collect only structured current-run warnings; never expose raw logs."""
    warnings: list[str] = []
    final_data = _read_json(FINAL_PATH, {})
    if not isinstance(final_data, dict):
        final_data = _read_json(DATA_JSON_PATH, {})
    meta_warnings = final_data.get("meta", {}).get("warnings", []) if isinstance(final_data, dict) else []
    if isinstance(meta_warnings, list):
        warnings.extend(_redact_warning(item) for item in meta_warnings if item)

    for entry in entries:
        if not step_succeeded(entry):
            warnings.append(_redact_warning(_describe_failed_step(entry)))
        issues = entry.get("issues")
        if issues:
            warnings.append(_redact_warning(issues))
    return list(dict.fromkeys(warnings))[:limit]


def load_history(current_edition_date: str) -> list[dict[str, Any]]:
    existing = _read_json(TELEMETRY_PATH, {})
    if not isinstance(existing, dict):
        return []
    history = [
        entry for entry in existing.get("history", [])
        if isinstance(entry, dict) and entry.get("edition_date") != current_edition_date
    ]
    previous = existing.get("last_run")
    if isinstance(previous, dict) and previous.get("edition_date") != current_edition_date:
        summary_keys = (
            "edition_date", "publish_status", "duration_seconds", "fetch_count",
            "enriched_count", "curated_count", "fallback_used", "failing_step",
            "exit_code", "llm_status",
        )
        summary = {key: previous.get(key) for key in summary_keys}
        history = [entry for entry in history if entry.get("edition_date") != summary.get("edition_date")]
        history.insert(0, summary)
    return history[:HISTORY_LIMIT]


def _entry_count(entries: list[dict[str, Any]], step: str, key: str) -> int:
    for entry in entries:
        if entry.get("step") == step:
            try:
                return int(entry.get(key, 0))
            except (TypeError, ValueError):
                return 0
    return 0


def _entry_field(entries: list[dict[str, Any]], step: str, key: str) -> Any:
    for entry in entries:
        if entry.get("step") == step:
            return entry.get(key)
    return None


def build_telemetry(
    started_at: str,
    edition_date: str,
    exit_code: int = 0,
    ended_at: datetime | None = None,
) -> dict[str, Any]:
    ended_at_dt = ended_at or datetime.now(timezone.utc)
    if ended_at_dt.tzinfo is None:
        ended_at_dt = ended_at_dt.replace(tzinfo=timezone.utc)
    try:
        started_at_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        if started_at_dt.tzinfo is None:
            started_at_dt = started_at_dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        started_at_dt = ended_at_dt
    duration = max(0, int((ended_at_dt - started_at_dt).total_seconds()))

    entries = load_run_entries()
    fetch_count = _entry_count(entries, "fetch-feeds", "articles")
    enriched_count = get_article_count(ENRICHED_PATH)
    curated_count = get_article_count(CURATED_PATH)
    fallback_used = FALLBACK_MARKER.exists()

    data_json_fresh = False
    try:
        data_mtime = datetime.fromtimestamp(DATA_JSON_PATH.stat().st_mtime, tz=timezone.utc)
        data_json_fresh = data_mtime >= started_at_dt.astimezone(timezone.utc)
    except OSError:
        pass

    failing_step = determine_failing_step(entries, data_json_fresh, exit_code)
    if exit_code != 0 or not data_json_fresh:
        publish_status = "failed"
    elif curated_count < 20 or failing_step is not None or fallback_used:
        publish_status = "partial"
    else:
        publish_status = "ok"

    last_run = {
        "edition_date": edition_date,
        "started_at": started_at_dt.astimezone(timezone.utc).isoformat(),
        "ended_at": ended_at_dt.astimezone(timezone.utc).isoformat(),
        "duration_seconds": duration,
        "publish_status": publish_status,
        "exit_code": exit_code,
        "fetch_count": fetch_count,
        "enriched_count": enriched_count,
        "curated_count": curated_count,
        "fallback_used": fallback_used,
        "failing_step": failing_step,
        "llm_status": _entry_field(entries, "enrichment", "llm_status"),
        "warnings": collect_warnings(entries),
        "steps": entries,
    }
    return {
        "last_run": last_run,
        "history": load_history(current_edition_date=edition_date),
    }


def write_telemetry(telemetry: dict[str, Any]) -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    temp_name = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=PUBLIC_DIR,
            prefix=".pipeline-telemetry.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_name = handle.name
            json.dump(telemetry, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, 0o644)
        os.replace(temp_name, TELEMETRY_PATH)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "usage: write_telemetry.py <started_at_iso> [<edition_date>] [<exit_code>]",
            file=sys.stderr,
        )
        return 2
    started_at = argv[1]
    edition_date = argv[2] if len(argv) >= 3 else datetime.now().astimezone().strftime("%Y-%m-%d")
    try:
        exit_code = int(argv[3]) if len(argv) >= 4 else 0
    except ValueError:
        print("exit_code must be an integer", file=sys.stderr)
        return 2
    telemetry = build_telemetry(started_at, edition_date, exit_code)
    write_telemetry(telemetry)
    run = telemetry["last_run"]
    print(
        f"[telemetry] status={run['publish_status']} curated={run['curated_count']} "
        f"exit={run['exit_code']} failing={run['failing_step']} llm={run['llm_status']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
