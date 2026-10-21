# OddBrain audit — judged without the repo's tests

Date: 2026-10-21 · Commit audited: `ba66c9d` ("Connect reviewed Kdenlive video workflow")

## What I did, exactly

1. Copied the repo to `/home/user/OddBrain-audit-nontest` (via `git archive`, so it is exactly this commit).
2. Removed **all** tests from that copy: 266 files (245 in `apps/03_oddbrain/tests/` + 20 `check-*.cjs` test scripts + `ci-browser.cjs`). 959 files → 693 files. **The real repo's tests are untouched** — nothing is lost until you approve deleting them for real.
3. Judged the copy my own way. I did **not** run or rely on the repo's tests. My checks were:
   - TypeScript typecheck, Electron build, web build, full `npm run build` — all from a clean install in the copy.
   - My own scanners for wiring mistakes (IPC channels vs handlers, HTTP routes vs guards, orphan files, secrets).
   - Reading the whole video chain in code, end to end.
   - Checking OddBrain's Kdenlive protocol code against the **real** upstream code of `lucasscariot/kdenlive` at the pinned commit `b9a1a6ce…` (fetched from GitHub: `mcpserver.cpp`, `mcptools.cpp`, `docs/native-mcp.md`, upstream `SKILL.md`).
   - Running OddBrain's exact FFmpeg commands with a real FFmpeg 7.0.2 binary against a synthetic 12-second, 3-scene video with tone + 3s silence that I generated.
   - Compiling OddBrain's actual video service and driving it against a mock server built from the upstream protocol shapes (connect → state → AI proposes plan → validate → apply → stale-plan refusal → frame capture → session death → 21-second slow import).
   - Driving the link → download → evidence chain in the compiled service with a fake CDN fetch.
4. Only after judging the product code did I look at the test files — solely to classify why they give false confidence (section "The tests").

Limits of this audit: no Windows machine here, no Kdenlive, no Claude Code/agy sign-in, no Electron GUI run. Anything I could not prove is labelled "unproven," not "broken."

---

## Bottom line

**The repo is NOT garbage, and the last agent's final turn did real work.** Several things the old agent admitted were missing in the middle of your conversation actually exist at this commit (link → automatic evidence, AI tools for evidence/library, real plan apply). The rot is concentrated and fixable.

| Area | My score | Meaning |
|---|---|---|
| Whole app **excluding** Video Studio | **~80–85% structurally done** | Compiles clean, contracts wired, security serious. What remains is mostly real-machine acceptance (Windows, signed-in engines), which nobody has done. |
| Video Studio **code** vs the plan in your file | **~35–40% of what was promised** | Real plumbing, thin capability. Details in the table below. |
| Video Studio **usable by you today** | **~5%** | The one Kdenlive build it can talk to has no Windows release and only Linux build instructions. Until that exists on your PC, the live-editing half cannot run at all. |
| Test suite as evidence | **Not trustworthy** | It mocks the very things it claims to prove (see "The tests"). Green CI is real but it certifies logic, not reality. |

---

## What is NOT broken (checked, not assumed)

- **Builds:** `tsc --noEmit` clean; Electron build clean; web build clean; full `npm run build` clean (in the test-free copy, Node 22 sandbox vs the repo's Node 24 pin — version warning only).
- **IPC wiring:** 262 main-process handlers; every preload `invoke` has a handler; no duplicates. (One tombstone: `skills:deploy` exists only to refuse.)
- **HTTP wiring:** renderer vault/ollama routes all exist behind the guard; extension `conversation-sync` goes through the separate paired extension server as designed.
- **Electron security:** sandbox + contextIsolation on, nodeIntegration off, IPC origin pinning, navigation lockdown, CSP, permission handlers, fuses script, ASAR. This part is genuinely careful.
- **No dead weight:** 369 TS/TSX source files, effectively zero orphan files. No committed secrets found. Extension manifest references zero missing files; all extension JS passes syntax check.
- **Kdenlive protocol adapter is accurate.** I diffed it against the real upstream: server name/version (`kdenlive-native` 1.0.0), protocol `2025-06-18`, default port 8765, the `{ok:true,data:…}` envelope, state snapshot fields, edit-field requirements, and OddBrain's batch-command allowlist (= exactly upstream's batchable set) all match. My drive test passed: connect → compatibility → state (session secret correctly withheld) → AI proposes plan → validate → apply (revision 7→8) → stale plan refused → frame capture.
- **Link chain works at service level:** preflight → approved download → hash receipt → **automatic** evidence processing (no manual re-attach) → question-driven expansion → evidence survives restart. Proven in my probe with a stubbed analyzer.
- **FFmpeg frame extraction and audio-window extraction commands work** with real FFmpeg. The scene-metadata *parser* also works on real FFmpeg output. (The commands that *produce* that output are broken — next section.)
- **Docs at this commit are unusually honest** (README even says mocked tests prove the contract only and PR #12 must not be treated as complete). Where docs still overclaim, I list it below.

Biggest maintainability smells (not bugs): `src/main/index.ts` is 2,928 lines, `SettingsView.tsx` 1,303, renderer main chunk 2.7 MB. Workable, but every future agent will struggle in those files.

---

## Confirmed broken (proven by running real things, not by reading)

### B1–B3. All three FFmpeg "measurement" passes produce nothing — silently

In `apps/03_oddbrain/src/main/media/service.ts` (`decodeLocalPath`), the scene scan, RMS loudness, and silence/pause passes all send FFmpeg metadata to `file=pipe\:1` (stdout) while the filtered output also goes to stdout (`-f null -`). With real FFmpeg 7.0.2:

- **Scene scan** (`metadata=print` without a `key=`): FFmpeg refuses to start — `Metadata key must be set`, exit 234. The code catches this and silently uses `scenes = []`.
- **Silence/pause pass** (`ametadata=mode=print` without `key=`): same failure, exit 234 → always reports "Pause measurement did not finish."
- **RMS loudness** (has `key=`, starts fine): metadata written to `pipe:1` never arrives in the captured stdout — **0 values**. The identical command writing metadata to a real temp file returns **517 values** on my 12s probe video.

Consequences that reach the user today:

- `sceneMap` is **always empty** → evidence always shows "0 scene changes," and the "adaptive" frames are just evenly spaced overview frames.
- Tone analysis is words-per-minute only; loudness and pause evidence never exist.
- The disclosure text still claims *"A local scene-change pass planned N adaptive visual evidence frame(s)"* and the README claims the evidence map preserves "measured loudness/dynamics … pause evidence, the bounded scene-change index." Today those sentences are false.

Fix is small: add `key=…` where missing and write metadata to files inside the temp folder the code already creates (I verified the file variant works and produces exactly the `pts_time` / `lavfi.scene_score` format the parser expects).

### B4. A Short gets exactly ONE frame

`wanted = Math.min(3, Math.max(1, Math.ceil(duration / 300)))` → any video ≤5 min gets 1 initial frame, ≤10 min gets 2, only longer gets 3. The plan said "Shorts first" — for a 30-second Reel the reader sees one picture. `adaptiveFramePoints` already supports up to 12; the caller never asks.

### B5. The MCP client strangles its own import (and any preview)

Every Kdenlive MCP call times out at **20 s** (`mcpRequest`), but media import asks the server to `wait: 30`. Proven: with an upstream-faithful mock that waits 21 s, OddBrain aborts at 20.0 s and reports "not imported" while the server completes the import — an uncertain-outcome bug in the exact place the rules say never to create one. The same 20 s cap makes `desktop_preview_render` and renders impossible even if they were wired (they are not — see missing list). Also: all MCP replies are capped at 2 MB, which a real project's `desktop_state` may exceed (risk, unproven).

### B6. Dead MCP session never reconnects

Upstream sessions expire after 30 min idle and on editor restart. OddBrain caches the connection (`lastConnection`) and never clears it on a session error, so every later call fails with a bare "HTTP 404" until the owner happens to press **Test** in settings. The error message never says that.

### B7. OCR: the adapter does not exist, and two of three paths never call it

- The repo contains **no** DeepSeek-OCR-2 adapter program — only a client protocol (`--oddbrain-capabilities` must answer model `DeepSeek-OCR-2`). Unless you built such a program outside this repo, OCR cannot run at all.
- Question-driven expansion always calls `expandVideoEvidence(…, false, …)` — OCR is hardcoded off there.
- The URL-acquire flow calls `analyzeVideo` with no OCR option — link videos never get OCR.
- OCR is reachable only via the chat-attachment checkbox, with an adapter that isn't in the repo.

### B8. Transcription is Windows-only, weak, and hard-wired

Local transcription = Windows `System.Speech` via PowerShell. On any other OS, a video **with audio fails decoding entirely** (the recognizer error is rethrown) — even the visual evidence is lost. On Windows: 10-minute chunks, no word timing, no speakers (honestly disclosed). `analyzeVideo` hardcodes `route: 'local'`, so even the existing provider-transcription route can't be used for evidence. whisper.cpp is integrated nowhere.

### B9. "Save version" is dead at both ends

The backend looks for `desktop_project_checkpoint` / `project_checkpoint` / `checkpoint_save` / `save_version` — **none exist upstream** (upstream has `desktop_project_save` / `desktop_project_save_as`, which OddBrain never calls). And the UI has no save-version button at all. "Versions" = a read-only history list; no restore, no compare.

### B10. Stop button is disabled exactly when you need it

In `VideoStudioView`, Stop is `disabled={!busy}`, where `busy` only tracks that view's own button calls. Work started by the AI through MCP never sets it, so Stop is greyed out during AI-driven operations.

### B11. AI access is Claude-Code-only in practice (the "free" path doesn't work)

- The Ollama/cloud chat path has **zero tool-calling code** — a local free model cannot call any `oddbrain_video_*` / library / plan tools, ever.
- agy is, by the README's own admission, "text-only, without interactive approval cards" and pictures are refused — so MCP image frames to agy are unproven at best.
- Registering the video tools into AI chat also refuses unless a live Kdenlive MCP already answered (`reviewEngineConnector` throws when not `mcpConnected`) — you can't even register evidence Q&A tools before Kdenlive works.

So today the whole AI loop requires a signed-in Claude Code. Nothing in the UI says this plainly.

### Smaller confirmed issues

- **Creative video search without a Pixabay key always returns nothing** (Openverse returns [] for video, Wikimedia is image-only) — yet the UI defaults the type selector to Video. Audio = Openverse only. Pixabay-throws-when-no-key is also reported as a scary "problem."
- **AI proposals expire under you:** library tokens live 15 min; the AI's proposal and the proposed edit plan are single in-memory slots, lost on restart and overwritten by any new search/proposal.
- **Video Studio has no "add local file" button** — local footage only enters by attaching it in Chat (which always pauses for the storage/range/OCR choice). No evidence delete/reprocess UI; blocked records accumulate toward the hard 256-record cap, after which new evidence is refused.
- **Only YouTube/TikTok/Instagram + direct-file links are accepted** (`classifyVideoUrl` whitelist; also rejects any URL with a port). yt-dlp supports thousands of sites, but Vimeo/X/etc. are refused by OddBrain itself — the conversation explicitly wanted "other sites too."
- OddBrain's own AI-tools MCP endpoint (`/api/video-studio-mcp`) has **no token**: any non-browser local process can read transcripts/evidence and trigger frame extraction while the app runs. It can't apply edits or download assets (owner review still gates those), and it's the same trust pattern as the vault API — but it should be a conscious decision, ideally a per-run token written into the engine connector config.
- The design-kit "recipes" are prose inside a JSON file, not executable templates; the kit itself is 2 SVGs + shapes + gradient + 2 caption styles + 1 LUT.

### The tests (why green CI lied)

I inspected tests only to answer "are they broken?" — **yes, in a specific way: they mock the reality they claim to prove.**

- `media-selected-file.test.ts` fakes `runCommand`: when args contain `astats=` it returns a canned `lavfi.astats.Overall.RMS_level=…` string. The parser is tested; FFmpeg never runs. That is exactly why B1–B3 survived a green suite.
- `video-studio.test.ts` feeds `parseSceneMetadata` a hand-written metadata string. Correct string, wrong conclusion ("scene detection works").
- Video MCP tests run against an in-test mock server — like my probe, they prove the contract, not Kdenlive.
- Nothing in the suite spawns real FFmpeg/yt-dlp/Kdenlive (CI even installs with `--ignore-scripts`; browser checks use fixtures).
- Current CI for `ba66c9d` *is* green (Linux + Windows + CodeQL — I checked via the GitHub API). So the tests aren't "failing"; they're **passing while certifying false things**. Deleting them and regrowing a smaller, real-binary suite is the right call — with one warning: CI workflows are built around them (`check-ci-tests.cjs`, junit gates, `test:ui`, media-runtime and security scripts), so deletion must land together with a CI rewrite or every PR goes red.

---

## The conversation plan vs reality (item by item)

| # | What you approved in the conversation | Reality at `ba66c9d` | Score |
|---|---|---|---|
| 1 | Safe video-link intake: paste → inspect → approve → automatically readable | Works at service level (proven). Only YT/TikTok/Instagram/direct; other yt-dlp sites blocked by OddBrain; needs owner-installed yt-dlp; no resume; direct-link HEAD refuses redirects | **~75%** |
| 2 | Gemini-style adaptive understanding (full audio, fine transcript, speakers, scenes, OCR, tone, ask-for-more-frames, durable map) | Pipeline + durable map + ask-for-more (1–6 frames + 4s audio) are real. But scene/RMS/pause passes dead (B1–B3), 1 frame for Shorts (B4), transcript = Windows 10-min chunks, no speakers/pitch/word timing, no automatic scene descriptions, OCR adapter missing + off in 2 of 3 paths (B7, B8) | **~35%** |
| 3 | Online Creative Library the AI searches/uses itself; download only approved | AI search tool real (Claude-Code-only), license blocking + receipts real. Only 3 providers; video needs Pixabay key; audio = Openverse only; no music/SFX split, no fonts/stickers/templates, no pagination/filters/saved items; kits = static files + prose recipes | **~40%** |
| 4 | OddBrain chat + library panel inside Kdenlive | No panel exists. Chat lives in OddBrain; Video Studio buttons stuff a draft prompt into chat ("attach the source video if needed"). Connector + Skill registration UI exists. A real in-Kdenlive panel means forking Kdenlive's Qt UI (GPL) — deferred in FUTURE_PLAN | **~10%** |
| 5 | Live editing through MCP (cuts, captions, music, B-roll, transitions, effects…) | Core is correct and proven vs the real protocol shapes: state → propose → validate → one-batch apply → Undo/Redo → frame capture. But OddBrain calls only **8 of ~57** upstream tools — no project create, vertical profile change, save, media-wait, effect list, transcribe, silence-detect (all already built upstream). Captions specifically have no subtitle tool upstream; today they'd be titles/transcript imports the AI must improvise. Plus B5/B6 | **~55% code, 0% runnable for you today** |
| 6 | Preview → inspect → improve; undo; saved versions | Still-frame inspection yes; Undo/Redo yes; history list read-only. `desktop_preview_render` is required for "compatibility" but **never called**; motion/audio inspection = you, manually, in Kdenlive's monitor. Save version dead (B9). No restore/compare | **~40%** |
| 7 | Free local rendering; Shorts first, then long | OddBrain has no render control at all (upstream has render/status/verify/cancel — unused). No Shorts workflow code; vertical = a design-kit format selector. Reframing exists only if the AI authors a `reframe` command | **~15%** |
| — | Settings → Connections → Kdenlive; normal chat unchanged | Done as "Kdenlive & video" settings section + separate Video Studio view | **~90%** |

Also from the conversation: "**if something exists already, use it**" was only half-followed. Good: pinned the real native MCP fork instead of inventing an editor; yt-dlp/FFmpeg reused. Bad: OddBrain re-wrote a thinner editing Skill instead of installing upstream's detailed `SKILL.md`; it ignores upstream's built-in word-level transcription (`desktop_transcribe`/`desktop_transcript`) and silence detection while shipping a weaker home-grown pipeline; and the "Montaz fork" the old agent cited does not exist as a public project I could find — treat that reference as hallucinated.

### The one blocker that matters most

`lucasscariot/kdenlive` is real and its MCP is well-built, but: **no releases at all**, build docs are Linux cmake + a shell installer, 1 star, issues disabled, last pushed 2026-10-18, needs Qt ≥6.11 HttpServer/WebSockets. Stock Kdenlive does **not** include this MCP. So on your Windows 11 PC there is currently *nothing to install* that OddBrain's Video Studio can talk to. FUTURE_PLAN calls this "build and audit … on Windows 11" — that understates it: it is an unbuilt dependency, likely a KDE Craft toolchain expedition (the fork inherits KDE's `.craft.ini`, so a Craft build is conceivable but unproven, including whether Craft's Qt provides the two extra modules).

---

## What to do — implementation plan (reuse-first, free, in order)

Rule for every phase: finish = demonstrated with the **real binary/server**, never with a mock of the thing being proven.

### Phase 0 — Fix what's already built (small, 1 turn)

1. Fix the three metadata passes: add the missing `key=`, write metadata to temp **files** (temp dir already exists in code). Stop swallowing failures silently — disclosure must state what actually ran.
2. Frame count: ask `adaptiveFramePoints` for a sane budget (e.g. 3 minimum, up to its existing 12 cap scaled by duration).
3. Per-tool MCP timeouts (import/batch ≥120 s) + auto-reconnect once on "session not found"; raise/rethink the 2 MB reply cap for `desktop_state`.
4. Pass the OCR choice through expansion and the URL flow (checkbox on preflight, reusing the existing adapter setting).
5. Save-version: wire it to the real `desktop_project_save`/`desktop_project_save_as` with the same approval card, and add the missing UI button — or remove the action. Don't leave a dead name.
6. Stop button: enable when service reports an active transfer/job (main-process truth), not renderer `busy`.
7. Keep my real-FFmpeg probe as a script (`scripts/check-media-real.cjs`-style): generates the synthetic video, runs the *shipped* commands, asserts scenes/RMS/silences are found. This becomes the seed of the new test style.

### Phase 1 — Real transcription (reuse, don't rebuild)

Use what exists, in this order: (a) when Kdenlive is connected, `desktop_transcription_readiness` → `desktop_transcribe` → `desktop_transcript` gives **word-level** timing already; store those words in the evidence map. (b) For the standalone reader, add a whisper.cpp owner-installed adapter using the *same pattern* as the OCR adapter (capability JSON + hash review) — or accept OpenAI/Groq transcription route that already exists in `provider.ts` and let `analyzeVideo` use the owner's chosen route instead of hardcoding `local`. Keep System.Speech only as a labelled fallback. This unlocks real caption timing and silence cutting (`desktop_silence_detect` + `range_cut` already upstream).

### Phase 2 — Make the Kdenlive side exist on Windows (decision needed, timebox it)

- **Option A (recommended first shot):** try building the fork with KDE Craft in GitHub Actions (`windows-latest`): add Qt HttpServer/WebSockets to the Craft blueprint if missing, build with `KDENLIVE_MCP_API=ON`, run upstream's own `tests/mcp` protocol tests + `acceptance.mjs` in CI, ship the unsigned build as a CI artifact for your machine. Timebox: if Craft fights back for more than a couple of sessions, stop.
- **Option B (pragmatic fallback):** headless file-based MCP (e.g. AMMIROSOH-style) to *author* a `.kdenlive` project while Kdenlive is closed, then open it in stock Kdenlive. Loses live-timeline safety, gains "works on Windows today with stock Kdenlive."
- **Option C:** run the fork on Linux/WSL only. (WSL + GUI editor is miserable; not recommended.)

Do not let any other phase wait on this — Phases 0, 1b, 4, 5 all help even with stock Kdenlive.

### Phase 3 — Use the other 49 upstream tools (mostly wiring, medium)

In value order: `desktop_project_new` + `desktop_profile_list` + `desktop_project_profile` (real vertical projects), `desktop_project_save(_as)`, `desktop_media_wait`, `desktop_effect_list` (AI must see real effect IDs before authoring effects), `desktop_preview_render` → feed the preview file back through OddBrain's own evidence reader (that closes preview→inspect→improve for motion **and** audio with no new engine), `desktop_render`/`render_status`/`render_verify`/`render_cancel` behind approval cards. Install upstream's actual `SKILL.md` (from the owner's installed fork) instead of the home-grown thinner rewrite, keeping OddBrain's review rules as an addendum.

### Phase 4 — Let free models drive (the "no money" unlock)

Add a tool-calling loop to the Ollama chat path (Ollama's `/api/chat` supports tools) exposing the same review-only `oddbrain_*` tools, with the same approval gates. Then a local vision model can also batch-describe scene frames into the evidence map as unconfirmed notes. Without this phase, "free local AI editor" remains Claude-subscription-only.

### Phase 5 — Library breadth (reuse existing free APIs)

Add Pexels (free key; real video+photo), Freesound (free key; music/SFX with CC terms), Wikimedia Commons audio/video (code currently returns [] for non-images), Openverse pagination + licence/orientation/duration filters. Persist AI proposals and edit plans to disk (survive restart; multiple allowed). Add a deterministic "place approved asset at timestamp T on track V2/A2" helper that *generates* the insert command in code instead of hoping the AI hand-writes it. Honest ceiling remains: no trending copyrighted music, no CapCut/Canva catalogues — that was true in the conversation too.

### Phase 6 — OCR adapter (only if your GPU reality allows)

Ship a small adapter in this repo (e.g. `tools/ocr-adapter/`, Python) that implements the existing OddBrain protocol on top of DeepSeek-OCR-2, with install instructions and a `--oddbrain-capabilities` self-report. If the model is too heavy for your machine, the honest alternative is a protocol-v2 that also accepts a Tesseract adapter under its true name — decision needs your hardware facts.

### Phase 7 — Tests: delete, then regrow differently

One commit: delete `apps/03_oddbrain/tests/`, `vitest.config.ts` test wiring, and the `check-ui*`/`check-ci-tests`/`ci-browser` scripts; in the same commit rewrite `checks.yml` to keep typecheck, security policy, builds, CodeQL, and the Electron smoke — so CI stays meaningful and green. Then regrow tests under one rule: **never mock the unit under proof** — real FFmpeg on generated fixtures (Phase 0 script), upstream-faithful MCP fixtures generated from the pinned schemas, pure-function tests only for pure functions. No test counts as a goal ever again; acceptance evidence does (a real video in → correct scenes/transcript out; a real project edited → verified render).

### Explicitly not doing

- No panel inside Kdenlive until/unless Phase 2A succeeds and a small GPL Qt dock becomes worth maintaining. OddBrain window beside Kdenlive is v1.
- No second timeline/renderer in OddBrain. Kdenlive (or MLT via it) stays the only editor.
- No paid APIs, no Vyra, no DaVinci, no copying proprietary libraries (per your conversation).

---

## Decisions I need from you before Phase 2/4/6

1. **Kdenlive on Windows:** try the Craft build in CI first (Option A), or go straight to the works-today file-based fallback (Option B)?
2. **Which brain must drive video:** Claude Code sign-in is acceptable for now, or is free-local (Ollama tool-calling, Phase 4) a requirement before video work continues?
3. **Tests:** delete them from the real branch now (one commit + CI rewrite, Phase 7 pulled forward), or after Phase 0 fixes land?
4. **Your GPU / VRAM** (for DeepSeek-OCR-2 and local vision feasibility in Phases 4/6).

My recommended next turn, no decision needed: **Phase 0** — it's small, entirely inside OddBrain, and turns three fake measurements into real ones, with the real-FFmpeg probe left behind as proof.
