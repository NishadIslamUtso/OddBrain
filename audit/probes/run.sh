#!/usr/bin/env bash
# Usage: audit/probes/run.sh <build|probe-video|probe-media|probe-direct|timing|ipc-wiring|reach> [args]
# Needs Node 24 (the app's own requirement). Linux/macOS/WSL.
# Runs from a scratch folder on purpose: the app's current ffmpeg loudness command leaves a stray empty
# file called "pipe" in its working directory (defect D1), and that must not land in the repo.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="${OB_APP_ROOT:-$(cd "$DIR/../../apps/03_oddbrain" && pwd)}"
WORK="${AUDIT_WORK:-${TMPDIR:-/tmp}/oddbrain-audit}"
export NODE_PATH="$APP_ROOT/node_modules"
export PATH="${AUDIT_MEDIA_BIN:-$WORK/media/bin}:$PATH"
mkdir -p "$WORK/cwd" && cd "$WORK/cwd"
[ -f "$DIR/out/video-service.cjs" ] || node "$DIR/build.cjs"
case "${1:-}" in build) node "$DIR/build.cjs"; exit 0;; "") echo "usage: run.sh <probe-name> [args]"; exit 2;; esac
exec node "$DIR/$1.cjs" "${@:2}"
