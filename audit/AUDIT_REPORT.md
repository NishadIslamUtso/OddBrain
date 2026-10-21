# OddBrain audit — 2026-10-21

Branch `arena/ea9d1c5c-oddbrain` = PR #12 head `ba66c9d` with all tests removed (commit `2236821`).
No repo test was run. Claims come from compiling, building, **running the shipped code against real
programs**, or reading the code (marked "code read" where that is the only proof).
Evidence and re-runnable probes: [`audit/README.md`](README.md) and `audit/probes/`.

---

## 1. The short version

**What I did.** Removed all tests (245 test files, 13 UI-check scripts, the test steps in CI and README: 268 files,
−30,155 lines; app code untouched). Then judged the code my own way: compile, build, security gates, and a
real run of the Video Studio against real ffmpeg, real yt-dlp, and a stand-in Kdenlive server built from the
Kdenlive fork's own source.

**Verdict.**

1. **The app is not broadly broken.** Zero type errors, both builds pass, security gates pass, zero vulnerable
   packages, all 263 screen→backend channels are connected, no dead code. I found no sign of the "many broken
   things" at that level. (I never ran the old tests, so I can't say how many were broken.)
2. **The Video Studio is a good frame with hollow parts.** Of the 35 things the plan promised:
   **13 work · 7 work partly · 7 are broken · 6 are not built · 2 I can't check from here.**
3. **The safety machinery works** (approval cards, one-use approvals, stale-project block, one-step Undo).
   **The parts that touch real programs don't.** Every one of those was only ever tested against pretend
   programs, and my first real run found the failures within minutes.

**The six problems that matter most**

| # | Problem (plain words) | Size of fix |
| --- | --- | --- |
| 1 | The video reader's loudness, pause and scene-cut commands are rejected by ffmpeg. A video with 4 hard cuts came back with **0 cuts, no loudness, no pauses and one frame.** | 3 small edits + clearer errors |
| 2 | The AI **cannot write a working edit**: it can't see track/clip/asset IDs and is never told the command format. | 1 turn |
| 3 | The transcript is **one paragraph per 10 minutes**: no word or sentence times, no speakers. | 1–1.5 turns (whisper.cpp) |
| 4 | There is **no Kdenlive you can run on Windows** that the app can drive (the fork has no Windows build). | Decision + 1-day spike |
| 5 | YouTube-style downloads **fail** on a PC where ffmpeg isn't on PATH, with a cryptic error and a false message. | ½ turn |
| 6 | The existing **OCR adapter isn't connected** to video, although the Settings page says it is. | ½ turn |

**Why nobody noticed.** The old tests used stand-ins for ffmpeg, yt-dlp and Kdenlive. A stand-in can't be wrong
the way a real program is. Expect the same wherever the app talks to a real program or website: test those once
for real (§8).

**What I need from you:** five decisions and a 15-minute check on your PC (§9).

---

## 2. How I judged it, and what I could not check

**Real:** ffmpeg 7.0.2 and 4.2.2, ffprobe, yt-dlp 2026.08.19, Node 24.22 (the app requires 24), the app's own
esbuild/tsc/electron-vite, the shipped modules bundled **unmodified**.

**Stand-ins (stated plainly):**
- *Kdenlive:* a fake server written from the fork's source at the pinned commit: 60 tool names, result envelope,
  real error codes (`SESSION_CHANGED`, `REVISION_CONFLICT`, `UNKNOWN_BIN/CLIP/TRACK`, `VALIDATION_UNSUPPORTED`),
  the `desktop_state` shape, "unknown session → HTTP 404", and `desktop_batch_validate` exactly as the engine
  code writes it. Its *edit effects* are a toy. Results are "the app speaks the protocol correctly", **not**
  "tested on Kdenlive".
- *Provider websites* (Openverse, Wikimedia, Pixabay): mocked in the shape their own source/docs define.
- *Speech recognition:* stubbed (see below).

**I could not run, so these are unverified:**
- The Electron app itself (no GUI libraries; the Electron download is blocked here). So no screenshots, no
  click-through, no installer.
- Anything Windows-only: System.Speech accuracy, the installer, `kdenlive.exe`, Windows ffmpeg builds.
- Real YouTube/TikTok/Instagram. yt-dlp ran against a local YouTube-style stream (separate video and audio).
- Live Openverse / Wikimedia / Pixabay responses.
- The AI engines (Claude Code, agy) consuming the MCP server, and whether your Ollama models accept images
  returned by tools.
- The OCR adapter (it is not in the repo; only OddBrain's side of the protocol is).
- The ~48k lines outside the video feature: chats, vault, memory, engines, scheduling, attachments, extension.
  I verified compile, build, security gates, IPC wiring and reachability only. **Not broken ≠ proven fine.**

---

## 3. Health of the whole app

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict) | 0 errors |
| `npm run build` / `build:web` | pass (2 cosmetic CSS warnings) |
| `security:policy`, `security:release` | pass |
| `npm audit` | 0 vulnerabilities; all 29 pinned dependencies exist on npm |
| IPC wiring | 263 channels invoked by the UI, 264 handled; 0 missing. 1 intentional unused (`skills:deploy`) |
| Dead code | none; the 10 files esbuild can't reach are type-only |
| Size | 369 TS/TSX files, 50,207 lines; `main/index.ts` alone is 2,928 lines |
| Risk signs | 137 empty catches and 322 `try/catch` blocks that never look at the error (a syntax-tree count; my first text search said 62); 616 lines longer than 300 characters (longest 1,286); 48 `any`; 0 TODO/FIXME |

Swallowed errors are not cosmetic: `catch { scenes = [] }` is exactly why the broken ffmpeg commands (D1)
looked fine. Only three catches in the whole app wrap an external program, and all three are those ffmpeg passes.

---

## 4. Video Studio scorecard (35 items from your plan)

✅ works and I proved it · 🟡 partly · ❌ broken (proved) · ⬜ not built · ❔ can't verify here

| # | Plan item | Status | Proof / note |
| --- | --- | --- | --- |
| **Link intake** | | | |
| 1 | Preflight + approval for YouTube/TikTok/Instagram | ✅ | Real yt-dlp metadata call on a local stream (M02). Live sites untested |
| 2 | Direct media links, private addresses refused | ✅ | D01 download + hash receipt; S01 refused all 10 hostile targets before any request |
| 3 | Facebook / X / Reddit / other sites | ⬜ | C01: all refused "no reviewed adapter" |
| 4 | No cookies, login, DRM bypass | ✅ | `--ignore-config`, no cookie flags, `needs_auth` refused (code read) |
| 5 | Approved link enters the reader automatically | ✅ | M02, when ffmpeg is on PATH |
| 6 | Works on a PC without ffmpeg on PATH | ❌ | M02: cryptic ENOENT + false message (D5) |
| **Reading** | | | |
| 7 | Whole duration of audio processed | ✅ | Recognizer was asked for the full 75.2 s |
| 8 | Word/sentence timestamps | ⬜ | One block per chunk (D3) |
| 9 | Speaker separation | ⬜ | Hard-coded "Speaker unassigned" |
| 10 | Pauses, pace, loudness | ❌ | M01: nothing returned (D1) |
| 11 | Scene map | ❌ | M01: 0 cuts on a video with 4 (D1) |
| 12 | Per-scene visual descriptions / storyboard | ⬜ | Timestamps and scores only (D12) |
| 13 | OCR via the existing DeepSeek-OCR-2 adapter | ⬜ | Never switched on in this flow (D6) |
| 14 | AI-requested extra frames + audio | ✅ | M05: 3 frames + three 4.0 s audio windows |
| 15 | Durable evidence map, AI notes | ✅ | M06, M07 |
| 16 | Timestamped answers, reference-style analysis | ❔ | Depends on the live AI; evidence only has chunk-level times |
| **Creative Library** | | | |
| 17 | AI searches live and proposes | 🟡 | Works, but the AI only sees the first provider (D9) |
| 18 | Photos | ✅ | Three providers (mocked) |
| 19 | Video footage | 🟡 | Pixabay only, needs a key (B04) |
| 20 | Music / SFX | 🟡 | Openverse audio only; duration unit bug; NC/ND not filtered |
| 21 | Fonts, icons, transitions, titles, templates, caption styles | 🟡 | Small local starter kit only (title card, lower third, shapes, gradient, 2 caption styles, 1 LUT) |
| 22 | Download only approved; record licence and source | 🟡 | Works; but NC/ND licences are approvable (B02) |
| **Planning and editing** | | | |
| 23 | Connect to the editor, check compatibility | ✅ | A01 (against the stand-in) |
| 24 | AI reads the project to plan | ❌ | A03, A15 (D2) |
| 25 | Reviewed apply, one Undo step, stale-project block | ✅ | A04b, A06 |
| 26 | Frame capture for inspect → improve | ✅ | A09 |
| 27 | Undo / Redo | ✅ | A04c |
| 28 | Saved versions | ❌ | A08 (D8) |
| 29 | Reconnect after the editor session expires | ❌ | A07 (D7) |
| 30 | Cuts, captions, ducking, B-roll, transitions, titles, effects, 9:16 | 🟡 | Every command type is *allowed*; unusable until #24 is fixed |
| 31 | AI hears/sees motion preview; render Reels/Shorts | ⬜ | No preview-render or render tool exposed (D11) |
| **Platform and rules** | | | |
| 32 | A Kdenlive build you can run on Windows | ❌ | D4 |
| 33 | No separate timeline engine; DaVinci dropped | ✅ | Respected |
| 34 | No paid API | ✅ | None in the code |
| 35 | AI drives it from chat | ❔ | Deploy flow exists; I couldn't test the engine side |

**Tally: ✅ 13 · 🟡 7 · ❌ 7 · ⬜ 6 · ❔ 2.** The split is mine; a different row count moves the percentages, not the
picture. By journey stage, today: *link intake* mostly works → *reading* is hollow → *library* is thin →
*planning* is blocked → *apply/undo* works → *export* is manual in Kdenlive.

---

## 5. Defect list (18)

Severity: **S1** a headline requirement can't work · **S2** works partly or fails in common conditions · **S3** edge or hygiene.
Size is in your 30–45-minute turns.

| ID | Sev | What is wrong | Proof | Fix | Size |
| --- | --- | --- | --- | --- | --- |
| D1 | S1 | **The reader's 3 ffmpeg measurement commands are rejected.** `media/service.ts` lines 172, 177, 192 end in `file=pipe\:1`. ffmpeg 4.2.2 and 7.0.2 refuse it; the code swallows the failure and writes calm sentences ("no stable RMS values", "Pause measurement did not finish"). The loudness command even leaves an empty file named `pipe` in the app's working folder. Result on a 75 s video with 4 hard cuts: 0 cuts, no loudness, no pauses, 1 frame | M01 (DEFECT as shipped, PASS with the fix applied inside the probe); manual runs on both ffmpeg versions | Change `file=pipe\\:1` → `file=-` in the 3 places. Show ffmpeg's error text in the evidence when a pass fails. With the fix: 3 of the 4 cuts, 2,350 loudness windows, 4 pause intervals (20.0 s; the 5th silence runs to the end of the file and isn't counted). the 15 s cut was missed only in my first test file (fast encoder, no keyframes at cuts); a normally encoded copy of the same video gives 19 of 19 cuts | ½ |
| D2 | S1 | **The AI can't write a working edit.** (a) `oddbrain_kdenlive_state` returns identity, revision, profile, Undo and counts only: no tracks, clips or bin items, but edits need `binId`/`clipId`. (b) `oddbrain_edit_plan_propose` takes `plan: {type:'object'}` and the Skill names none of the 31 command types. The connector setup also removes any server named `kdenlive`, so the AI can't read natively | A03, A04a (guessed id → `UNKNOWN_BIN`), A15. Upstream's own error says "desktop_state lists tracks[].tag" | Expose read-only native tools through OddBrain's MCP with the session secret stripped (`desktop_state` sections, `desktop_transcript`, `desktop_silence_detect`, `desktop_effect_list`, `desktop_title_read`, `desktop_marker_export`, `desktop_render_status`). Forward the live `desktop_batch` schema (`commands.items.oneOf`, one schema per command) as the plan's schema. Fold upstream's `docs/skills/kdenlive-mcp-editing/SKILL.md` into the Skill | 1 |
| D3 | S1 | **Transcript is a paragraph, not a timeline.** Windows System.Speech dictation: one text block per ≤10-min chunk, no word/sentence times, no speakers, no punctuation; throws on non-Windows | M01 (one 75.2 s request → one block); `windowsSpeech.ts`. Accuracy not tested (Windows-only) | whisper.cpp (§8, item 2b). Keep System.Speech as fallback | 1–1.5 (+1 for speakers) |
| D4 | S1 | **No Kdenlive you can run on Windows.** The fork has 0 releases, no CI, Linux-only installer, needs Qt ≥ 6.11 with HttpServer (`CMakeLists.txt:146`), MCP is off by default at runtime | Repo inspection at the pinned commit | §7 | decision + spike |
| D5 | S2 | **Downloads fail without ffmpeg on PATH.** yt-dlp's `-f bv*+ba/b --merge-output-format mp4` needs ffmpeg to join separate video and audio. Without it yt-dlp exits 0, leaves two files and prints the path of a merged file that doesn't exist. OddBrain then says "ENOENT … realpath", claims "the completed source remains at <that path>" (false) and deletes the staging folder. OddBrain never hands its own ffmpeg to yt-dlp. No resolution cap either | M02 (real yt-dlp 2026.08.19) | `--ffmpeg-location <folder of the media ffmpeg>`; cap height at 1080; if the printed file doesn't exist, say why; add an "update yt-dlp" action (`yt-dlp.exe -U`) because sites change often | ½ |
| D6 | S2 | **OCR isn't connected to video.** `analyzeVideo` passes no `videoOcr`; the AI's frame request hardcodes `false`. Settings says "Video preflight reuses the reviewed DeepSeek-OCR-2 adapter…": untrue. The adapter itself is not in this repo | grep of every `videoOcr` use; `VideoStudioSettings.tsx:84` | Add the planned "Read on-screen text" tick; pass `videoOcr` for scene-change and AI-requested frames only; fix the Settings sentence. Needs your adapter (§9) | ½ |
| D7 | S2 | **No reconnect.** The editor's session ends after 30 min idle (or when Kdenlive restarts); OddBrain keeps the dead session and every call fails with "HTTP 404" until you press Test connection | A07 | On 404: re-initialise and retry reads once; for edits reconnect, then require a fresh state read (never auto-retry an edit) | ½ |
| D8 | S2 | **"Versions" can't work and has no button.** The code looks for tools named `desktop_project_checkpoint`, `project_checkpoint`, `checkpoint_save`, `save_version`: none exist. Real tools: `desktop_project_save`, `desktop_project_save_as` | A08 | Versions = reviewed `save_as` to `OddBrain Versions/<name>-vN.kdenlive`; add the button | ½ |
| D9 | S2 | **Creative Library bugs and gaps.** (a) The AI's search shows only the first provider: Openverse's 8 results fill the default 8, so Wikimedia and Pixabay never appear. (b) CC BY-NC and BY-ND results can be approved (Openverse has `license_type=commercial,modification`, unused). (c) Openverse audio `duration` is milliseconds (its own model: `duration_in_s = duration/1e3`) but is treated as seconds. (d) No video at all without a Pixabay key. (e) Nothing for music packs, SFX, fonts, icons, transitions, templates | B01, B02, B03, B04, B05 | (a)(b)(c) ½ turn. (d)(e): add providers (§8, item 3) | ½ + 1–2 |
| D10 | S2 | **Links: Facebook, X/Twitter, Reddit, Vimeo, Dailymotion, Twitch… are refused.** The plan promised Facebook/X/Reddit. Only YouTube, TikTok, Instagram and direct `.mp4` pass; `.m3u8` and non-default ports are also refused | C01 | Extend the host list to what yt-dlp supports; keep the refusals for login, DRM, live and playlists | ¼ |
| D11 | S2 | **OddBrain can't render or verify.** It calls only 8 of the editor's 60 tools (state, history, media import, validate, batch, undo, redo, frame capture). `desktop_preview_render` and `desktop_render_cancel` are on its required-tools list but never called; `desktop_render` and `desktop_render_status/verify` aren't mentioned. "Local free rendering, Reels/Shorts first" is a manual click in Kdenlive | `grep` of tool-name calls in `video/service.ts`; `NATIVE_WORKFLOW_TOOLS`; the Skill says so | Reviewed render action with Reels (1080×1920) and Shorts presets, status polling, `render_verify`; AI-callable short preview (≤10 s, with audio) into `OddBrain Previews/` | 1 |
| D12 | S2 | **Scene understanding is timestamps only.** First read returns at most `min(3, ceil(minutes/5))` frames; the scene map is time + score; no per-scene description or storyboard | M03 | Contact sheets with burned-in timestamps (one image per ~12 scenes), per-scene thumbnails, AI descriptions saved through the existing unconfirmed-note tool, frame budget per minute | 1 |
| D13 | S3 | **Review-server protocol slips.** An expired AI session gets HTTP 200 + error instead of the spec's 404 (so clients don't re-initialise); `ping` unsupported; tool failures come back as JSON-RPC errors, not `isError` results | A11, A12, A13 | Return 404; answer `ping`; use `isError` | ¼ |
| D14 | S3 | **A real error can hide behind an unsupported command.** If a plan mixes an overlapping `insert` with any command preflight can't check, the hard stop is skipped. The overlap *is* shown to you, and apply is atomic (nothing changed) | A05 | Keep the hard stop for errors on checkable commands | ¼ |
| D15 | S3 | **Connect needs a local executable.** `testKdenlive` runs `<kdenlive> --version` first, so a remote/WSL editor can't be connected without a local path. On Windows GUI builds `--version` may pop a dialog (unverified) | A14 | Check the endpoint first; make the executable optional | ¼ |
| D16 | S3 | **Failures are swallowed; the code is very dense.** 137 empty catches and 322 that ignore the error; lines up to 1,286 characters (`video/service.ts` has 48 lines over 300); a 2,928-line `main/index.ts` | §3 | Split `video/service.ts` along its seams as it's touched; never `catch {}` around a real program | ongoing |
| D17 | S3 | **The video MCP endpoint has no token.** `/api/video-studio-mcp` checks Host and Origin only; any local process can read evidence and queue proposals (it can't download or edit; you still approve) | `api/server.ts:209` | Optional bearer token, like the editor's | ¼ |
| D18 | S3 | **Doc rot, partly from removing the tests.** README links to `CONTEXT.md` sections that no longer exist; README lines 90 and 115 claim loudness, pauses and a scene index that D1 breaks; three code comments say tests enforce things (`vault/blacklist.ts:13`, `renderer/src/state/appearance.ts:65`, `extension/lib/blacklist.js:14`); app/extension blacklist parity is now unenforced | grep | Fix when D1 lands; I added a pointer to this report in the README now | ¼ |

---

## 6. What already works (don't redo it)

- **The review gate:** one-use tokens that expire in 5 minutes, settings-digest check, project identity and
  revision checked at review *and* at apply, `desktop_batch` as one Undo step, rolled back if any command fails;
  Undo/Redo through reviewed actions (A04–A06).
- **Protocol adapter:** handshake, identity and tool checks, bearer token, session secret kept from the AI (A01, A10).
- **Frame capture** to owner UI and AI as an image (A09).
- **Evidence store and AI evidence tools:** list, read sections, question-driven frames + 4 s audio (1–6
  timestamps per call), unconfirmed notes, durable file (M03–M07).
- **Intake safety:** direct links stream with a hash receipt, private addresses refused first, no shell,
  bounded output and time limits, no cookies (D01, S01).
- **Reader speed (with D1 fixed):** about 2–3 s of analysis per minute of 720p video on a 2-core server
  (75 s → 3.8 s, 300 s → 14.6 s). Speech recognition time is extra.
- **Build, packaging config and security gates.**

---

## 7. The Kdenlive-on-Windows problem

The plan needs a Kdenlive the app can drive while you watch. OddBrain's side is built for the fork
`lucasscariot/kdenlive`. **That fork has no Windows build.**

| Route | What it is | What I verified | Unknown / risk | Fits your rules? |
| --- | --- | --- | --- | --- |
| **A. Build the fork on Windows** | KDE Craft (KDE's own CI builds stock Kdenlive for Windows: `.craft.ini`), maybe on GitHub Actions | Needs Qt ≥ 6.11 + HttpServer; fork has no workflows or Windows docs | Whether Craft offers Qt 6.11 and the MCP code compiles on MSVC; 3–6 h CI builds; one-maintainer, 1-star fork to keep updated | ✅ live, Kdenlive owns everything |
| **B. Run the fork in WSL2** | Linux build inside Windows 11's WSLg; OddBrain (Windows) talks to `localhost:8765` | Fork's docs and installer target Linux | Build needs Qt 6.11 (not in Ubuntu's repos). OddBrain has **no path translation** `C:\…` ↔ `/mnt/c/…`; imports are limited to the project/media folder; `/mnt/c` is slow; preview speed in WSLg untested | ✅ live |
| **C. Headless MCP + stock Kdenlive** | `AMMIROSOH/Kdenlive-mcp` (Apache-2.0, TypeScript, has a PowerShell installer and a Windows acceptance target): keeps its own JSON project, compiles MLT, renders, previews, verifies, exports an editable `.kdenlive` | README of the repo (not run by me); 12 stars, created 2026-06, "public preview" | Young. It owns the canonical project, which you and the earlier session **rejected** as a timeline engine. Live shared Undo is lost; Kdenlive becomes the place you polish copies | ⚠️ **breaks "Kdenlive owns the timeline"**, needs your OK |
| **D. Plan only, for now** | AI produces the timestamped plan, SRT captions, markers; you apply in Kdenlive | Nothing new needed | No automatic editing yet | ⚠️ drops live editing temporarily |

Other Kdenlive MCPs I found (all small and young; none is a live bridge): `SrijanCherupally/kdenlive-mcp`
(MIT, 38 tools, exports `.kdenlive`), `igornfaustino/kdenlive-mcp` (TypeScript, 7 tools, MVP), `Caleb68864/ForgeFrame`
(MIT, Python, 88 tools). I could not find a repo called **Montaz**; nothing in the fork mentions it. The earlier
session's claims about it are unverified and I relied on none of it.

Kdenlive finds its renderer `melt` next to its own executable (`src/core.cpp:420`), and I believe the stock
Windows build ships `melt.exe`, but I couldn't download the installer to confirm (§9, check 4).

**My recommendation:** do T1–T3 first (§8). They help in every route and don't depend on the editor. In parallel, spend about a day on a
spike on your PC: try **B** first, because it is the only route that keeps every rule and has a documented
Linux build to start from. If B is too slow or too fragile, come back and decide between **C** and **D**.
Don't write any new editor-control code until the spike result is in.

---

## 8. What to do: order of work, and how each plan item is built

Each turn is one 30–45-minute block with a stated scope, then a report of done / not done / next, and one full
final turn kept for testing: your own rules.

| Turn | Scope | Done when (probe) |
| --- | --- | --- |
| **T1** | Reader and downloads work on real programs: D1, D5, D10 | M01 PASS as shipped; M02-NO-ffmpeg succeeds or gives a clear message; C01 lists Facebook/X/Reddit |
| **T2** | Connect what already exists and stop saying untrue things: D6 (OCR), D9 (a)(b)(c) (library bugs), D13 (404/`ping`/`isError`), D18 (docs, Settings sentence) | B01–B03 PASS; A11–A13 PASS; with your adapter, OCR text appears for a flagged frame |
| **T3** | Real transcript: whisper.cpp with word and sentence times (D3) | A spoken test clip returns sentences with times; checked on your PC |
| **T4** | Let the AI see the project: D2, D7, D14, D15, D17 | A03, A07, A15 PASS |
| *(spike)* | Kdenlive on Windows (§7), you + me, during T1–T3 | A route chosen from evidence |
| **T5** | Versions, preview, render, verify (D8, D11) | A08 PASS; a real 10 s vertical render verified |
| **T6** | Visual understanding: storyboard, per-scene notes, OCR on requested frames (D12) | M03 shows scenes with images and notes |
| **T7** | Creative Library v2 (new providers, licence policy, local asset cache) and optional speaker separation | B05 shows music, SFX, fonts, icons |
| **Final** | Full real run on Windows, no shortcuts | The journey below passes end to end |

Adding the sizes in §5 gives roughly 10–12 sessions of 30–45 minutes, plus the spike and the final test. Some
turns above (T2, T4, T7) are really 1.5–2 sessions; all numbers are estimates. T1 and T2 fix what is broken;
T3–T7 are where the building is. If you want fewer sessions, the cut I'd make is speaker separation
and half of the new providers, not any of T1–T6.

The journey for the final turn: paste a link → read → ask about it and about the style → evidence-linked plan →
library assets → apply in Kdenlive → inspect → improve → export.

### Plan item → what to reuse → what to change

| Plan item | Reuse (exists, free) | Change in OddBrain |
| --- | --- | --- |
| **1. Safe link intake** | `yt-dlp.exe`, official Windows build, 17 MB, Unlicense, release 2026.08.19 | `video/service.ts` `preflightUrl`/`acquireUrl`: add `--ffmpeg-location`, a 1080p cap (`-f "bv*[height<=1080]+ba/b[height<=1080]"`), a check that the output exists, the wider host list, an update action. Keep refusals for login, DRM, live, playlists |
| **2a. Complete audio** | ffmpeg (done) | nothing |
| **2b. Fine transcript** | **whisper.cpp** (MIT). Release `b5454` (2026-10-06) ships Windows zips: CPU 8 MB, BLAS 20 MB, CUDA 11.8 (271 MB) and CUDA 12.4 (653 MB). `whisper-cli` has JSON with millisecond offsets (`-ojf`), word splitting (`-ml 1 -sow`), SRT/VTT, language auto-detect. Models come from the whisper.cpp model repo | New `main/media/whisper.ts` next to `windowsSpeech.ts`: run `whisper-cli.exe` on the 16 kHz WAV chunks the reader already makes; parse JSON into `{start,end,text,words[]}`; evidence lines become `[00:03.2–00:05.9] sentence`; add `whisper-cli` and model paths in settings, hash-checked like ffmpeg and the OCR adapter. Keep System.Speech as fallback. Verify word-timing flags and a voice-activity option on your PC first (I couldn't run whisper here) |
| **2c. Speaker separation** | **sherpa-onnx** (Apache-2.0): has a real `sherpa-onnx-offline-speaker-diarization` program, Windows builds, and models hosted on GitHub with no token (pyannote segmentation 3.0, 6.6 MB; 3D-Speaker embeddings, 28 MB). Cheap alternative: whisper.cpp `-tdrz`, English only | Run after whisper, assign each word a speaker by time overlap. Phase 2 |
| **2d. Prosody, pauses, pace** | ffmpeg `astats`, `silencedetect` (done once D1 is fixed) | D1; compute pace per sentence from whisper words, not one global average |
| **2e. Scene map with descriptions** | ffmpeg scene detection (works after D1); the AI itself through `oddbrain_video_evidence_note` | Contact-sheet and thumbnails per scene; frame budget per minute; the AI describes, you confirm. A local vision model can come later if your engine model can't see images |
| **2f. OCR** | The existing DeepSeek-OCR-2 adapter protocol (`--oddbrain-capabilities`, `--oddbrain-process <file> --json`) | D6: pass `videoOcr` for scene-change and AI-requested frames only. **Needs the adapter executable, which isn't in this repo** |
| **2g. AI-requested extra frames/audio** | Done (M05) | nothing |
| **3. Creative Library** | Existing: Openverse, Wikimedia Commons, Pixabay. *From my knowledge, verify before building:* Pexels API (free key, photos and video, portrait filter), Freesound (free key, CC0 filter), Internet Archive and NASA libraries (no key, public domain), Iconify (icons), Google Fonts via the `google/fonts` GitHub repo, Kdenlive's own title/LUT downloads | D9 fixes; Openverse `license_type=commercial,modification`; Wikimedia `filetype:audio/video`; interleave providers; each new provider is one function in the existing pattern. Licence policy per provider; local cache and index so nothing is downloaded twice; one-click "approve this set" |
| **4. Chat + AI planning + live Kdenlive** | The native protocol's own schemas and Skill | D2, D7, D8, D11 |
| **5. Kdenlive owns timeline/preview/undo/export** | — | §7 |
| **6. DaVinci dropped; no OddBrain timeline engine** | — | Respected today; keep it |

### Protect against this class of bug

Every defect above that touched a real program (D1, D5, D9c) was found by running it once. When tests are
rebuilt, **start with `audit/probes`** (real-program contract checks), not stand-ins. The same risk sits at
the other real-program edges I couldn't run: launching Claude Code / agy and deploying MCP config to them,
the OCR adapter, Windows speech, the installer. Run each once on your PC and treat any surprise as a defect.

---

## 9. What I need from you

**Decisions**

1. **Kdenlive route.** OK to spike **B (fork in WSL2)** first? And may I consider **C** (headless
   `AMMIROSOH/Kdenlive-mcp`) as a fallback even though it bends "Kdenlive owns the timeline"? Or would you
   rather stay on **D** (plan only) until a live route exists?
2. **Languages.** Which languages are your videos in: English only, or Bangla too? That picks the whisper model.
   (Windows System.Speech has no Bangla; Whisper's large models do, with lower accuracy than English.)
3. **GPU.** NVIDIA? Which card? That picks the CPU or CUDA build.
4. **OCR adapter.** Where is the DeepSeek-OCR-2 adapter executable? Run `adapter.exe --oddbrain-capabilities`
   and send me the output. If it doesn't exist yet, it is a separate piece of work.
5. **Free API keys.** For Library v2 you would paste free keys (Pexels, Freesound, optionally Pixabay and
   Openverse). OK?

**15-minute check on your PC** (PowerShell; turns my "can't verify" into facts)

1. `where.exe ffmpeg; where.exe yt-dlp; yt-dlp --version`: is ffmpeg on PATH? (explains D5)
2. `ffmpeg -hide_banner -loglevel error -f lavfi -i "sine=frequency=440:duration=3,apad=whole_dur=6" -af "silencedetect=noise=-35dB:d=0.3,ametadata=mode=print:file=-" -f null -`
   Expected: a line `lavfi.silence_start=2.99…`. If it errors, tell me `ffmpeg -version`.
3. `wsl -l -v` and `nvidia-smi`.
4. If Kdenlive is installed: `dir "C:\Program Files\Kdenlive\bin\melt.exe"`, and run
   `& "C:\Program Files\Kdenlive\bin\kdenlive.exe" --version`: does a dialog pop up?
5. Tell me the engine model you use in chat: does it accept images?

---

## 10. Evidence index

| Claim | Where to look |
| --- | --- |
| D1 | `audit/probes/probe-media.cjs` (M01); `src/main/media/service.ts:172,177,192` |
| D2 | `probe-video.cjs` A03, A04a, A15; `src/main/video/service.ts` `aiToolDefinitions`, `projectSnapshot` in `nativeProtocol.ts` |
| D3 | `src/main/media/windowsSpeech.ts`; `service.ts:161-167` |
| D5 | `probe-media.cjs` M02-NO-ffmpeg; `src/main/video/service.ts:543` |
| D6 | `src/main/index.ts:560`, `video/service.ts:493`, `VideoStudioSettings.tsx:84` |
| D7–D8 | `probe-video.cjs` A07, A08; `video/service.ts:739` |
| D9 | `probe-video.cjs` B01–B05; Openverse source: `api/api/models/audio.py` (`duration_in_s`), `api/api/constants/licenses.py` |
| D10 | `probe-video.cjs` C01 |
| D13 | `probe-video.cjs` A11–A13; `src/main/api/server.ts:244` |
| Fork has no Windows build | `lucasscariot/kdenlive@b9a1a6c`: `README.md`, `CMakeLists.txt:52,146`, `packaging/live-mcp/install-user.sh` |

Reproduce everything: [`audit/README.md`](README.md).
