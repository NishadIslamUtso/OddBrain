# Audit evidence (2026-10-21)

This folder holds the **evidence behind `AUDIT_REPORT.md` and `PONYTAIL_AUDIT.md`**. It is not part of the app, is not wired into
`package.json` or CI, and is not the test suite (the tests were removed on purpose and will be rebuilt later).
Delete the folder at any time; nothing in the app depends on it.

The probes run the **shipped app code unmodified** (bundled with the app's own esbuild) against **real
programs** (ffmpeg, ffprobe, yt-dlp) and against a **stand-in Kdenlive server** that reproduces the
published protocol of the pinned fork commit (`lucasscariot/kdenlive@b9a1a6c`): its 60 tool names, its
result envelope, its error codes, its `desktop_state` shape, its "404 for an unknown session" rule and its
`desktop_batch_validate` behaviour. The stand-in is **not Kdenlive**: it proves the app speaks the protocol
correctly, not that a real Kdenlive build behaves the same.

## Run it (Linux, macOS or WSL; Node 24, as the app requires)

```bash
cd apps/03_oddbrain && npm ci --ignore-scripts && cd ../..           # installs the app's own dependencies
export AUDIT_WORK=/tmp/oddbrain-audit                                 # scratch folder
export AUDIT_MEDIA_BIN=$AUDIT_WORK/media/bin                          # must contain ffmpeg and ffprobe (same folder)
export AUDIT_YTDLP=/absolute/path/to/yt-dlp                           # any recent yt-dlp executable

audit/probes/make-media.sh                  # makes the synthetic test videos (needs ffmpeg in $AUDIT_MEDIA_BIN)
audit/probes/run.sh probe-video             # Kdenlive protocol, AI tools, plan flow, Creative Library, link rules
audit/probes/run.sh probe-direct            # direct-link download end to end + private-address (SSRF) refusal
audit/probes/run.sh probe-media             # real ffmpeg reader + real yt-dlp journey (needs AUDIT_YTDLP)
SHIM_FIXED_PIPE=1 audit/probes/run.sh probe-media   # same, but with the one-argument ffmpeg fix applied inside the probe
audit/probes/run.sh timing "$AUDIT_WORK/media/work/test300.mp4"   # reader speed per phase
audit/probes/run.sh ipc-wiring              # every renderer->main channel has a handler?
audit/probes/run.sh reach                   # source files not reachable from the real entry points

# Added for PONYTAIL_AUDIT.md (measured):
audit/probes/run.sh probe-evidence-size     # how many one-hour videos fit in video-evidence-v1.json
audit/probes/run.sh probe-backup-stall      # how long the real backupVault freezes the event loop (AUDIT_BACKUP_MB, default 1024)
audit/probes/run.sh probe-vault-search      # real searchVault time per query as the vault grows (AUDIT_VAULT_NOTES=76,3000,20000)
audit/probes/probe-scene-speed.sh           # scene pass: every frame vs keyframes only (run make-media.sh first)

# Added for PONYTAIL_AUDIT.md (counted by reading the code):
audit/probes/run.sh static-unused-exports   # functions nothing calls; rewrites audit/dead-code.txt (needs commit ba66c9d in the clone)
audit/probes/run.sh static-duplicates       # identical helper functions copied into several files
audit/probes/run.sh static-empty-catches    # empty catch blocks
audit/probes/run.sh static-ignored-errors   # catch blocks that never look at the error, grouped by what they wrap
audit/probes/run.sh static-readability      # function lengths, comment share, long lines
audit/probes/run.sh static-deps             # dependencies nothing references, and the leftover test-only tools
```

Where to get the tools without installing anything system-wide (what I used):

```bash
python3 -m venv .venv && .venv/bin/pip install imageio-ffmpeg yt-dlp      # ffmpeg 7.0.2 binary + yt-dlp
mkdir -p $AUDIT_MEDIA_BIN
ln -s "$(.venv/bin/python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')" $AUDIT_MEDIA_BIN/ffmpeg
npm i --prefix $AUDIT_WORK/tools @ffprobe-installer/linux-x64            # then link its ffprobe into $AUDIT_MEDIA_BIN
export AUDIT_YTDLP=$PWD/.venv/bin/yt-dlp
```

The `probe-media` journey starts a tiny local web server on port 8099 (`AUDIT_DASH_PORT` to change it) that
serves the DASH copy of the test video, so YouTube-style separate audio/video streams can be tested offline.

## What each probe proves

| File | IDs | Proves |
| --- | --- | --- |
| `probe-video.cjs` | A01–A15 | Handshake and compatibility check; what the AI actually receives; whether it can see tracks/clips/bin IDs; review → approve → apply → Undo; stale-project block; session-expiry behaviour; "Versions"; frame capture; bearer token; the review server's 404/ping/error behaviour; the command grammar given to the AI |
| `probe-video.cjs` | B01–B05 | Creative Library: provider starvation in the AI search, licence handling, Openverse duration units, no-key behaviour, coverage by kind |
| `probe-video.cjs` | C01 | Which public links preflight accepts |
| `probe-media.cjs` | M01–M07 | The real reader on a real video (loudness, pauses, scene cuts, frames); link → yt-dlp → reader with and without ffmpeg on PATH; what the AI sees; question-driven frames/audio; notes; the durable evidence file |
| `probe-direct.cjs` | S01, D01–D02 | Private/loopback addresses refused before any request; direct-link download, hash receipt and automatic reading |
| `timing.cjs` | — | Reader time per phase |
| `probe-evidence-size.cjs` | B-series in PONYTAIL_AUDIT | The evidence file refuses to save after about 45 one-hour videos |
| `probe-backup-stall.cjs`, `probe-vault-search.cjs` | same | Backup and vault search block the main thread for as long as they run |
| `probe-scene-speed.sh` | same | Scene pass time, every frame versus keyframes only |
| `static-*.cjs` | same | Counts: dead code, copies, swallowed errors, long functions, unused dependencies |
| `ipc-wiring.cjs`, `reach.cjs` | — | Static wiring and reachability |

Verdict words: **PASS** works as promised, **DEFECT** broken or missing against the plan, **WARN** works
with a caveat, **INFO** a measurement or a fact to read.

When the test suite is rebuilt, these probes are good first tests: each DEFECT here was found on its first
run against a real program, which the old fake-based tests could not do.
