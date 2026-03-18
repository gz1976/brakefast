#!/usr/bin/env python3
"""Shared runtime helpers for BrakeFast's OpenClaw-style provider usage."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = SCRIPT_DIR.parent
CONFIG_DIR = BRAKEFAST_DIR / "config"
OUTPUT_DIR = BRAKEFAST_DIR / "output"
OPENCLAW_CONFIG_CANDIDATES = (
    Path("/data/.openclaw/openclaw.json"),
    Path.home() / ".openclaw" / "openclaw.json",
)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_runtime_env() -> None:
    load_env_file(CONFIG_DIR / "briefing.env")
    load_env_file(CONFIG_DIR / "briefing.local.env")


load_runtime_env()


def first_env(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return default


def parse_json_env(key: str) -> Any:
    raw = os.environ.get(key, "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def load_openclaw_model_providers() -> dict[str, dict[str, Any]]:
    config_path = first_env("OPENCLAW_CONFIG_PATH")
    candidates = [Path(config_path)] if config_path else list(OPENCLAW_CONFIG_CANDIDATES)
    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        providers = payload.get("models", {}).get("providers")
        if isinstance(providers, dict):
            return providers
    return {}


@dataclass
class ProviderConfig:
    name: str
    kind: str
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    provider: str = ""
    api_key_env: str = ""
    headers: dict[str, str] = field(default_factory=dict)
    options: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "ProviderConfig":
        return ProviderConfig(
            name=self.name,
            kind=self.kind,
            base_url=self.base_url,
            api_key=self.api_key,
            model=self.model,
            provider=self.provider,
            api_key_env=self.api_key_env,
            headers=dict(self.headers),
            options=dict(self.options),
        )

    @property
    def enabled(self) -> bool:
        if self.kind == "text":
            return bool(self.base_url and self.api_key and self.model)
        if self.kind == "image":
            return bool(self.api_key and self.model)
        return bool(self.api_key or self.base_url or self.model)

    @property
    def label(self) -> str:
        detail = self.model or self.provider or self.base_url
        return f"{self.name}:{detail}" if detail else self.name


def _provider_from_dict(entry: dict[str, Any], kind: str) -> ProviderConfig | None:
    provider_ref = str(entry.get("provider_ref") or entry.get("openclaw_provider") or "").strip()
    if provider_ref:
        provider_data = load_openclaw_model_providers().get(provider_ref)
        if isinstance(provider_data, dict):
            headers = entry.get("headers") if isinstance(entry.get("headers"), dict) else {}
            merged_headers = {str(k): str(v) for k, v in headers.items()}
            if provider_ref == "openrouter":
                merged_headers.setdefault("HTTP-Referer", "https://ottobot.net/")
                merged_headers.setdefault("X-Title", "BrakeFast OpenClaw Bridge")
            config = ProviderConfig(
                name=str(entry.get("name") or provider_ref).strip() or provider_ref,
                kind=kind,
                base_url=str(provider_data.get("baseUrl") or "").strip().rstrip("/"),
                api_key=str(provider_data.get("apiKey") or "").strip(),
                model=str(entry.get("model") or "").strip(),
                provider=str(entry.get("provider") or provider_ref).strip(),
                headers=merged_headers,
                options=entry.get("options") if isinstance(entry.get("options"), dict) else {},
            )
            return config if config.enabled else None

    name = str(entry.get("name") or entry.get("provider") or kind).strip()
    api_key_env = str(entry.get("api_key_env") or "").strip()
    api_key = str(entry.get("api_key") or "").strip()
    if api_key_env and not api_key:
        api_key = os.environ.get(api_key_env, "").strip()
    provider = str(entry.get("provider") or "").strip()
    base_url = str(entry.get("base_url") or "").strip().rstrip("/")
    model = str(entry.get("model") or "").strip()
    headers = entry.get("headers") if isinstance(entry.get("headers"), dict) else {}
    options = entry.get("options") if isinstance(entry.get("options"), dict) else {}
    config = ProviderConfig(
        name=name or kind,
        kind=kind,
        base_url=base_url,
        api_key=api_key,
        model=model,
        provider=provider,
        api_key_env=api_key_env,
        headers={str(k): str(v) for k, v in headers.items()},
        options=options,
    )
    return config if config.enabled else None


def _dedupe_providers(providers: list[ProviderConfig]) -> list[ProviderConfig]:
    deduped: list[ProviderConfig] = []
    seen: set[tuple[str, str, str, str]] = set()
    for provider in providers:
        key = (
            provider.kind,
            provider.name,
            provider.base_url,
            provider.model or provider.provider,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(provider)
    return deduped


def _default_text_providers() -> list[ProviderConfig]:
    providers: list[ProviderConfig] = []

    brakefast_provider = ProviderConfig(
        name="brakefast-primary",
        kind="text",
        base_url=first_env("BRAKEFAST_LLM_BASE_URL", "OPENAI_BASE_URL", "OPENROUTER_BASE_URL").rstrip("/"),
        api_key=first_env("BRAKEFAST_LLM_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"),
        model=first_env("BRAKEFAST_LLM_MODEL", "OPENAI_MODEL", "OPENROUTER_MODEL"),
    )
    if brakefast_provider.enabled:
        providers.append(brakefast_provider)

    openrouter_provider = ProviderConfig(
        name="openrouter-fallback",
        kind="text",
        base_url=first_env("OPENROUTER_BASE_URL", default="https://openrouter.ai/api/v1").rstrip("/"),
        api_key=first_env("OPENROUTER_API_KEY"),
        model=first_env("OPENROUTER_MODEL"),
        headers={
            "HTTP-Referer": "https://ottobot.net/",
            "X-Title": "BrakeFast OpenClaw Bridge",
        },
    )
    if openrouter_provider.enabled:
        providers.append(openrouter_provider)

    openai_provider = ProviderConfig(
        name="openai-fallback",
        kind="text",
        base_url=first_env("OPENAI_BASE_URL", default="https://api.openai.com/v1").rstrip("/"),
        api_key=first_env("OPENAI_API_KEY"),
        model=first_env("OPENAI_MODEL"),
    )
    if openai_provider.enabled:
        providers.append(openai_provider)

    extra_fallbacks = parse_json_env("BRAKEFAST_LLM_FALLBACKS")
    if isinstance(extra_fallbacks, list):
        for entry in extra_fallbacks:
            if isinstance(entry, dict):
                provider = _provider_from_dict(entry, "text")
                if provider:
                    providers.append(provider)

    return _dedupe_providers(providers)


def get_text_provider_chain() -> list[ProviderConfig]:
    explicit_chain = parse_json_env("BRAKEFAST_LLM_PROVIDER_CHAIN")
    if isinstance(explicit_chain, list):
        providers = [
            provider
            for entry in explicit_chain
            if isinstance(entry, dict)
            for provider in [_provider_from_dict(entry, "text")]
            if provider
        ]
        return _dedupe_providers(providers)
    return _default_text_providers()


def _default_image_providers() -> list[ProviderConfig]:
    hf_token = first_env("HF_TOKEN")
    if not hf_token:
        for candidate in (
            BRAKEFAST_DIR / "config" / "hf_token.txt",
            Path("/data/.openclaw/workspace/brakefast/config/hf_token.txt"),
            Path("~/.huggingface/token").expanduser(),
            Path("~/.cache/huggingface/token").expanduser(),
        ):
            if candidate.exists():
                hf_token = candidate.read_text().strip()
                if hf_token:
                    break

    provider = ProviderConfig(
        name="huggingface-image-fallback",
        kind="image",
        api_key=hf_token,
        model=first_env("BRAKEFAST_IMAGE_MODEL", default="black-forest-labs/FLUX.1-schnell"),
        provider="huggingface",
        base_url=first_env(
            "BRAKEFAST_IMAGE_BASE_URL",
            default="https://router.huggingface.co/hf-inference/models",
        ).rstrip("/"),
    )
    return [provider] if provider.enabled else []


def get_image_provider_chain() -> list[ProviderConfig]:
    explicit_chain = parse_json_env("BRAKEFAST_IMAGE_PROVIDER_CHAIN")
    if isinstance(explicit_chain, list):
        providers = [
            provider
            for entry in explicit_chain
            if isinstance(entry, dict)
            for provider in [_provider_from_dict(entry, "image")]
            if provider
        ]
        return _dedupe_providers(providers)
    return _default_image_providers()
