#!/usr/bin/env python3
"""Validate a BrakeFast edition JSON before publishing.

Runs blocking and warning checks, injects meta object on success.

Usage:
    python3 validate_edition.py <json_file> [data_tier]
    python3 validate_edition.py --help

Exit codes:
    0 - Valid (warnings may be present)
    1 - Blocking errors found
"""
import json
import sys
from datetime import datetime, timezone

PIPELINE_VERSION = "1.4.0"


def print_err(msg):
    print(msg, file=sys.stderr)


def validate(data):
    """Run all checks. Returns (errors: list[str], warnings: list[str])."""
    errors = []
    warnings = []

    # --- Collect all articles across categories ---
    categories = data.get("categories", {})
    all_articles = []
    for cat_key, cat_val in categories.items():
        if not isinstance(cat_val, dict):
            continue
        articles = cat_val.get("articles", [])
        if not isinstance(articles, list):
            continue
        all_articles.extend(articles)

        # WARN: category with fewer than 3 articles
        if len(articles) < 3:
            warnings.append(f"Category '{cat_key}' has only {len(articles)} article(s)")

    # --- BLOCKING: article field checks ---
    for i, article in enumerate(all_articles):
        title = (article.get("title") or "").strip()
        link = (article.get("link") or "").strip()
        summary = (article.get("summary") or "").strip()
        description = (article.get("description") or "").strip()

        if not title:
            errors.append(f"Article {i}: missing title")
        if not link:
            errors.append(f"Article {i}: missing link")
        if not summary and not description:
            errors.append(f"Article {i}: missing summary and description (need at least one)")

    # --- BLOCKING: minimum article count ---
    if len(all_articles) < 20:
        errors.append(f"Total article count is {len(all_articles)}, need >= 20")

    # --- BLOCKING: editorial ---
    editorial = data.get("editorial", "")
    if not isinstance(editorial, str) or len(editorial.strip()) < 10:
        errors.append("editorial missing or too short (need >= 10 chars)")

    # --- BLOCKING: widgets.quote ---
    widgets = data.get("widgets", {})
    quote = widgets.get("quote", {})
    if not isinstance(quote, dict) or not quote.get("text") or not quote.get("author"):
        errors.append("widgets.quote missing or lacks 'text'/'author'")

    # --- BLOCKING: widgets.history ---
    history_raw = widgets.get("history", [])
    # Handle single dict or array
    if isinstance(history_raw, dict):
        history_items = [history_raw]
    elif isinstance(history_raw, list):
        history_items = history_raw
    else:
        history_items = []

    if len(history_items) < 2:
        errors.append(f"widgets.history has {len(history_items)} item(s), need >= 2")
    else:
        for j, item in enumerate(history_items):
            if not isinstance(item, dict) or not item.get("wiki"):
                errors.append(f"widgets.history[{j}]: missing 'wiki' field")

    # --- BLOCKING: widgets.namenstag ---
    namenstag = widgets.get("namenstag", "")
    if not namenstag:
        errors.append("widgets.namenstag missing or empty")

    # --- BLOCKING: ki_modelle and dev_digest link checks ---
    for section_name in ("ki_modelle", "dev_digest"):
        section = data.get(section_name, {})
        if isinstance(section, dict):
            for key, item in section.items():
                if isinstance(item, dict) and not item.get("link"):
                    errors.append(f"{section_name}['{key}']: missing 'link' field")

    # --- WARN: image coverage ---
    if all_articles:
        articles_with_image = sum(
            1 for a in all_articles if (a.get("image") or "").strip()
        )
        ratio_missing = 1 - (articles_with_image / len(all_articles))
        if ratio_missing > 0.30:
            warnings.append(
                f"Image URLs missing on {ratio_missing:.0%} of articles (>{30}% threshold)"
            )

    # --- WARN: bauernregel ---
    if not widgets.get("bauernregel"):
        warnings.append("widgets.bauernregel is missing")

    # --- WARN: heuristic enrichment ratio ---
    if all_articles:
        heuristic_count = sum(
            1 for a in all_articles
            if a.get("enrichment_method") == "heuristic"
            or a.get("processing_status") == "heuristic"
        )
        ratio = heuristic_count / len(all_articles)
        if ratio > 0.40:
            warnings.append(
                f"{ratio:.0%} of articles are heuristic-enriched (>{40}% threshold)"
            )

    # --- WARN: history wiki fields with spaces ---
    for j, item in enumerate(history_items):
        if isinstance(item, dict):
            wiki = item.get("wiki", "")
            if isinstance(wiki, str) and " " in wiki:
                warnings.append(f"widgets.history[{j}].wiki contains spaces: '{wiki}'")

    return errors, warnings


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print_err("Usage: python3 validate_edition.py <json_file> [data_tier]")
        print_err("  json_file  - Path to edition JSON")
        print_err("  data_tier  - Optional tier label (default: 'unknown')")
        sys.exit(0 if "--help" in sys.argv or "-h" in sys.argv else 1)

    json_path = sys.argv[1]
    data_tier = sys.argv[2] if len(sys.argv) > 2 else "unknown"

    # Load JSON
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print_err(f"ERROR: Cannot load {json_path}: {e}")
        sys.exit(1)

    if not isinstance(data, dict):
        print_err("ERROR: Top-level JSON must be an object")
        sys.exit(1)

    errors, warnings = validate(data)

    # Print errors
    for err in errors:
        print_err(f"ERROR: {err}")

    # Print warnings
    for warn in warnings:
        print_err(f"WARN: {warn}")

    if errors:
        print_err(f"\nValidation FAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        sys.exit(1)

    # Inject meta and write back
    data["meta"] = {
        "data_tier": data_tier,
        "pipeline_version": PIPELINE_VERSION,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "warnings": warnings,
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    summary = f"Validation PASSED: {len(warnings)} warning(s)"
    if warnings:
        summary += " (see above)"
    print_err(f"\n{summary}")


if __name__ == "__main__":
    main()
