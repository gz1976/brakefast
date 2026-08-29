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
