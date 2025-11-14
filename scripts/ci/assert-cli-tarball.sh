#!/usr/bin/env bash
# scripts/ci/assert-cli-tarball.sh
# Validates CLI tarball structure and contents before distribution

set -euo pipefail

DIST_DIR="${1:-dist-packages}"

echo "Validating CLI tarball in: $DIST_DIR"

# Find CLI tarball
CLI_TGZ=$(ls "${DIST_DIR}"/uimatch-cli-*.tgz 2>/dev/null || true)

if [[ -z "$CLI_TGZ" ]]; then
  echo "❌ CLI tarball not found in $DIST_DIR"
  ls -la "$DIST_DIR" || true
  exit 1
fi

echo "Found tarball: $CLI_TGZ"

#
# Check bin entry point exists.
# NOTE: Temporarily disable pipefail to avoid tar|grep -q SIGPIPE issue.
# When grep -q finds a match, it exits immediately, causing tar to receive
# SIGPIPE and exit with status 141. With pipefail enabled, this causes the
# entire pipeline to fail even though grep succeeded.
#
set +o pipefail
tar -tzf "$CLI_TGZ" | grep -q 'package/dist/cli/index.js'
TAR_GREP_STATUS=$?
set -o pipefail

if [ "$TAR_GREP_STATUS" -ne 0 ]; then
  echo "❌ CLI tarball missing bin entry point: package/dist/cli/index.js"
  echo "Tarball contents:"
  tar -tzf "$CLI_TGZ"
  exit 1
fi

# Display package.json metadata
echo "Package metadata:"
tar -xOzf "$CLI_TGZ" package/package.json | jq '{name, version, bin, files}'

echo "✅ CLI tarball validation passed"
