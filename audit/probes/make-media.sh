#!/usr/bin/env bash
# Builds the synthetic test videos the probes need: a 75 s video with 5 hard scene cuts and a tone/silence
# audio pattern (10 s tone + 5 s silence per scene), a 300 s loop of it, and a DASH copy with SEPARATE
# video and audio streams (how YouTube delivers media) for the yt-dlp merge test.
set -euo pipefail
WORK="${AUDIT_WORK:-${TMPDIR:-/tmp}/oddbrain-audit}"
BIN="${AUDIT_MEDIA_BIN:-$WORK/media/bin}"
OUT="${AUDIT_MEDIA_WORK:-$WORK/media/work}"
F="$BIN/ffmpeg"; [ -x "$F" ] || { echo "ffmpeg not found at $F (set AUDIT_MEDIA_BIN)"; exit 1; }
mkdir -p "$OUT" && cd "$OUT"
S=1280x720
gen() { "$F" -hide_banner -loglevel error -y -f lavfi -i "$2,format=yuv420p" -f lavfi -i "sine=frequency=$3:sample_rate=48000" -t 15 \
  -af "atrim=0:10,apad=whole_dur=15" -c:v libx264 -preset ultrafast -r 30 -g 30 -c:a aac -b:a 96k -shortest "$1.mp4"; }
gen s1 "testsrc2=size=$S:rate=30" 440
gen s2 "smptebars=size=$S:rate=30" 660
gen s3 "color=c=0x1e5aa8:size=$S:rate=30" 330
gen s4 "mandelbrot=size=$S:rate=30" 550
gen s5 "life=size=$S:rate=30:mold=10:ratio=0.1:death_color=#C83232:life_color=#00ff00" 770
printf "file 's1.mp4'\nfile 's2.mp4'\nfile 's3.mp4'\nfile 's4.mp4'\nfile 's5.mp4'\n" > list.txt
"$F" -hide_banner -loglevel error -y -f concat -safe 0 -i list.txt -c copy test75.mp4
"$F" -hide_banner -loglevel error -y -stream_loop 3 -i test75.mp4 -c copy test300.mp4
mkdir -p dash && rm -f dash/*
"$F" -hide_banner -loglevel error -y -i test75.mp4 -map 0:v -map 0:a -c copy -f dash -seg_duration 5 -use_template 1 -use_timeline 1 \
  -adaptation_sets "id=0,streams=v id=1,streams=a" dash/manifest.mpd
# What the stand-in editor "renders": 2 s, 360x640, with audio, so preview inspection can run the real reader.
"$F" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=360x640:rate=30" -f lavfi -i "sine=frequency=500:sample_rate=48000" -t 2 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest render-sample.mp4
echo "media ready in $OUT"
