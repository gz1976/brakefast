"""HTTP scraping proxy for BrakeFast article fetches behind anti-bot walls.

Some news sources we curate (derstandard.at, nzz.ch, kleinezeitung.at) sit
behind DataDome and won't yield article bodies to plain `urllib.request`.
A separate class (heise.de today) responds to plain `requests` from a
residential IP but blocks the VPS — different mitigation, same outcome:
the empty-body confabulation trap that Phase 04.2 closes.

This module is the provider layer of the bypass: a tiny `ScraperProxy`
ABC with `fetch(url) -> str`, two concrete clients (`AlterLabProxy` and
`ScrapeDoProxy`), a `build_proxy` factory, and a segment-anchored
`match_domain` helper used by the dispatcher to route per-domain.

The API key is **never** read from `sources.json` — it lives in
`etc/Secrets/{scrapedo,alterlab}.key` and is exported to the environment
by `brakefast/scripts/load-brakefast-env.sh` (Plan 03). The dispatcher
hands the key here; we never persist it.

This file is a 1:1 port of `/Users/gzoehrer/Projects/AuctionCrawler/nexus/
priceresearch/scraper_proxy.py` (LOCKED decision D-04) with four narrow
adaptations:

  1. Logger name `brakefast.scraper_proxy` (matches BrakeFast convention,
     see `article_briefing_engine.py`'s `brakefast.enrichment`).
  2. `last_credits` instance attribute on each provider, written at the
     end of every successful `fetch()` so the Plan 02 dispatcher can
     read it without parsing the response twice.
  3. `build_proxy` accepts `render` / `super_proxy` / `timeout` kwargs
     so the dispatcher can pass per-provider settings from
     `sources.json`'s `settings.proxy` block.
  4. `match_domain` segment-anchored matcher + inline `__main__`
     self-test pinning the adversarial-host case
     (`derstandard.at.evil.com` MUST NOT match `derstandard.at`).

Locked design: `docs/superpowers/specs/2026-05-15-scrapedo-bypass-design.md`.

History note inherited from the port: AlterLab's auto-router used to
silently drop every PAYG request to tier 2 regardless of the
`force_tier` / `max_tier` / `use_proxy` hints (verified live 2026-05-15
against idealo.at — tier_used="2" returned with captcha body regardless
of cost-controls). AlterLab shipped a router fix 2026-05-16; we
re-adopted `force_tier` and both providers are now first-class options.
AlterLab tier 3 (Stealth) is the cheapest tier that survives both
Idealo and Geizhals product pages, and is also our heise.de pilot tier
for Phase 04.2. Scrape.do `super=true` + `render=true` remains the
cheapest total-cost route for DataDome targets.
"""

from __future__ import annotations

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse  # noqa: F401  # urlparse preloaded for match_domain (Task 2)

import requests

__all__ = [
    "ScraperProxy",
    "AlterLabProxy",
    "ScrapeDoProxy",
    "build_proxy",
    "match_domain",
    "dispatch_fetch",
    "reset_stats_for_test",
    "flush_stats",
    "STATS_GLOBAL",
    "PROXIES",
    "ALLOWLIST",
    "LOG_DIR",
]

# Paths for module-init config loading. SOURCES_JSON sits one level
# above this scripts/ directory at brakefast/sources.json (Plan 03's
# `settings.proxy` block). LOG_DIR (Plan 04 / D-02) lives alongside
# output/ at brakefast/logs/ — deliberately OUTSIDE the nginx-served
# output dir (T-04.02-21).
MODULE_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = MODULE_DIR.parent
SOURCES_JSON = BRAKEFAST_DIR / "sources.json"
LOG_DIR = BRAKEFAST_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("brakefast.scraper_proxy")

# Attach a RotatingFileHandler exactly once per process (D-02: 10 MB max,
# 3 backups → ~40 MB cap total). Idempotency guard: re-importing the
# module in the same process must not produce duplicate log lines.
# Formatter pins the spec §Logging line shape so consumers can grep
# `provider=X domain=Y status=Z` reliably across rotations.
if not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
    _scraper_log_handler = RotatingFileHandler(
        LOG_DIR / "scraper-proxy.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    _scraper_log_handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
        )
    )
    logger.addHandler(_scraper_log_handler)
    logger.setLevel(logging.INFO)
    # Don't double-log to the root logger that article_briefing_engine
    # configures for enrichment — the rotating file is the only sink for
    # scraper-proxy events.
    logger.propagate = False


def _log_call(
    provider: str,
    domain: str,
    status: str | int,
    credits: int,
    ms: int,
    url: str,
) -> None:
    """Emit one structured log line per fetch attempt.

    Format (after the asctime prefix supplied by the handler formatter):
      provider=<name> domain=<host> status=<code> credits=<n> ms=<n> url=<url>

    Critical: the signature only accepts the seven safe fields (T-04.02-16).
    API keys, request bodies, and response bodies must never reach this
    function — reviewers grep for `_log_call(` invocations and reject any
    that look like they're forwarding a payload or secret.
    """
    logger.info(
        "provider=%s domain=%s status=%s credits=%s ms=%d url=%s",
        provider, domain, status, credits, ms, url,
    )


class ScraperProxy(ABC):
    """Fetches a URL via a third-party scraping API. One method, on
    purpose: keeps swapping providers cheap."""

    name: str = ""
    # Written at the end of a successful fetch() so the dispatcher can
    # read credit usage without re-parsing the response. 0 means
    # "no fetch run yet" or "credits header missing".
    last_credits: int = 0

    @abstractmethod
    def fetch(self, url: str) -> str:
        """Fetch `url`. Returns the HTML body of the target page.

        Raises any exception (network, HTTP, decoding) — callers catch
        and either fall back or record the failure as `source_failed`.
        """
        ...


class AlterLabProxy(ScraperProxy):
    """AlterLab REST API client.

    Endpoint: ``POST https://api.alterlab.io/api/v1/scrape``
    Auth: ``X-API-Key`` header.

    We pin every fetch to an explicit tier via ``cost_controls.force_tier``.
    Up to the 2026-05-16 router fix, the auto-router on PAYG accounts
    silently dropped any request to tier 2 regardless of the
    ``max_tier`` ceiling, so DataDome-protected targets came back as
    captcha bodies. AlterLab confirmed the fix is live and verified
    against idealo.at product pages at tier 3.

    ``max_credits_per_request`` is the hard credits ceiling so a
    misconfigured loop can't drain the account.
    """

    name = "alterlab"
    API_URL = "https://api.alterlab.io/api/v1/scrape"

    # AlterLab tier semantics (verified via API behaviour 2026-05):
    #   1 = simple HTTP (cheap)
    #   2 = standard proxy
    #   3 = Stealth (chromium fingerprint shims) — AlterLab-confirmed
    #       working on idealo.at product pages at this tier; 472 kB
    #       response, no captcha.
    #   4 = Browser (full headless browser; reserve for hardest targets)
    #   5 = CAPTCHA-solving
    # Default to 3: it's the cheapest tier that survives both Geizhals
    # and Idealo product pages. Override per-deployment if a source
    # needs more.
    DEFAULT_FORCE_TIER = 3

    # Sanity cap on credits per call. Tier 3 on a typical product page
    # lands around 80-200 credits; 1000 leaves headroom but catches
    # regex-bug loops before they drain the account.
    DEFAULT_MAX_CREDITS = 1000

    def __init__(
        self,
        api_key: str,
        *,
        country: str = "de",
        language: str = "de",
        max_credits: int = DEFAULT_MAX_CREDITS,
        force_tier: int = DEFAULT_FORCE_TIER,
        timeout: int = 60,
    ) -> None:
        if not api_key:
            raise ValueError("AlterLab API key required")
        self._api_key = api_key
        # AlterLab expects ISO-3166-1 alpha-2 codes UPPERCASE
        # (`DE`, not `de` or `at`). Austria (`AT`) is not in their
        # supported list — fall back to `DE` since idealo.at and
        # idealo.de serve the same catalogue.
        normalised = country.strip().upper()
        if normalised == "AT":
            normalised = "DE"
        self._country = normalised
        self._language = language
        self._max_credits = max_credits
        self._force_tier = force_tier
        self._timeout = timeout
        self.last_credits = 0
        self._session = requests.Session()
        self._session.headers.update(
            {
                "X-API-Key": api_key,
                "Content-Type": "application/json",
            }
        )

    def fetch(self, url: str) -> str:
        payload: dict[str, Any] = {
            "url": url,
            "mode": "auto",
            "formats": ["html"],
            "advanced": {"render_js": True},
            "location": {"country": self._country, "language": self._language},
            "cost_controls": {
                # `force_tier` pins the tier the request runs at. The
                # router used to silently fall back to tier 2 (captcha
                # body at 200 OK) — AlterLab fixed the regression
                # 2026-05-16 and we re-adopted this parameter.
                "force_tier": str(self._force_tier),
                "max_credits": self._max_credits,
                "fail_fast": True,
            },
        }
        resp = self._session.post(self.API_URL, json=payload, timeout=self._timeout)
        if resp.status_code != 200:
            raise RuntimeError(
                f"AlterLab returned HTTP {resp.status_code}: {resp.text[:200]}"
            )
        data = resp.json()

        target_status = data.get("status_code")
        if target_status and int(target_status) >= 400:
            raise RuntimeError(
                f"AlterLab fetched URL but target returned {target_status}"
            )

        content = data.get("content") or {}
        html = content.get("html") or ""
        if not html:
            # AlterLab might return only text/markdown if html wasn't
            # in formats — guard against schema drift.
            raise RuntimeError("AlterLab response had no html content")

        billing = data.get("billing") or {}
        # Defensive canary: real result pages are 100+ kB on every
        # source we scrape. A sub-8 kB response is either an upstream
        # error page (verified 2026-05-15 with AlterLab support: the
        # 3835 B idealo.at search-URL response is idealo's own
        # "Sorry, something went wrong" error, not a DataDome
        # challenge) or a captcha. Either way, no useful data —
        # surface as an error so the source layer drops the result.
        if len(html) < 8000:
            logger.warning(
                "AlterLab fetch suspiciously small: url=%s size=%d tier=%s "
                "credits=%s — upstream error page or captcha",
                url, len(html), billing.get("tier_used"),
                billing.get("total_credits"),
            )
            raise RuntimeError(
                f"AlterLab returned {len(html)}-byte body "
                f"(tier={billing.get('tier_used')}); upstream returned an "
                "error page or anti-bot challenge"
            )

        # Stash credits so the dispatcher can read them without
        # re-parsing. Defensive int() — billing may be missing or
        # carry a string.
        try:
            self.last_credits = int(billing.get("total_credits") or 0)
        except (TypeError, ValueError):
            self.last_credits = 0

        logger.info(
            "AlterLab fetch ok: url=%s tier=%s credits=%s size=%d",
            url,
            billing.get("tier_used"),
            billing.get("total_credits"),
            len(html),
        )
        return html


class ScrapeDoProxy(ScraperProxy):
    """Scrape.do REST API client.

    Endpoint: ``GET https://api.scrape.do/?token=…&url=…&super=true&render=true``
    Auth: ``token`` query parameter.

    Scrape.do uses a flat GET interface with the target URL as a query
    param. For DataDome-protected sites we always pass ``super=true``
    (residential/mobile proxy) and ``render=true`` (headless browser);
    that combination costs 25 credits per successful call.

    Response body **is the raw HTML of the target page** — no JSON
    wrapping, no metadata. Status code mirrors the upstream (200 if the
    fetch succeeded; 4xx/5xx if Scrape.do or upstream errored).
    """

    name = "scrapedo"
    API_URL = "https://api.scrape.do/"

    # DataDome on Idealo. Per Scrape.do credit table: render + super
    # (= browser + residential proxy) = 25 credits per call. With the
    # free tier of 1.000 credits/month that's ~40 Idealo lookups for
    # free — and the same on the $29 Hobby plan scales to 10.000/mo.
    DEFAULT_TIMEOUT = 90

    def __init__(
        self,
        api_key: str,
        *,
        country: str = "de",
        render: bool = True,
        super_proxy: bool = True,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key:
            raise ValueError("Scrape.do API token required")
        self._token = api_key
        # Scrape.do uses lowercase ISO-3166-1 alpha-2 codes for `geoCode`.
        # AT is supported here (unlike AlterLab).
        self._country = country.strip().lower()
        self._render = render
        self._super = super_proxy
        self._timeout = timeout
        self.last_credits = 0
        self._session = requests.Session()

    # Transient upstream errors. Live observation: Scrape.do occasionally
    # returns 502 (~30% of the time on Idealo) when their worker pool
    # is contended. A short retry usually picks up a healthy worker.
    _TRANSIENT_HTTP = frozenset({429, 500, 502, 503, 504})
    _MAX_ATTEMPTS = 3

    def fetch(self, url: str) -> str:
        import time as _time

        params: dict[str, Any] = {
            "token": self._token,
            "url": url,
        }
        if self._render:
            params["render"] = "true"
        if self._super:
            params["super"] = "true"
        if self._country:
            params["geoCode"] = self._country
        # We keep Scrape.do's own retry enabled (default) AND wrap a
        # short outer retry, because both layers can hit different
        # failure modes (Scrape.do worker timeout vs upstream block).

        last_status = None
        last_body = ""
        for attempt in range(1, self._MAX_ATTEMPTS + 1):
            resp = self._session.get(self.API_URL, params=params, timeout=self._timeout)
            if resp.status_code == 200:
                break
            last_status = resp.status_code
            last_body = resp.text[:200]
            if resp.status_code not in self._TRANSIENT_HTTP:
                raise RuntimeError(
                    f"Scrape.do returned HTTP {resp.status_code}: {last_body}"
                )
            if attempt < self._MAX_ATTEMPTS:
                # Exponential backoff: 1s, 2s, 4s. Keeps total worst-case
                # under 10s before bubbling up to the source layer.
                _time.sleep(2 ** (attempt - 1))
                logger.info(
                    "Scrape.do %d, retrying (attempt %d/%d)",
                    resp.status_code, attempt + 1, self._MAX_ATTEMPTS,
                )
        else:
            raise RuntimeError(
                f"Scrape.do returned HTTP {last_status} after "
                f"{self._MAX_ATTEMPTS} attempts: {last_body}"
            )

        html = resp.text or ""
        if not html:
            raise RuntimeError("Scrape.do response had empty body")

        # Cheap response-size canary, mirroring AlterLabProxy. Real
        # search pages are >100 kB; a sub-8 kB body is either an
        # upstream error page (e.g. idealo.at's "Sorry, something went
        # wrong") or a captcha that slipped through render+super.
        # Either way: no usable data, surface loudly.
        if len(html) < 8000:
            raise RuntimeError(
                f"Scrape.do returned {len(html)}-byte body — upstream "
                f"error page or anti-bot challenge slipped through "
                f"render+super=true"
            )

        # Credit tracking — Scrape.do exposes consumption in response
        # headers (Scrape.do-Credits-Used and similar).
        credits = resp.headers.get("Scrape.do-Credits-Used") or resp.headers.get(
            "Scrape-Do-Credits-Used"
        )
        target_status = resp.headers.get("Scrape.do-Target-Status-Code") or resp.headers.get(
            "Scrape-Do-Target-Status-Code"
        )
        # Stash credits so the dispatcher can read them without
        # re-parsing the headers. Defensive int() — header may be
        # absent or non-numeric.
        try:
            self.last_credits = int(credits) if credits is not None else 0
        except (TypeError, ValueError):
            self.last_credits = 0
        logger.info(
            "Scrape.do fetch ok: url=%s credits=%s target_status=%s size=%d",
            url, credits, target_status, len(html),
        )
        return html


def build_proxy(
    provider: str,
    api_key: str,
    *,
    country: str = "de",
    max_credits: int = 1000,
    force_tier: int | None = None,
    render: bool = True,
    super_proxy: bool = True,
    timeout: int = 60,
) -> ScraperProxy | None:
    """Factory. Returns ``None`` when the proxy is disabled or the key
    is missing — callers should treat ``None`` as "use direct urllib".

    Supported providers (case-insensitive):
      - ``alterlab`` — AlterLab REST API (POST /api/v1/scrape).
        ``force_tier`` pins the AlterLab tier (1-5, default 3).
        ``render`` / ``super_proxy`` are ignored.
      - ``scrapedo`` (aliases: ``scrape.do``, ``scrape_do``) —
        Scrape.do REST API (GET /?token=…).
        ``render`` / ``super_proxy`` map to the corresponding query
        params; ``force_tier`` is ignored.
    """
    if not provider or not api_key:
        return None
    provider = provider.lower()
    if provider == "alterlab":
        kwargs: dict[str, Any] = {
            "country": country,
            "max_credits": max_credits,
            "timeout": timeout,
        }
        if force_tier is not None:
            kwargs["force_tier"] = force_tier
        return AlterLabProxy(api_key, **kwargs)
    if provider in ("scrapedo", "scrape.do", "scrape_do"):
        return ScrapeDoProxy(
            api_key,
            country=country,
            render=render,
            super_proxy=super_proxy,
            timeout=timeout,
        )
    logger.warning("Unknown scraper proxy provider: %r — proxy disabled", provider)
    return None


def match_domain(url: str, allowlist: dict[str, str]) -> tuple[str, str] | None:
    """Segment-anchored allowlist matcher for routing dispatch.

    Given a URL and a `{canonical_domain: provider_name}` allowlist,
    returns `(canonical_domain, provider_name)` if the URL's hostname
    matches a canonical domain on a **segment boundary**, else `None`.

    Segment-anchored means we walk the hostname's dot-separated suffixes
    and require an exact full-segment join match. This is NOT
    `str.endswith` — `endswith` would happily match the adversarial
    host `derstandard.at.evil.com` against `derstandard.at`, which
    would let an attacker route their own URLs through our paid scrape
    credits (threat T-04.02-01 in the plan threat model).

    Examples (these are the seven cases pinned by the `__main__`
    self-test below):
      - `https://www.derstandard.at/foo` + `{"derstandard.at": "scrapedo"}`
        → `("derstandard.at", "scrapedo")` — `www` strips, then segment
        join `derstandard.at` hits the allowlist.
      - `https://derstandard.at.evil.com/x` + same allowlist → `None`
        — hostname is `derstandard.at.evil.com`; segment suffixes are
        `derstandard.at.evil.com`, `at.evil.com`, `evil.com`, `com`.
        None of them is `derstandard.at`. Adversarial host rejected.
      - `https://not-derstandard.at/foo` → `None` — `not-derstandard.at`
        is a single segment that does not equal `derstandard.at`.

    Returns `None` for URLs with no hostname (e.g. relative paths,
    `mailto:`, malformed input).
    """
    if not url:
        return None
    try:
        host = urlparse(url).hostname
    except (ValueError, TypeError):
        return None
    if not host:
        return None
    host = host.lower()
    parts = host.split(".")
    # Walk from longest suffix (full host) to shortest. Longest-first
    # ensures a more specific entry wins if a shorter one is also in
    # the allowlist.
    for i in range(len(parts)):
        candidate = ".".join(parts[i:])
        if candidate in allowlist:
            return (candidate, allowlist[candidate])
    return None


# ---------------------------------------------------------------------------
# Phase 04.02 Plan 02 — Dispatcher layer.
#
# Wires Plan 01's provider classes and Plan 03's `settings.proxy` config block
# into a single `dispatch_fetch(url) -> str | None` entry point that
# article_extractors.fetch_html consults before falling through to urllib.
#
# Module-init contract:
#   - Read brakefast/sources.json's settings.proxy block once.
#   - Build STATS_GLOBAL with per-provider counters (Plan 04 writer reads it).
#   - Build PROXIES dict of live provider instances (or None when key missing
#     → provider starts in block_mode_triggered = True, missing_key reason).
#   - Build ALLOWLIST as a flat {domain: provider_name} map.
#
# Per-call contract (dispatch_fetch):
#   - Non-allowlisted URL → return None (caller does urllib).
#   - Allowlisted URL, provider in block_mode → raise RuntimeError.
#   - Allowlisted URL, provider.fetch() raises → record telemetry, re-raise.
#   - Successful fetch → tally credits, trip block_mode if credits_exhausted,
#     return HTML.
#
# NO automatic cross-provider failover. NO silent urllib fallback for
# allowlisted-but-failed fetches. The caller's existing try/except Exception
# at article_briefing_engine.py:515 / resolve_images.py:251 absorbs the
# RuntimeError and drops the article — that is the intended behavior per
# spec §"Failure Handling".
# ---------------------------------------------------------------------------


def _utc_iso() -> str:
    """Current UTC time formatted as `YYYY-MM-DDTHH:MM:SSZ`."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_proxy_config() -> dict[str, Any]:
    """Read `brakefast/sources.json` and return the `settings.proxy` block.

    Returns `{"providers": {}, "domains": {}}` if the file or key is absent
    OR if the file is unreadable / malformed. The pipeline keeps running
    even if `sources.json` is broken — the consequence is that no domains
    get allowlisted and every URL falls through to urllib (the legacy path).
    """
    try:
        with open(SOURCES_JSON, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001 — broad on purpose
        logger.warning(
            "scraper_proxy: failed to read %s (%s); proxy disabled, urllib only",
            SOURCES_JSON, exc,
        )
        return {"providers": {}, "domains": {}}
    settings = data.get("settings") or {}
    proxy = settings.get("proxy") or {}
    if not isinstance(proxy, dict):
        logger.warning("scraper_proxy: settings.proxy is not a dict; proxy disabled")
        return {"providers": {}, "domains": {}}
    # Defensive normalisation — guarantee both keys exist as dicts.
    proxy.setdefault("providers", {})
    proxy.setdefault("domains", {})
    if not isinstance(proxy["providers"], dict):
        proxy["providers"] = {}
    if not isinstance(proxy["domains"], dict):
        proxy["domains"] = {}
    return proxy


def _default_credit_limit(provider_name: str) -> int:
    """Hardcoded fallback credit caps per D-07 if config omits the field."""
    if provider_name == "scrapedo":
        return 1000
    if provider_name == "alterlab":
        return 500
    return 1000


def _init_stats(providers_cfg: dict[str, Any]) -> dict[str, Any]:
    """Build the initial STATS_GLOBAL structure.

    Shape per RESEARCH.md Q5: a `run_id` (UTC iso8601), a `providers` dict
    keyed by provider name with credit counters + block-mode flags +
    per-domain breakdown (lazily filled), and a flat `failures` list.
    """
    stats: dict[str, Any] = {
        "run_id": _utc_iso(),
        "providers": {},
        "failures": [],
    }
    for name, cfg in providers_cfg.items():
        cfg = cfg if isinstance(cfg, dict) else {}
        limit = cfg.get("maxCreditsPerRun")
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = _default_credit_limit(name)
        stats["providers"][name] = {
            "credits_used": 0,
            "credits_limit": limit,
            "block_mode_triggered": False,
            "block_mode_reason": None,
            "by_domain": {},
        }
    return stats


def _build_providers(providers_cfg: dict[str, Any]) -> dict[str, ScraperProxy | None]:
    """Construct provider instances from `settings.proxy.providers`.

    Per D-05 (allowlist in sources.json only) and Q-OPEN-A (env vars are the
    source-of-truth for keys; `keyFile` in config is documentation):

      - scrapedo: read SCRAPEDO_KEY from env. Empty → mark block_mode_triggered
        = True with reason "missing_key" and store None.
      - alterlab: same pattern with ALTERLAB_KEY, force_tier pinned to 3
        per CONTEXT D-03 (paid tier).
      - Unknown providers in config: skipped with a warning.

    Returns the mapping the dispatcher consults at call time.
    """
    out: dict[str, ScraperProxy | None] = {}
    for name, cfg in providers_cfg.items():
        cfg = cfg if isinstance(cfg, dict) else {}
        if name == "scrapedo":
            key = os.environ.get("SCRAPEDO_KEY", "")
            if not key:
                _mark_missing_key("scrapedo")
                out["scrapedo"] = None
                continue
            out["scrapedo"] = build_proxy(
                "scrapedo",
                key,
                country=cfg.get("country", "at"),
                render=bool(cfg.get("render", True)),
                super_proxy=bool(cfg.get("super", True)),
                timeout=int(cfg.get("perRequestTimeout", 30)),
            )
        elif name == "alterlab":
            key = os.environ.get("ALTERLAB_KEY", "")
            if not key:
                _mark_missing_key("alterlab")
                out["alterlab"] = None
                continue
            out["alterlab"] = build_proxy(
                "alterlab",
                key,
                country=cfg.get("country", "at"),
                force_tier=3,  # CONTEXT D-03: paid tier 3 (Stealth) for heise.de pilot
                max_credits=int(cfg.get("maxCreditsPerRun", 500)),
                timeout=int(cfg.get("perRequestTimeout", 30)),
            )
        else:
            logger.warning(
                "scraper_proxy: unknown provider %r in config; ignored", name,
            )
            out[name] = None
    return out


def _mark_missing_key(provider_name: str) -> None:
    """Helper: flip a provider's stats block into missing_key block_mode."""
    p = STATS_GLOBAL["providers"].setdefault(
        provider_name,
        {
            "credits_used": 0,
            "credits_limit": _default_credit_limit(provider_name),
            "block_mode_triggered": False,
            "block_mode_reason": None,
            "by_domain": {},
        },
    )
    p["block_mode_triggered"] = True
    p["block_mode_reason"] = "missing_key"


def _classify(exc: Exception) -> str:
    """Map an exception into a short telemetry-friendly classification string.

    Telemetry consumers grep substrings like `http_5` for any 5xx error and
    `auth_error` for missing-key cascades. Keep the strings stable across
    releases — Plan 04's writer surfaces them verbatim into the JSON
    sidecar and the log.
    """
    s = str(exc)
    sl = s.lower()
    if "502" in s:
        return "http_502"
    if "503" in s:
        return "http_503"
    if "504" in s:
        return "http_504"
    if "forbidden" in sl or "401" in s or "403" in s:
        return "auth_error"
    if "timeout" in sl or "timed out" in sl:
        return "timeout"
    return "runtime_error"


def dispatch_fetch(url: str) -> str | None:
    """Route `url` through the allowlist → provider mapping.

    Returns:
      None       — url not in allowlist (caller should fall back to urllib).
      str (html) — allowlisted url, provider returned non-empty HTML.
    Raises:
      RuntimeError — provider in block_mode (missing key / credits exhausted)
                     OR provider.fetch() raised. The caller's existing
                     try/except Exception (article_briefing_engine.py:515,
                     resolve_images.py:251) catches and drops the article.
                     NO silent urllib fallback for allowlisted domains.
    """
    match = match_domain(url, ALLOWLIST)
    if match is None:
        return None
    domain, provider_name = match

    p_stats = STATS_GLOBAL["providers"].setdefault(
        provider_name,
        {
            "credits_used": 0,
            "credits_limit": _default_credit_limit(provider_name),
            "block_mode_triggered": False,
            "block_mode_reason": None,
            "by_domain": {},
        },
    )
    d_stats = p_stats["by_domain"].setdefault(
        domain,
        {"attempts": 0, "successes": 0, "failures": 0, "credits": 0},
    )
    d_stats["attempts"] += 1

    if p_stats["block_mode_triggered"]:
        d_stats["failures"] += 1
        reason = p_stats["block_mode_reason"] or "unknown"
        STATS_GLOBAL["failures"].append({
            "provider": provider_name,
            "domain": domain,
            "url": url,
            "status": f"block_mode_{reason}",
            "ts": _utc_iso(),
        })
        _log_call(provider_name, domain, f"block_mode_{reason}", 0, 0, url)
        raise RuntimeError(
            f"scraper_proxy: provider {provider_name} blocked ({reason})"
        )

    provider = PROXIES.get(provider_name)
    if provider is None:
        # Defensive: key vanished after init OR config named a provider that
        # _build_providers didn't construct. Symmetric to block-mode.
        d_stats["failures"] += 1
        STATS_GLOBAL["failures"].append({
            "provider": provider_name,
            "domain": domain,
            "url": url,
            "status": "missing_provider",
            "ts": _utc_iso(),
        })
        _log_call(provider_name, domain, "missing_provider", 0, 0, url)
        raise RuntimeError(
            f"scraper_proxy: provider {provider_name} unavailable"
        )

    t0 = time.monotonic()
    try:
        html = provider.fetch(url)
    except Exception as exc:  # noqa: BLE001 — record + re-raise
        ms = int((time.monotonic() - t0) * 1000)
        status = _classify(exc)
        d_stats["failures"] += 1
        STATS_GLOBAL["failures"].append({
            "provider": provider_name,
            "domain": domain,
            "url": url,
            "status": status,
            "ts": _utc_iso(),
        })
        _log_call(provider_name, domain, status, 0, ms, url)
        raise
    ms = int((time.monotonic() - t0) * 1000)
    credits = provider.last_credits or 0
    p_stats["credits_used"] += credits
    d_stats["credits"] += credits
    d_stats["successes"] += 1
    if p_stats["credits_used"] >= p_stats["credits_limit"]:
        p_stats["block_mode_triggered"] = True
        p_stats["block_mode_reason"] = "credits_exhausted"
    _log_call(provider_name, domain, "200", credits, ms, url)
    return html


def reset_stats_for_test() -> None:
    """Re-initialise STATS_GLOBAL counters from the cached config.

    Does NOT rebuild PROXIES — keeps the requests.Session objects alive so
    smoke tests don't drop their TCP pool between runs. Plan 05's smoke
    script calls this between assertions to keep counters interpretable.
    """
    global STATS_GLOBAL
    STATS_GLOBAL = _init_stats(_PROXY_CONFIG.get("providers", {}))


# Module-init: load config, build stats, build providers, build allowlist.
# This runs at import time so importers (article_extractors, Plan 04 writer,
# Plan 05 smoke) see a consistent module state without any setup call.
_PROXY_CONFIG = _load_proxy_config()
STATS_GLOBAL: dict[str, Any] = _init_stats(_PROXY_CONFIG.get("providers", {}))
PROXIES: dict[str, ScraperProxy | None] = _build_providers(
    _PROXY_CONFIG.get("providers", {})
)
ALLOWLIST: dict[str, str] = dict(_PROXY_CONFIG.get("domains", {}))


if __name__ == "__main__":
    # Pure-logic self-test for `match_domain` — see RESEARCH.md Q3 / Q12.
    # No network. No provider construction. Just the matcher's seven
    # canonical cases, including the adversarial host case (T-04.02-01).
    allowlist = {
        "derstandard.at": "scrapedo",
        "nzz.ch": "scrapedo",
        "kleinezeitung.at": "scrapedo",
        "heise.de": "alterlab",
    }
    cases: list[tuple[str, tuple[str, str] | None]] = [
        ("https://www.derstandard.at/story/123",    ("derstandard.at", "scrapedo")),
        ("https://apa.derstandard.at/news",         ("derstandard.at", "scrapedo")),
        ("https://derstandard.at/foo",              ("derstandard.at", "scrapedo")),
        ("https://www.heise.de/news",               ("heise.de", "alterlab")),
        ("https://derstandard.at.evil.com/exploit", None),
        ("https://not-derstandard.at/foo",          None),
        ("https://example.com/foo",                 None),
    ]
    failures: list[str] = []
    for url, expected in cases:
        got = match_domain(url, allowlist)
        if got != expected:
            failures.append(f"  url={url!r} expected={expected!r} got={got!r}")
    if failures:
        print("MATCHER SELF-TEST FAILED:")
        for row in failures:
            print(row)
        raise SystemExit(1)
    print("matcher self-test OK (7 cases)")
