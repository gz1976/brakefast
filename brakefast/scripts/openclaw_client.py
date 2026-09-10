#!/usr/bin/env python3
"""OpenClaw-style text provider client with ordered fallbacks."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

log = logging.getLogger("brakefast.enrichment")

from openclaw_runtime import ProviderConfig, get_text_provider_chain

# Unter diesem Rest-Zeitfenster wird ein Provider gar nicht mehr versucht:
# die Spec-Antworten brauchen auch im besten Fall einige Sekunden.
MIN_ATTEMPT_SEC = 20


@dataclass
class ChatResponse:
    provider_name: str
    model: str
    content: Any
    payload: dict[str, Any]


class OpenClawChatClient:
    def __init__(self, providers: list[ProviderConfig] | None = None) -> None:
        self.providers = providers if providers is not None else get_text_provider_chain()
        self.last_error: str = ""

    @property
    def enabled(self) -> bool:
        return bool(self.providers)

    def describe_chain(self) -> str:
        if not self.providers:
            return "heuristic"
        return " -> ".join(provider.label for provider in self.providers)

    def complete_json(
        self,
        *,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
        timeout: int = 40,
        deadline: float | None = None,
    ) -> ChatResponse | None:
        """Provider der Reihe nach versuchen; `timeout` gilt pro Versuch.

        `deadline` (time.monotonic()) begrenzt die ganze Kette: ein Versuch
        bekommt hoechstens die Restzeit bis dahin, und Provider ohne
        brauchbares Zeitfenster werden uebersprungen. Befund 03./10.09.2026:
        vier Provider x 150 s sprengten das 600-s-Budget des Shell-Schritts,
        der vierte Versuch wurde vom Wall-Clock-Timeout abgeschossen.
        """
        errors: list[str] = []
        for i, provider in enumerate(self.providers):
            attempt_timeout: float = timeout
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining < MIN_ATTEMPT_SEC:
                    left = max(remaining, 0)
                    log.warning("Provider %s skipped (attempt %d/%d): only %.0fs of the deadline left",
                                provider.label, i + 1, len(self.providers), left)
                    errors.append(f"{provider.label}: skipped (deadline, {left:.0f}s left)")
                    continue
                attempt_timeout = min(timeout, remaining)
            payload = {
                "model": provider.model,
                "messages": messages,
            }
            normalized_payload = self._normalize_payload(provider, payload, temperature=temperature)
            if response_format:
                normalized_payload["response_format"] = response_format
            try:
                response = self._call_provider(provider, normalized_payload, timeout=attempt_timeout)
                if response is not None:
                    self.last_error = ""
                    log.info("Provider %s succeeded (attempt %d/%d)",
                             provider.label, i + 1, len(self.providers))
                    return response
            except Exception as exc:  # defensive: continue to next provider
                log.warning("Provider %s failed (attempt %d/%d): %s: %s",
                            provider.label, i + 1, len(self.providers),
                            type(exc).__name__, str(exc)[:200])
                errors.append(f"{provider.label}: {exc}")
                continue
        self.last_error = " | ".join(errors)
        log.error("All %d providers failed: %s", len(self.providers), self.last_error[:500])
        return None

    def _call_provider(
        self,
        provider: ProviderConfig,
        payload: dict[str, Any],
        *,
        timeout: float,
    ) -> ChatResponse | None:
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "BrakeFast OpenClaw Bridge/1.0",
            **provider.headers,
        }
        request = urllib.request.Request(
            f"{provider.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw_payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore").strip()
            detail = f"HTTP {exc.code}"
            if body:
                detail = f"{detail}: {body[:400]}"
            raise RuntimeError(f"request failed: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"request failed: {exc}") from exc

        try:
            content = raw_payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("unexpected response shape") from exc

        return ChatResponse(
            provider_name=provider.name,
            model=provider.model,
            content=content,
            payload=raw_payload,
        )

    def _normalize_payload(
        self,
        provider: ProviderConfig,
        payload: dict[str, Any],
        *,
        temperature: float,
    ) -> dict[str, Any]:
        normalized = dict(payload)
        provider_name = (provider.provider or provider.name or "").lower()
        model_name = (provider.model or "").lower()

        # GPT-5 and Kimi K2.5 reject custom temperatures on this endpoint.
        if provider_name not in {"openai", "moonshot"} and not model_name.startswith("gpt-5"):
            normalized["temperature"] = temperature

        return normalized
