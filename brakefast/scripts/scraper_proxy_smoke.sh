#!/usr/bin/env bash
# Manual smoke test for Phase 04.02 — burns paid credits.
# NOT for cron use. Invoke ad-hoc only.
#
# Sources `load-brakefast-env.sh` so SCRAPEDO_KEY and ALTERLAB_KEY are in the
# environment before the Python dispatcher initialises, then execs the
# `scrape_smoke.py` runner. The runner writes per-(provider, domain) results
# to `brakefast/output/scrape-smoke-YYYY-MM-DD.json` and prints a one-line
# summary to stdout. Exit 0 iff every domain passed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAKEFAST_DIR="$(dirname "$SCRIPT_DIR")"

# Load env vars (SCRAPEDO_KEY, ALTERLAB_KEY, etc.) from the Otto Secrets dir.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-brakefast-env.sh"

# Otto repo root — so that `brakefast/...` references in any downstream
# import resolve relative to the project root regardless of caller cwd.
cd "$(dirname "$BRAKEFAST_DIR")"

exec python3 "${SCRIPT_DIR}/scrape_smoke.py" "$@"
