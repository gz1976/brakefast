"""Tests fuer die Provider-Ketten aus der Umgebung.

Hermetisch: nur Umgebungsvariablen mit Inline-Schluesseln, kein Netz, keine
providers.json. Hintergrund 10.09.2026: die Kurations-Spec braucht eine eigene
Reihenfolge (teamo-pro lieferte in drei Wochen keine Spec, beim Enrichment
arbeitet es gut), deshalb BRAKEFAST_SPEC_PROVIDER_CHAIN neben der Text-Kette.
"""

from __future__ import annotations

import json

import openclaw_runtime as runtime


def _chain(*names: str) -> str:
    return json.dumps([
        {"name": name, "base_url": "http://example.invalid/v1", "api_key": "k", "model": f"model-{name}"}
        for name in names
    ])


def test_spec_chain_is_empty_when_not_configured(monkeypatch):
    monkeypatch.delenv("BRAKEFAST_SPEC_PROVIDER_CHAIN", raising=False)

    assert runtime.get_spec_provider_chain() == []


def test_spec_chain_keeps_the_configured_order(monkeypatch):
    monkeypatch.setenv("BRAKEFAST_SPEC_PROVIDER_CHAIN", _chain("flash", "mini", "pro"))

    labels = [provider.label for provider in runtime.get_spec_provider_chain()]

    assert labels == ["flash:model-flash", "mini:model-mini", "pro:model-pro"]


def test_spec_chain_ignores_invalid_json_and_unusable_entries(monkeypatch):
    monkeypatch.setenv("BRAKEFAST_SPEC_PROVIDER_CHAIN", "{not json")
    assert runtime.get_spec_provider_chain() == []

    monkeypatch.setenv("BRAKEFAST_SPEC_PROVIDER_CHAIN", json.dumps([{"name": "no-key", "base_url": "http://x", "model": "m"}]))
    assert runtime.get_spec_provider_chain() == []


def test_spec_chain_does_not_touch_the_text_chain(monkeypatch):
    monkeypatch.setenv("BRAKEFAST_LLM_PROVIDER_CHAIN", _chain("pro", "flash"))
    monkeypatch.setenv("BRAKEFAST_SPEC_PROVIDER_CHAIN", _chain("flash", "pro"))

    assert [p.name for p in runtime.get_text_provider_chain()] == ["pro", "flash"]
    assert [p.name for p in runtime.get_spec_provider_chain()] == ["flash", "pro"]
