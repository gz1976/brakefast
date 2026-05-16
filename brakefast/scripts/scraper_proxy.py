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

import logging
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import urlencode, urlparse  # noqa: F401  # urlparse preloaded for match_domain (Task 2)

import requests

__all__ = ["ScraperProxy", "AlterLabProxy", "ScrapeDoProxy", "build_proxy", "match_domain"]

logger = logging.getLogger("brakefast.scraper_proxy")


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
