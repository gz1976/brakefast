"""Tests for the Google-Calendar ICS fetcher (retry, stale fallback, status file)."""

import importlib.util
import json
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path

import pytest


def _load_module():
    # The script is called fetch-calendar.py (hyphen), so it needs an explicit loader.
    path = Path(__file__).with_name("fetch-calendar.py")
    spec = importlib.util.spec_from_file_location("fetch_calendar", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fetch_calendar = _load_module()


def _http_error(code=500, reason="Internal Server Error"):
    return urllib.error.HTTPError("https://example.invalid/basic.ics", code, reason, {}, None)


# ---------------------------------------------------------------------------
# Befund 02.09.2026 05:30: HTTP 500 beim ersten Versuch, 10 s spaeter 45 Events.
# ---------------------------------------------------------------------------

def test_fetch_retries_transient_error_with_backoff(monkeypatch):
    calls = []

    def flaky_fetch(url):
        calls.append(url)
        if len(calls) < 3:
            raise _http_error()
        return "BEGIN:VCALENDAR"

    sleeps = []
    monkeypatch.setattr(fetch_calendar, "_fetch_ics", flaky_fetch)
    monkeypatch.setattr(fetch_calendar, "sleep", sleeps.append)

    text = fetch_calendar._fetch_ics_with_retry("https://example.invalid/basic.ics", "privat")

    assert text == "BEGIN:VCALENDAR"
    assert len(calls) == 3
    assert sleeps == [5, 10]


def test_fetch_gives_up_after_three_attempts(monkeypatch):
    calls = []

    def broken_fetch(url):
        calls.append(url)
        raise _http_error()

    sleeps = []
    monkeypatch.setattr(fetch_calendar, "_fetch_ics", broken_fetch)
    monkeypatch.setattr(fetch_calendar, "sleep", sleeps.append)

    with pytest.raises(urllib.error.HTTPError):
        fetch_calendar._fetch_ics_with_retry("https://example.invalid/basic.ics", "privat")

    assert len(calls) == 3
    assert sleeps == [5, 10]


def test_error_description_never_contains_the_secret_url():
    secret = "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics"

    assert fetch_calendar._describe_error(_http_error()) == "HTTP 500 Internal Server Error"
    assert fetch_calendar._describe_error(ValueError(f"unknown url type: '{secret}'")) == "ValueError"
    assert "google" not in fetch_calendar._describe_error(
        urllib.error.URLError(OSError("[Errno 8] nodename nor servname provided"))
    )


# ---------------------------------------------------------------------------
# main(): stale fallback + status file
# ---------------------------------------------------------------------------

PRIVAT_URL = "https://example.invalid/privat.ics"
ARBEIT_URL = "https://example.invalid/arbeit.ics"


def _configure(monkeypatch, tmp_path, sources):
    output = tmp_path / "output"
    monkeypatch.setattr(fetch_calendar, "OUTPUT_DIR", output)
    monkeypatch.setattr(fetch_calendar, "PUBLIC_FILE", output / "calendar-events.json")
    monkeypatch.setattr(fetch_calendar, "PRIVATE_FILE", output / "calendar-events-private.json")
    monkeypatch.setattr(fetch_calendar, "STATUS_FILE", output / "calendar-fetch-status.json")
    monkeypatch.setattr(fetch_calendar, "sleep", lambda _seconds: None)
    monkeypatch.setenv("BRAKEFAST_CALENDAR_SOURCES", json.dumps(sources))
    return output


def _write_previous_files(output):
    output.mkdir()
    public = [{"date": "2026-09-01", "time": "09:00", "end": "10:00", "kind": "privat"}]
    private = [dict(public[0], title="Zahnarzt", location="", description="")]
    (output / "calendar-events.json").write_text(json.dumps(public))
    (output / "calendar-events-private.json").write_text(json.dumps(private))
    return public, private


def _read(output, name):
    return json.loads((output / name).read_text())


def _fail_for(*urls):
    def fake_fetch(url):
        if url in urls:
            raise _http_error()
        return "BEGIN:VCALENDAR"
    return fake_fetch


def _one_fresh_event(monkeypatch):
    start = datetime.now(fetch_calendar.VIENNA_TZ).replace(hour=9, minute=0, second=0, microsecond=0)
    event = {"start": start, "end": start + timedelta(hours=1), "title": "Zahnarzt",
             "location": "", "description": ""}
    monkeypatch.setattr(fetch_calendar, "_parse_events", lambda *_args: [dict(event)])
    return start


def test_main_keeps_previous_files_when_every_attempt_fails(monkeypatch, tmp_path):
    output = _configure(monkeypatch, tmp_path, [{"url": PRIVAT_URL, "kind": "privat"}])
    public, private = _write_previous_files(output)
    monkeypatch.setattr(fetch_calendar, "_fetch_ics", _fail_for(PRIVAT_URL))

    assert fetch_calendar.main() == 0

    assert _read(output, "calendar-events.json") == public
    assert _read(output, "calendar-events-private.json") == private
    status = _read(output, "calendar-fetch-status.json")
    assert status["failed_sources"] == ["privat"]
    assert status["errors"] == {"privat": "HTTP 500 Internal Server Error"}
    assert status["attempts"] == 3
    assert status["kept_previous"] is True


def test_main_keeps_previous_files_when_one_of_two_sources_fails(monkeypatch, tmp_path):
    output = _configure(monkeypatch, tmp_path, [
        {"url": PRIVAT_URL, "kind": "privat"},
        {"url": ARBEIT_URL, "kind": "arbeit"},
    ])
    public, private = _write_previous_files(output)
    monkeypatch.setattr(fetch_calendar, "_fetch_ics", _fail_for(ARBEIT_URL))
    _one_fresh_event(monkeypatch)

    assert fetch_calendar.main() == 0

    assert _read(output, "calendar-events.json") == public
    assert _read(output, "calendar-events-private.json") == private
    assert _read(output, "calendar-fetch-status.json")["failed_sources"] == ["arbeit"]


def test_main_writes_empty_files_when_fetch_fails_and_nothing_was_fetched_before(monkeypatch, tmp_path):
    output = _configure(monkeypatch, tmp_path, [{"url": PRIVAT_URL, "kind": "privat"}])
    monkeypatch.setattr(fetch_calendar, "_fetch_ics", _fail_for(PRIVAT_URL))

    assert fetch_calendar.main() == 0

    assert _read(output, "calendar-events.json") == []
    assert _read(output, "calendar-events-private.json") == []
    status = _read(output, "calendar-fetch-status.json")
    assert status["failed_sources"] == ["privat"]
    assert status["kept_previous"] is False


def test_main_writes_fresh_events_once_a_retry_succeeds(monkeypatch, tmp_path):
    output = _configure(monkeypatch, tmp_path, [{"url": PRIVAT_URL, "kind": "privat"}])
    _write_previous_files(output)
    calls = []

    def flaky_fetch(url):
        calls.append(url)
        if len(calls) == 1:
            raise _http_error()
        return "BEGIN:VCALENDAR"

    monkeypatch.setattr(fetch_calendar, "_fetch_ics", flaky_fetch)
    start = _one_fresh_event(monkeypatch)

    assert fetch_calendar.main() == 0

    day = start.strftime("%Y-%m-%d")
    assert _read(output, "calendar-events.json") == [
        {"date": day, "time": "09:00", "end": "10:00", "kind": "privat"},
    ]
    assert _read(output, "calendar-events-private.json")[0]["title"] == "Zahnarzt"
    status = _read(output, "calendar-fetch-status.json")
    assert status["failed_sources"] == []
    assert status["kept_previous"] is False
