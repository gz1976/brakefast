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
SERVER="${BRAKEFAST_SERVER:-otto-vps}"
CONTAINER="openclaw-xfcd-openclaw-1"
HOST_SCRIPTS="/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts"
HOST_SOURCES="/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/sources.json"
HOST_BACKUPS="/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/deploy-backups"
CONTAINER_SCRIPTS="/data/.openclaw/workspace/brakefast/scripts"
CONTAINER_SOURCES="/data/.openclaw/workspace/brakefast/sources.json"
REMOTE_TMP="/tmp/brakefast-deploy-$$"
DEPLOY_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

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
echo "Target: ${SERVER}:${HOST_SCRIPTS}"

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

DEPLOY_FILES=()
for file in "${SCRIPTS_DIR}"/*.py "${SCRIPTS_DIR}"/*.sh; do
  case "$(basename "$file")" in
    *_test.py|conftest.py) continue ;;
  esac
  DEPLOY_FILES+=("$file")
done

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
  for file in "${DEPLOY_FILES[@]}"; do
    fname=$(basename "$file")
    local_hash=$(shasum -a 256 "$file" | awk '{print $1}')
    remote_hash=$(ssh "$SERVER" "sudo sha256sum '$HOST_SCRIPTS/$fname' 2>/dev/null | awk '{print \$1}'" || true)
    if [ -z "$remote_hash" ]; then
      echo "NEW: $fname"
    elif [ "$local_hash" != "$remote_hash" ]; then
      echo "CHANGED: $fname"
    fi
  done
  echo ""
  echo "No changes made (dry run)."
  exit 0
fi

# Upload scripts to host, then copy into container
echo ""
echo "Uploading scripts..."
ssh -o ConnectTimeout=15 "$SERVER" "mkdir -p $REMOTE_TMP"
# Remove the remote tmp dir on every exit, also when a later step fails under set -e
cleanup_remote_tmp() {
  trap - EXIT
  ssh "$SERVER" "case '$REMOTE_TMP' in /tmp/brakefast-deploy-*) rm -rf -- '$REMOTE_TMP' ;; *) exit 2 ;; esac" ||
    echo "WARNING: could not remove $REMOTE_TMP on $SERVER"
}
trap cleanup_remote_tmp EXIT
scp -q "${DEPLOY_FILES[@]}" "${SERVER}:${REMOTE_TMP}/"
echo "  Uploaded ${#DEPLOY_FILES[@]} production files"

# Upload sources.json if requested
if [ "$DEPLOY_SOURCES" -eq 1 ] && [ -f "$SOURCES_FILE" ]; then
  scp -q "$SOURCES_FILE" "${SERVER}:${REMOTE_TMP}/sources.json"
  echo "  Uploaded sources.json"
fi

# Copy from host tmp to host-mapped container volume, then fix permissions
# (chown via find under sudo: the SSH user cannot list $HOST_SCRIPTS, a glob would stay literal)
echo ""
echo "Installing into container..."
ssh "$SERVER" "
  sudo mkdir -p '$HOST_BACKUPS/$DEPLOY_STAMP' &&
  sudo cp -a '$HOST_SCRIPTS/.' '$HOST_BACKUPS/$DEPLOY_STAMP/' &&
  sudo sh -c \"sha256sum '$HOST_BACKUPS/$DEPLOY_STAMP/'*.py '$HOST_BACKUPS/$DEPLOY_STAMP/'*.sh > '$HOST_BACKUPS/$DEPLOY_STAMP/SHA256SUMS.before' 2>/dev/null\" &&
  sudo cp ${REMOTE_TMP}/*.py ${REMOTE_TMP}/*.sh ${HOST_SCRIPTS}/ &&
  sudo find '$HOST_SCRIPTS' -maxdepth 1 \( -name '*.py' -o -name '*.sh' \) -exec chown 1000:1000 {} + &&
  echo '  Scripts installed with node:node (uid 1000) permissions' &&
  echo '  Backup: $HOST_BACKUPS/$DEPLOY_STAMP'
"

# Deploy sources.json if requested
if [ "$DEPLOY_SOURCES" -eq 1 ]; then
  ssh "$SERVER" "
    if [ -f $REMOTE_TMP/sources.json ]; then
      sudo cp '$HOST_SOURCES' '$HOST_BACKUPS/$DEPLOY_STAMP/sources.json.before' &&
      sudo cp $REMOTE_TMP/sources.json $HOST_SOURCES &&
      sudo chown 1000:1000 $HOST_SOURCES &&
      echo '  sources.json deployed'
    fi
  "
fi

# Cleanup
cleanup_remote_tmp

# Verify deployment
echo ""
echo "Verifying..."
ssh "$SERVER" "sudo docker exec $CONTAINER python3 -c 'import ast; ast.parse(open(\"$CONTAINER_SCRIPTS/curate.py\").read()); print(\"  curate.py: syntax OK\")'"
for file in "${DEPLOY_FILES[@]}"; do
  fname=$(basename "$file")
  local_hash=$(shasum -a 256 "$file" | awk '{print $1}')
  remote_hash=$(ssh "$SERVER" "sudo sha256sum '$HOST_SCRIPTS/$fname' | awk '{print \$1}'")
  if [ "$local_hash" != "$remote_hash" ]; then
    echo "ERROR: hash mismatch after deploy: $fname"
    exit 1
  fi
done
echo "  All deployed file hashes match"

echo ""
echo "=== Deploy complete ==="
echo "To test: ssh $SERVER \"sudo docker exec $CONTAINER su -s /bin/bash node -c 'python3 $CONTAINER_SCRIPTS/curate.py --auto'\""
