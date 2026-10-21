#!/usr/bin/env bash
# Times the scene-detection pass the way the reader runs it, with the output target fixed (file=-), on a
# normally encoded 5-minute 720p video with 19 real cuts. Compares reading every frame with keyframes only.
# Needs make-media.sh to have run. Linux/macOS/WSL.
set -euo pipefail
WORK="${AUDIT_WORK:-${TMPDIR:-/tmp}/oddbrain-audit}"; BIN="${AUDIT_MEDIA_BIN:-$WORK/media/bin}"; MEDIA="${AUDIT_MEDIA_WORK:-$WORK/media/work}"
F="$BIN/ffmpeg"; cd "$MEDIA"
[ -f real300.mp4 ] || { "$F" -hide_banner -loglevel error -y -i test75.mp4 -c:v libx264 -preset medium -crf 23 -g 250 -c:a aac -b:a 128k real75.mp4
                        "$F" -hide_banner -loglevel error -y -stream_loop 3 -i real75.mp4 -c copy real300.mp4; }
IN="-hide_banner -loglevel error -nostdin -protocol_whitelist file,pipe -max_alloc 134217728"
t() { local label="$1"; shift; local s e out n; s=$(date +%s%N); out=$("$F" $IN "$@" -f null - 2>&1); e=$(date +%s%N)
      n=$(echo "$out" | grep -c scene_score || true); printf "%-46s %6d ms   cuts reported: %s (19 real)\n" "$label" $(( (e - s) / 1000000 )) "$n"; }
t "A every frame, -threads 2 (as shipped)" -threads 2 -i real300.mp4 -an -vf "fps=2,scale=320:-2,select='gt(scene,0.12)',metadata=print:file=-"
t "B every frame, default threads"         -i real300.mp4 -an -vf "fps=2,scale=320:-2,select='gt(scene,0.12)',metadata=print:file=-"
t "C keyframes only (-skip_frame nokey)"   -skip_frame nokey -i real300.mp4 -an -vf "scale=320:-2,select='gt(scene,0.12)',metadata=print:file=-" -fps_mode passthrough
