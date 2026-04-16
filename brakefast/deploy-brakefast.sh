#!/usr/bin/env bash
# BrakeFast — Deploy Scripts to VPS
# Syncs brakefast/scripts/ to the OpenClaw container with correct permissions.
# Usage:
#   ./deploy-brakefast.sh              # deploy scripts
#   ./deploy-brakefast.sh --dry-run    # show what would change
#   ./deploy-brakefast.sh --sources    # also deploy sources.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
SOURCES_FILE="${SCRIPT_DIR}/sources.json"
SERVER="gerhard@clogzoehrer.ddns.net"
CONTAINER="openclaw-xfcd-openclaw-1"
REMOTE_SCRIPTS="/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts"
REMOTE_SOURCES="/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/sources.json"
REMOTE_TMP="/tmp/brakefast-deploy-$$"

DRY_RUN=0
DEPLOY_SOURCES=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --sources) DEPLOY_SOURCES=1 ;;
  esac
done

echo "=== BrakeFast Deploy ==="
echo "Source: ${SCRIPTS_DIR}"
echo "Target: ${SERVER}:${REMOTE_SCRIPTS}"

# Syntax check all Python files before uploading
echo ""
echo "Checking Python syntax..."
SYNTAX_OK=1
for py in "${SCRIPTS_DIR}"/*.py; do
  if ! python3 -c "import ast; ast.parse(open('${py}').read())" 2>/dev/null; then
    echo "  FAIL: $(basename "$py")"
    SYNTAX_OK=0
  else
    echo "  OK:   $(basename "$py")"
  fi
done
if [ "$SYNTAX_OK" -eq 0 ]; then
  echo "ERROR: Syntax check failed. Aborting deploy."
  exit 1
fi

# Syntax check shell scripts
echo ""
echo "Checking shell syntax..."
for sh in "${SCRIPTS_DIR}"/*.sh; do
  if ! bash -n "$sh" 2>/dev/null; then
    echo "  FAIL: $(basename "$sh")"
    SYNTAX_OK=0
  else
    echo "  OK:   $(basename "$sh")"
  fi
done
if [ "$SYNTAX_OK" -eq 0 ]; then
  echo "ERROR: Syntax check failed. Aborting deploy."
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "=== DRY RUN — showing diff ==="
  ssh -o ConnectTimeout=15 "$SERVER" "sudo docker exec $CONTAINER ls $REMOTE_SCRIPTS/" | while read -r f; do
    local_file="${SCRIPTS_DIR}/${f}"
    if [ -f "$local_file" ]; then
      # Pull remote file and diff
      remote_content=$(ssh "$SERVER" "sudo docker exec $CONTAINER cat $REMOTE_SCRIPTS/$f" 2>/dev/null || true)
      local_content=$(cat "$local_file")
      if [ "$remote_content" != "$local_content" ]; then
        echo "CHANGED: $f"
      fi
    else
      echo "REMOTE ONLY: $f"
    fi
  done
  for f in "${SCRIPTS_DIR}"/*.{py,sh}; do
    fname=$(basename "$f")
    remote_check=$(ssh "$SERVER" "sudo docker exec $CONTAINER test -f $REMOTE_SCRIPTS/$fname && echo yes || echo no" 2>/dev/null)
    if [ "$remote_check" = "no" ]; then
      echo "NEW: $fname"
    fi
  done
  echo ""
  echo "No changes made (dry run)."
  exit 0
fi

# Upload scripts
echo ""
echo "Uploading scripts..."
ssh -o ConnectTimeout=15 "$SERVER" "mkdir -p $REMOTE_TMP"
scp -q "${SCRIPTS_DIR}"/*.py "${SCRIPTS_DIR}"/*.sh "${SERVER}:${REMOTE_TMP}/"
echo "  Uploaded $(ls "${SCRIPTS_DIR}"/*.py "${SCRIPTS_DIR}"/*.sh 2>/dev/null | wc -l | tr -d ' ') files"

# Upload sources.json if requested
if [ "$DEPLOY_SOURCES" -eq 1 ] && [ -f "$SOURCES_FILE" ]; then
  scp -q "$SOURCES_FILE" "${SERVER}:${REMOTE_TMP}/sources.json"
  echo "  Uploaded sources.json"
fi

# Copy into container with correct permissions
echo ""
echo "Installing into container..."
ssh "$SERVER" "
  sudo docker cp $REMOTE_TMP/. $CONTAINER:$REMOTE_SCRIPTS/ &&
  sudo docker exec $CONTAINER chown -R node:node $REMOTE_SCRIPTS/ &&
  echo '  Permissions set to node:node'
"

# Deploy sources.json if requested
if [ "$DEPLOY_SOURCES" -eq 1 ]; then
  ssh "$SERVER" "
    if [ -f $REMOTE_TMP/sources.json ]; then
      sudo docker cp $REMOTE_TMP/sources.json $CONTAINER:$REMOTE_SOURCES &&
      sudo docker exec $CONTAINER chown node:node $REMOTE_SOURCES &&
      echo '  sources.json deployed'
    fi
  "
fi

# Cleanup
ssh "$SERVER" "rm -rf $REMOTE_TMP"

echo ""
echo "=== Deploy complete ==="
echo "To test: ssh $SERVER \"sudo docker exec $CONTAINER su -s /bin/bash node -c 'python3 $REMOTE_SCRIPTS/curate.py --auto'\""
