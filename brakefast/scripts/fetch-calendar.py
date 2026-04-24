#!/usr/bin/env python3
"""Fetch calendar events from one or more Google Calendar *secret ICS URLs*.

Configuration — `BRAKEFAST_CALENDAR_SOURCES` env var, JSON array of sources:

    [
      {"url": "https://calendar.google.com/calendar/ical/.../basic.ics", "kind": "privat"},
      {"url": "https://calendar.google.com/calendar/ical/.../basic.ics", "kind": "arbeit"}
    ]

Outputs TWO files in brakefast/output/:

- ``calendar-events.json``          redacted, public  — `[{time, end, kind}, ...]`
- ``calendar-events-private.json``  full, served only via key-protected path
                                    — `[{time, end, kind, title, location}, ...]`

The redacted file is consumed by `curate.py` and lands in the public data.json.
The private file is shipped to `/data/brakefast-public/private/calendar.json`
by publish-edition.sh and served from nginx only when `?k=<key>` matches.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, date, time, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

VIENNA_TZ = ZoneInfo("Europe/Vienna") if ZoneInfo else timezone(timedelta(hours=1))

SCRIPT_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = BRAKEFAST_DIR / "output"
PUBLIC_FILE = OUTPUT_DIR / "calendar-events.json"
PRIVATE_FILE = OUTPUT_DIR / "calendar-events-private.json"

# Fetch ±7 days so the frontend calendar widget supports week navigation
LOOKBACK_DAYS = 7
LOOKAHEAD_DAYS = 7


def _load_sources() -> list[dict]:
    raw = os.environ.get("BRAKEFAST_CALENDAR_SOURCES", "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"WARN: BRAKEFAST_CALENDAR_SOURCES is not valid JSON: {exc}", file=sys.stderr)
        return []
    if not isinstance(parsed, list):
        return []
    return [s for s in parsed if isinstance(s, dict) and s.get("url")]


def _fetch_ics(url: str, timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "BrakeFast calendar fetcher (ICS)",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _ensure_tz(dt):
    """Attach Vienna tz to naive datetimes; leave aware ones alone."""
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=VIENNA_TZ)
        return dt.astimezone(VIENNA_TZ)
    if isinstance(dt, date):
        return datetime.combine(dt, time(0, 0), tzinfo=VIENNA_TZ)
    return None


def _parse_events(ics_text: str, window_start: datetime, window_end: datetime) -> list[dict]:
    """Return raw event dicts for the requested window, expanding recurrences."""
    try:
        from icalendar import Calendar
    except ImportError:
        print("WARN: icalendar module missing — pipeline self-heal should install it", file=sys.stderr)
        return []

    try:
        cal = Calendar.from_ical(ics_text)
    except Exception as exc:  # noqa: BLE001 - defensive: malformed feeds
        print(f"WARN: Failed to parse ICS: {exc}", file=sys.stderr)
        return []

    # Optional: recurring_ical_events handles RRULE expansion correctly.
    # Fall back to non-expanding parse if the dep isn't installed.
    try:
        import recurring_ical_events  # type: ignore
        occurrences = recurring_ical_events.of(cal).between(window_start, window_end)
    except ImportError:
        occurrences = [c for c in cal.walk("VEVENT")]

    events: list[dict] = []
    for ev in occurrences:
        dtstart = ev.get("dtstart")
        if not dtstart:
            continue
        start = _ensure_tz(dtstart.dt)
        if start is None:
            continue
        if start < window_start or start > window_end:
            continue

        dtend = ev.get("dtend")
        end = _ensure_tz(dtend.dt) if dtend else None

        summary = str(ev.get("summary") or "").strip()
        location = str(ev.get("location") or "").strip()
        description = str(ev.get("description") or "").strip()

        # Skip all-day events for the widget — they flood the small card.
        if isinstance(dtstart.dt, date) and not isinstance(dtstart.dt, datetime):
            continue

        events.append({
            "start": start,
            "end": end,
            "title": summary,
            "location": location,
            "description": description[:500],  # cap to avoid JSON bloat
        })

    return events


def _format_time(dt: datetime | None) -> str:
    if dt is None:
        return ""
    return dt.astimezone(VIENNA_TZ).strftime("%H:%M")


def _format_date(dt: datetime) -> str:
    return dt.astimezone(VIENNA_TZ).strftime("%Y-%m-%d")


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = _load_sources()

    if not sources:
        # No config — write empty lists so curate.py and publish stay happy.
        PUBLIC_FILE.write_text("[]", encoding="utf-8")
        PRIVATE_FILE.write_text("[]", encoding="utf-8")
        print("Calendar: no BRAKEFAST_CALENDAR_SOURCES configured — wrote empty files.")
        return 0

    now = datetime.now(VIENNA_TZ)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = today - timedelta(days=LOOKBACK_DAYS)
    window_end = today + timedelta(days=LOOKAHEAD_DAYS)

    collected: list[dict] = []
    for src in sources:
        url = src["url"]
        kind = (src.get("kind") or "privat").strip().lower()
        try:
            ics = _fetch_ics(url)
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: Fetch failed for calendar source '{kind}': {exc}", file=sys.stderr)
            continue
        for ev in _parse_events(ics, window_start, window_end):
            ev["kind"] = kind
            collected.append(ev)

    collected.sort(key=lambda e: e["start"])

    public_events = []
    private_events = []
    for ev in collected:
        public_events.append({
            "date": _format_date(ev["start"]),
            "time": _format_time(ev["start"]),
            "end": _format_time(ev["end"]) if ev["end"] else "",
            "kind": ev["kind"],
        })
        private_events.append({
            "date": _format_date(ev["start"]),
            "time": _format_time(ev["start"]),
            "end": _format_time(ev["end"]) if ev["end"] else "",
            "kind": ev["kind"],
            "title": ev["title"] or "(ohne Titel)",
            "location": ev["location"],
            "description": ev["description"],
        })

    PUBLIC_FILE.write_text(
        json.dumps(public_events, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    PRIVATE_FILE.write_text(
        json.dumps(private_events, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"Calendar: {len(collected)} events across {len(sources)} source(s) "
        f"→ {PUBLIC_FILE.name} + {PRIVATE_FILE.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
