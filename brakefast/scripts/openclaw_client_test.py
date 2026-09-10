"""Tests fuer die Provider-Kette: Deadline-Verteilung ueber die Versuche.

Hermetisch: _call_provider wird durch eine Attrappe ersetzt, kein Netz.
Befund 03.09./10.09.2026: die Spec-Generierung gab jedem der vier Provider
150 s, das 600-s-Budget des Shell-Schritts schoss den vierten Versuch ab.
"""

from __future__ import annotations

import openclaw_client
from openclaw_client import ChatResponse, OpenClawChatClient
from openclaw_runtime import ProviderConfig


def _providers(*names: str) -> list[ProviderConfig]:
    return [
        ProviderConfig(name=name, kind="text", base_url="http://example.invalid/v1", api_key="k", model="m")
        for name in names
    ]


class _FakeClock:
    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now


def _scripted_client(monkeypatch, outcomes: dict[str, str], clock: _FakeClock) -> tuple[OpenClawChatClient, list[tuple[str, float]]]:
    """outcomes: provider name -> "ok" | "timeout". Ein Timeout verbraucht genau sein Zeitfenster."""
    client = OpenClawChatClient(providers=_providers(*outcomes))
    seen: list[tuple[str, float]] = []

    def fake_call(provider, payload, *, timeout):
        seen.append((provider.name, timeout))
        if outcomes[provider.name] == "timeout":
            clock.now += timeout
            raise RuntimeError("request failed: The read operation timed out")
        clock.now += 5
        return ChatResponse(provider_name=provider.name, model=provider.model, content="{}", payload={})

    monkeypatch.setattr(client, "_call_provider", fake_call)
    monkeypatch.setattr(openclaw_client.time, "monotonic", clock)
    return client, seen


def test_without_deadline_every_attempt_gets_the_full_timeout(monkeypatch):
    clock = _FakeClock()
    client, seen = _scripted_client(monkeypatch, {"a": "timeout", "b": "ok"}, clock)

    response = client.complete_json(messages=[], timeout=150)

    assert response is not None and response.provider_name == "b"
    assert seen == [("a", 150), ("b", 150)]


def test_deadline_caps_the_remaining_attempts(monkeypatch):
    clock = _FakeClock()
    client, seen = _scripted_client(monkeypatch, {"a": "timeout", "b": "timeout", "c": "ok"}, clock)

    response = client.complete_json(messages=[], timeout=150, deadline=clock.now + 380)

    assert response is not None and response.provider_name == "c"
    assert seen == [("a", 150), ("b", 150), ("c", 80)]


def test_providers_without_a_usable_time_window_are_skipped(monkeypatch):
    clock = _FakeClock()
    client, seen = _scripted_client(monkeypatch, {"a": "timeout", "b": "timeout", "c": "ok"}, clock)

    response = client.complete_json(messages=[], timeout=150, deadline=clock.now + 310)

    assert response is None
    assert seen == [("a", 150), ("b", 150)]
    assert "c:m: skipped (deadline" in client.last_error, client.last_error
