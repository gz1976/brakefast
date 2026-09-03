"""Structural regression tests for the BrakeFast shell orchestrator."""

import subprocess
from pathlib import Path


SCRIPT = Path(__file__).with_name("brakefast-daily.sh")


def test_shell_syntax_is_valid():
    result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_exit_finalizer_is_installed_after_lock_and_before_pipeline_work():
    text = SCRIPT.read_text()

    assert text.index("flock -n 9") < text.index("trap finalize_pipeline EXIT")
    assert text.index("trap finalize_pipeline EXIT") < text.index("Self-heal Python deps")
    assert 'rm -f -- "$LOCK_FILE"' in text
    assert '"$RUN_STARTED_AT" "$RUN_EDITION_DATE" "$rc"' in text


def test_signal_traps_preserve_conventional_failure_exit_codes():
    text = SCRIPT.read_text()

    assert "trap 'exit 130' INT" in text
    assert "trap 'exit 143' TERM" in text
    assert "trap 'exit 129' HUP" in text


def test_skip_publish_does_not_overwrite_public_telemetry():
    text = SCRIPT.read_text()

    assert 'if [ "$PUBLISH_ENABLED" -eq 1 ] && [ -f "$TELEMETRY_WRITER" ]; then' in text


# ---------------------------------------------------------------------------
# LLM-Bilanz nach dem Enrichment (Befund 31.08.-01.09.2026: alle Provider
# HTTP 401, Pipeline lief still auf Heuristik/Auto weiter, Telemetrie ok).
# ---------------------------------------------------------------------------

import json  # noqa: E402


def _shell_function(name):
    text = SCRIPT.read_text()
    start = text.index(f"\n{name}() {{\n") + 1
    end = text.index("\n}\n", start) + 3
    return text[start:end]


def _run_helper(name, tmp_path, stats, *args):
    stats_file = tmp_path / "enrichment-stats.json"
    if stats is not None:
        stats_file.write_text(json.dumps(stats))
    script = f'ENRICHMENT_STATS="{stats_file}"\n{_shell_function(name)}\n{name} "$@"\n'
    result = subprocess.run(["bash", "-c", script, "bash", *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_enrichment_stat_reads_one_field_from_the_stats_file(tmp_path):
    stats = {"llm_status": "failed", "llm_calls": 62}

    assert _run_helper("enrichment_stat", tmp_path, stats, "llm_status") == "failed"
    assert _run_helper("enrichment_stat", tmp_path, stats, "llm_calls") == "62"
    assert _run_helper("enrichment_stat", tmp_path, stats, "missing") == ""


def test_enrichment_stat_is_empty_without_stats_file(tmp_path):
    assert _run_helper("enrichment_stat", tmp_path, None, "llm_status") == ""


def test_enrichment_step_fields_is_a_json_fragment_for_the_step_summary(tmp_path):
    stats = {
        "llm_status": "failed", "llm_calls": 62, "llm_responses": 0, "llm_briefings": 0,
        "cache_hits": 40, "llm_last_error": 'request failed: HTTP 401: {"error":"x"}',
        "summary": "not part of the step entry",
    }

    fragment = _run_helper("enrichment_step_fields", tmp_path, stats)

    assert json.loads("{" + fragment + "}") == {k: v for k, v in stats.items() if k != "summary"}


def test_enrichment_step_fields_marks_unknown_without_stats_file(tmp_path):
    fragment = _run_helper("enrichment_step_fields", tmp_path, None)

    assert json.loads("{" + fragment + "}") == {"llm_status": "unknown"}


def test_dead_llm_chain_degrades_the_enrichment_step_and_alerts():
    text = SCRIPT.read_text()

    # Stale Bilanz von gestern darf nie in den heutigen Lauf einfliessen.
    assert text.index('rm -f -- "$ENRICHMENT_STATS"') < text.index('python3 "$ENGINE_SCRIPT" "$RAW_FILE"')
    # Beide "kein brauchbares Briefing"-Faelle gelten als degraded.
    assert "failed|unavailable)" in text
    assert '\\"status\\": \\"degraded\\", $(enrichment_step_fields)' in text
    assert '\\"status\\": \\"complete\\", $(enrichment_step_fields)' in text
    # Der bestehende Telegram-Alert muss anschlagen, bevor die Kuratierung weiterlaeuft.
    alert_at = text.index('send_telegram_alert "⚠️ BrakeFast Enrichment DEGRADED')
    assert text.index('python3 "$ENGINE_SCRIPT" "$RAW_FILE"') < alert_at < text.index('log "Step 2: Curating articles..."')


# ---------------------------------------------------------------------------
# Kalender-Fetch (Befund 02.09.2026: HTTP 500, leere Kalender-Dateien, keine Warnung).
# ---------------------------------------------------------------------------

def test_calendar_status_is_reset_before_the_calendar_fetch():
    text = SCRIPT.read_text()

    # Status von gestern darf nicht in die heutige Telemetrie einfliessen.
    assert text.index('rm -f -- "$CALENDAR_STATUS"') < text.index('python3 "$CALENDAR_SCRIPT"')


def test_crashed_calendar_fetch_keeps_the_previous_calendar_files():
    text = SCRIPT.read_text()

    assert '[ -f "$CALENDAR_JSON" ] || echo "[]" > "$CALENDAR_JSON"' in text
    assert '[ -f "$CALENDAR_PRIVATE_JSON" ] || echo "[]" > "$CALENDAR_PRIVATE_JSON"' in text
