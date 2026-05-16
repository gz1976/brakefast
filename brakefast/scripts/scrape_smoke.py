#!/usr/bin/env python3
"""Manual smoke test for the Phase 04.02 dispatcher.

Exercises the live `dispatch_fetch` path against each allowlisted domain in
``sources.json``'s ``settings.proxy.domains`` block and writes a per-(provider,
domain) pass/fail report to ``brakefast/output/scrape-smoke-YYYY-MM-DD.json``.

**This script burns paid scrape.do / AlterLab credits on every invocation.**
It is NOT invoked by ``brakefast-daily.sh`` (verified by Plan 05's verify
command). Operators run it ad-hoc post-deploy and after provider config edits.

URL selection (Q-OPEN-B): for each allowlisted domain, the first feed in
``sources.json`` whose hostname matches the domain is fetched as plain RSS
(via ``urllib.request``, no proxy — RSS endpoints aren't anti-bot protected)
and the first ``<item><link>`` (or Atom ``<entry><link href="…"/>``) is used
as the smoke URL. This keeps the smoke set fresh as feeds publish new items;
no hard-coded URLs to rot.

Pass criteria per spec §Testing:
  - ``dispatch_fetch`` returned (no exception).
  - ``len(html) > 1024`` (1 kB threshold; a real article page is 50-500 kB).
  - ``"DataDome" not in html`` (case-sensitive substring; the canary marker
    that signals scrape.do let an anti-bot challenge through).

Exit codes:
  0  — every domain passed.
  1  — any domain failed OR no allowlisted domains were configured.

The script never raises out of ``main()`` — each per-domain call catches its
own exception and records the failure. Operators always get a complete
results JSON even if every URL failed.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Make the scripts/ dir importable so ``from scraper_proxy import …`` works
# when the script is invoked directly. The shell wrapper cd's to the Otto
# repo root before exec'ing us, but ad-hoc imports (e.g. ``python3
# brakefast/scripts/scrape_smoke.py`` from any cwd) still need this.
MODULE_DIR = Path(__file__).resolve().parent
BRAKEFAST_DIR = MODULE_DIR.parent
SOURCES_JSON = BRAKEFAST_DIR / "sources.json"
OUTPUT_DIR = BRAKEFAST_DIR / "output"

if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from scraper_proxy import (  # noqa: E402  — sys.path-mutated above
    PROXIES,
    dispatch_fetch,
    match_domain,
    reset_stats_for_test,
)

# RSS fetch timeout. Feed endpoints are typically <300 ms; 10 s is a generous
# cap that still bounds total smoke runtime when a feed is slow or down.
_RSS_TIMEOUT = 10
_USER_AGENT = "BrakeFast-smoke/04.02 (manual; +https://ottobot.net)"


def _load_sources() -> dict[str, Any]:
    """Read ``brakefast/sources.json`` and return the parsed dict.

    Raises if the file is missing or malformed — smoke can't run without it.
    """
    with open(SOURCES_JSON, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _allowlist_pairs(sources_data: dict[str, Any]) -> list[tuple[str, str]]:
    """Extract the ``(domain, provider)`` pairs from ``settings.proxy.domains``.

    Ordering: scrape.do domains first (deterministic, by sort of
    ``settings.proxy.domains`` iteration), then alterlab. Operator
    readability — a one-line stdout summary should be cross-referenceable
    against the JSON in the order printed.
    """
    settings = sources_data.get("settings") or {}
    proxy = settings.get("proxy") or {}
    domains = proxy.get("domains") or {}
    if not isinstance(domains, dict):
        return []
    # Sort by (provider, domain) so scrapedo entries cluster ahead of
    # alterlab and within each provider domains are alphabetised.
    return sorted(
        ((d, p) for d, p in domains.items() if isinstance(d, str) and isinstance(p, str)),
        key=lambda pair: (pair[1], pair[0]),
    )


def _fetch_rss(feed_url: str) -> bytes | None:
    """Fetch raw RSS/Atom bytes for ``feed_url`` or return None on failure.

    Uses plain ``urllib.request`` with a 10 s timeout and a polite User-Agent.
    Returns None on any error — the caller will move to the next feed for
    the same domain, and if none yields a URL the smoke records a fail.
    """
    req = urllib.request.Request(feed_url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=_RSS_TIMEOUT) as resp:
            return resp.read()
    except Exception:  # noqa: BLE001 — any RSS error is "skip this feed"
        return None


def _first_link_from_rss(body: bytes) -> str | None:
    """Parse RSS/Atom bytes and return the first ``<item>/<link>`` URL.

    Handles both RSS 2.0 (``<channel><item><link>URL</link>``) and Atom
    (``<entry><link href="URL"/>``). Returns None if the feed yielded no
    parseable items.
    """
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return None

    # RSS 2.0 path: <rss><channel><item><link>URL</link>...
    for item in root.iter():
        # Strip XML namespace if present (Atom feeds carry one).
        tag = item.tag.split("}", 1)[-1]
        if tag == "item":
            for child in item:
                ctag = child.tag.split("}", 1)[-1]
                if ctag == "link" and child.text and child.text.strip():
                    return child.text.strip()
            # First <item> with no usable <link> — keep looking past it.
        if tag == "entry":
            # Atom: <entry><link href="..."/>... — pick the first link with
            # rel="alternate" (or no rel — Atom default is alternate).
            for child in item:
                ctag = child.tag.split("}", 1)[-1]
                if ctag == "link":
                    rel = child.attrib.get("rel", "alternate")
                    href = child.attrib.get("href")
                    if rel == "alternate" and href:
                        return href.strip()
    return None


def _first_rss_url_for_domain(
    domain: str,
    sources_data: dict[str, Any],
) -> str | None:
    """Walk ``sources.json`` and return the first RSS-supplied article URL
    whose hostname matches ``domain`` on a segment boundary.

    Algorithm:
      1. Iterate categories in document order; within each category,
         iterate feeds in document order.
      2. For each feed whose URL is itself segment-matched against
         ``{domain: "_"}``, fetch the feed body and extract the first item
         link.
      3. Return the first usable link found; None if no feed matched or
         every matched feed yielded no parseable items.

    The single-key allowlist ``{domain: "_"}`` reuses ``match_domain`` so
    the smoke uses the same segment-anchored host check the dispatcher does
    — `not-derstandard.at` correctly does NOT match `derstandard.at`.
    """
    needle = {domain: "_"}
    categories = sources_data.get("categories") or []
    if not isinstance(categories, list):
        return None
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        feeds = cat.get("feeds") or []
        if not isinstance(feeds, list):
            continue
        for feed in feeds:
            if not isinstance(feed, dict):
                continue
            url = feed.get("url")
            if not isinstance(url, str):
                continue
            # Match the feed URL's host against the allowlist domain.
            if match_domain(url, needle) is None:
                continue
            body = _fetch_rss(url)
            if body is None:
                continue
            link = _first_link_from_rss(body)
            if link:
                return link
    return None


def _run_one(domain: str, provider_name: str, url: str) -> dict[str, Any]:
    """Exercise the dispatcher against one ``(domain, provider, url)``.

    Records timing in ms, body size in bytes, DataDome canary presence, and
    last-call credits read off ``PROXIES[provider].last_credits``. Catches
    every exception so the outer loop always completes — operators want a
    full report, not a half-run.
    """
    t0 = time.monotonic()
    record: dict[str, Any] = {
        "domain": domain,
        "provider": provider_name,
        "url": url,
        "status": "fail",
        "http_status": None,
        "body_bytes": 0,
        "datadome_marker": None,
        "credits_used": 0,
        "duration_ms": 0,
    }
    try:
        html = dispatch_fetch(url)
        duration_ms = int((time.monotonic() - t0) * 1000)
        record["duration_ms"] = duration_ms

        if html is None:
            # dispatch_fetch returned None → URL was not in the allowlist.
            # That should not happen if _first_rss_url_for_domain returned
            # a URL whose host matches our allowlist domain, but record it
            # explicitly so the failure isn't silent.
            record["error"] = (
                "dispatch_fetch returned None — URL did not match allowlist "
                "(domain config drift?)"
            )
            return record

        body_bytes = len(html)
        # case-sensitive — spec §Testing
        datadome_marker = "DataDome" in html

        record["http_status"] = 200  # dispatch raises on non-200 paths
        record["body_bytes"] = body_bytes
        record["datadome_marker"] = datadome_marker

        # Read the provider's last_credits post-call. The provider instance
        # may be None if the key was missing at module-init — but in that
        # case dispatch_fetch would have raised RuntimeError before reaching
        # here. Defensive getattr regardless.
        proxy = PROXIES.get(provider_name)
        record["credits_used"] = int(getattr(proxy, "last_credits", 0) or 0)

        # Pass criteria per spec §Testing.
        if body_bytes > 1024 and not datadome_marker:
            record["status"] = "pass"
        else:
            reasons: list[str] = []
            if body_bytes <= 1024:
                reasons.append(f"body_bytes {body_bytes} <= 1024")
            if datadome_marker:
                reasons.append("DataDome substring present in body")
            record["error"] = "; ".join(reasons) or "unknown fail reason"
    except Exception as exc:  # noqa: BLE001 — record + continue
        record["duration_ms"] = int((time.monotonic() - t0) * 1000)
        record["error"] = f"{type(exc).__name__}: {exc}"
        # Still try to surface credits if the provider charged for a failed
        # call (scrape.do sometimes bills the worker time even on a 502
        # retry exhaustion).
        proxy = PROXIES.get(provider_name)
        record["credits_used"] = int(getattr(proxy, "last_credits", 0) or 0)
    return record


def main() -> int:
    """Smoke-test all allowlisted (domain, provider) pairs and write results.

    Returns the int exit code: 0 if all passed, 1 otherwise.
    """
    # Defensive reset of the dispatcher's in-process stats so a previous
    # failed pipeline run doesn't leave block_mode_triggered=True for this
    # process. In production the smoke runs in a fresh Python process and
    # this is a no-op; defence in depth for ad-hoc REPL runs.
    reset_stats_for_test()

    try:
        sources_data = _load_sources()
    except Exception as exc:  # noqa: BLE001
        print(f"smoke: failed to read {SOURCES_JSON}: {exc}", file=sys.stderr)
        return 1

    pairs = _allowlist_pairs(sources_data)
    if not pairs:
        print(
            "smoke: no allowlisted domains in sources.json settings.proxy.domains",
            file=sys.stderr,
        )
        return 1

    results: list[dict[str, Any]] = []
    for domain, provider_name in pairs:
        url = _first_rss_url_for_domain(domain, sources_data)
        if not url:
            results.append({
                "domain": domain,
                "provider": provider_name,
                "url": None,
                "status": "fail",
                "http_status": None,
                "body_bytes": 0,
                "datadome_marker": None,
                "credits_used": 0,
                "duration_ms": 0,
                "error": "no RSS URL found for domain",
            })
            continue
        results.append(_run_one(domain, provider_name, url))

    total = len(results)
    passed = sum(1 for r in results if r.get("status") == "pass")
    failed = total - passed
    total_credits = sum(int(r.get("credits_used") or 0) for r in results)

    envelope: dict[str, Any] = {
        "smoke_run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "total_credits": total_credits,
        },
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / (
        f"scrape-smoke-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
    )
    out_path.write_text(
        json.dumps(envelope, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # One-line stdout summary so the operator gets immediate feedback without
    # having to open the JSON file.
    print(
        f"smoke: {passed}/{total} pass, {failed} fail, "
        f"{total_credits} credits (wrote {out_path.name})"
    )

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
