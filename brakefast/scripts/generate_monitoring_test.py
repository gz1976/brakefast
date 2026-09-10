"""Regression tests for truthful monitoring system metrics."""

import json
import importlib.util
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("generate-monitoring.py")
SPEC = importlib.util.spec_from_file_location("generate_monitoring", MODULE_PATH)
monitoring = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(monitoring)


def test_host_container_count_wins(monkeypatch):
    monkeypatch.setenv("BRAKEFAST_HOST_CONTAINER_COUNT", "13")

    assert monitoring.get_system_info()["containers"] == 13


def test_missing_docker_does_not_fall_back_to_agent_count(monkeypatch):
    monkeypatch.delenv("BRAKEFAST_HOST_CONTAINER_COUNT", raising=False)

    def unavailable(*_args, **_kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(monitoring.subprocess, "run", unavailable)

    assert monitoring.get_system_info()["containers"] == 0


def test_activity_does_not_invent_worker_heartbeats():
    activity = monitoring.build_activity_7d([])

    assert all(day["worker"] == 0 for day in activity)


def test_explicit_zero_heartbeat_is_reported_as_disabled(monkeypatch, tmp_path):
    (tmp_path / "openclaw.json").write_text(json.dumps({
        "agents": {"defaults": {"heartbeat": {"every": "0m"}}}
    }))
    monkeypatch.setattr(monitoring, "BASE", str(tmp_path))

    assert not monitoring.heartbeat_is_enabled()


def test_audit_timestamp_is_real_utc():
    assert monitoring.utc_iso_from_millis(0) == "1970-01-01T00:00:00Z"
