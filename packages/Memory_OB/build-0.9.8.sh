#!/usr/bin/env bash
# Rebuild the Memory_OB 0.9.8 ZIP without switching branches or importing the
# unrelated OddBrain desktop-app changes from the source branch.
# Requires Node.js 24, npm, Python 3 and the pinned source commit in local Git.
set -euo pipefail

base=0d5f5ce95fb2cce017dc42b9d539dee65f8afc6e
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
patch="$repo/packages/Memory_OB/0.9.8-from-0d5f5ce.patch"
output="$repo/release/Memory_OB-addon-0.9.8.zip"

if [[ $(node -p "process.versions.node.split('.')[0]") != 24 ]]; then
  echo 'Node.js 24 is required to build the source.' >&2
  exit 1
fi
if ! git -C "$repo" cat-file -e "$base^{commit}"; then
  echo "Pinned source $base is missing. Fetch it from origin first." >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

git -C "$repo" archive "$base" | tar -xf - -C "$work"
(cd "$work" && git apply --check "$patch" && git apply "$patch")
patch_sha=$(sha256sum "$patch" | cut -d' ' -f1)

(
  cd "$work/apps/03_oddbrain"
  # No old regression tests; new changes are independently checked after build.
  npm ci --ignore-scripts --no-audit --no-fund
  npm run typecheck
  npm run build:memory-ob
  npm run build:brain-window
  npm run build:web
  ODDBRAIN_SOURCE_COMMIT="$base" ODDBRAIN_PATCH_SHA256="$patch_sha" npm run package:addon
)

source_zip="$work/packages/Memory_OB/dist-addon/Memory_OB-addon-0.9.8.zip"
[[ -s "$source_zip" ]] || { echo 'The ZIP was not produced.' >&2; exit 1; }
mkdir -p "$repo/release"
cp "$source_zip" "$output"
sha256sum "$output"
