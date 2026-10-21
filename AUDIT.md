# OddBrain audit — 2026-10-21

**Branch:** `arena/649ffaaf-oddbrain`
**Base inspected:** `ba66c9d` (“Connect reviewed Kdenlive video workflow”)
**Audit commit:** `7c93c0f` (“Remove obsolete automated test suite”)
**Method:** no repository test was used. Judgement is from TypeScript/build checks, a headless DOM render (jsdom) of the offline preview, static tracing of the code paths, and the pinned upstream Kdenlive MCP documentation. Electron, Windows, Kdenlive, FFmpeg and yt-dlp could not be run in this sandbox, so their behaviour is unproven here.

---

## 1. Plain answer

The repo is **not rotten at the build level**. Typecheck passes, the Electron bundle builds, the web bundle builds, the security-policy check passes, and the browser preview renders every main view with no JavaScript errors.

The **video plan is not complete**, and the important failures are integration failures, not cosmetic ones:

- The AI cannot see the Kdenlive timeline. OddBrain throws away the timeline, tracks, clips, bin IDs, frame rate and duration returned by the native server. It keeps only counts, width/height, revision and Undo state.
- Because of that, the AI cannot calculate frame positions, cannot address existing clips, cannot name a downloaded asset, and cannot write a genuinely exact edit plan. The “exact plan” step is currently guesswork followed by server rejection.
- Live editing needs a **separate third-party Kdenlive fork**. That fork publishes no release in its GitHub repository, so a Windows owner must build a large Qt/Kdenlive application first. OddBrain has no installer/detection flow for it. This alone makes the advertised live workflow unusable on the owner’s machine today.
- The Creative Library is real but small: three providers, no video results without a Pixabay key, no working audio preview, and no path from a downloaded asset to an AI-placed timeline clip.
- “Preview → inspect → improve” is frame-capture only. There is no short preview render, no audio/motion inspection, no render verification, and no version save/restore.

**My estimate:** roughly **30 % of the full video plan is end-to-end in code**, and **nothing in this audit was proven on a real Windows/Kdenlive machine**. The remaining foundation is usable, but it is a foundation, not the finished system.

Outside video, the app is in better shape than the chat history suggested: it compiles, the UI boots, and the feature surfaces exist. Runtime acceptance of the rest of the app is still unproven because the sandbox cannot run Electron or Windows.

---

## 2. What I changed

### Tests removed

- Deleted `apps/03_oddbrain/tests/` (245 files: 235 `*.test.*` files plus shims and fixtures, about 2 MB), `vitest.config.ts`, 12 `check-ui-*.cjs` scripts, `settings-navigation.cjs`, `check-ci-tests.cjs`, `ci-browser.cjs`, `check-electron-automation.cjs`, `check-media-runtime.cjs`, and `extension/scripts/check-browser.cjs`.
- Removed `vitest`, `jsdom`, `fake-indexeddb` and `playwright-core` from `devDependencies`; regenerated the lockfile.
- Removed the Vitest, Playwright, JUnit, browser-coverage and Electron-automation steps from `.github/workflows/checks.yml`. CI now runs typecheck, security policy, desktop/web builds, release inspection and native smoke. The extension browser step was removed with its harness.
- Updated `README.md`, `RULES_FEATURES_AND_REASONS.md` and `FUTURE_PLAN.md` to say the suite was removed on 2026-10-21 and must be rebuilt. No old test total is presented as evidence.
- Committed as `7c93c0f`. The old tests remain in Git history at `ba66c9d` (their last state before removal) if any of them are worth mining later.

The test-removal commit changed **271 files: +8 / −30,958**. The build still passes after removal.

---

## 3. Health check (what actually ran)

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **Pass**, 0 errors |
| `npm run build` (Electron main/preload/renderer) | **Pass**, 1,884 modules, ~4.7–5.1 s, preview 686,869 bytes |
| `npm run build:web` | **Pass**, 4.55 s; main bundle 1,908.54 kB / 345.13 kB gzip |
| `npm run security:policy` | **Pass** |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| Browser preview under jsdom (demo bridge) | **All 7 surfaces render, 0 console errors** |
| Native Electron smoke | **Not run** — Electron binary download is blocked in this sandbox; no Xvfb |
| Real Windows / Kdenlive / MCP / FFmpeg / yt-dlp / OCR | **Not run** — requires the owner’s machine |
| Repository tests | **None** — intentionally removed |

Browser-preview evidence (jsdom 24, `dist-web/oddbrain-preview.html`, demo bridge, 2 s settle per route):

| View | Rendered text length | Errors |
|---|---:|---|
| Chat | 7,742 chars | 0 |
| Video Studio | 4,401 chars | 0 |
| Artifacts | 6,942 chars | 0 |
| Projects | 9,032 chars | 0 |
| Vault | 6,830 chars | 0 |
| Brain | 10,000 chars | 0 |
| Settings | 17,783 chars | 0 |

This proves the renderer is not blank or crashing. It does **not** prove the Electron IPC, filesystem, engine, media or Kdenlive paths.

### Code shape

- 369 TypeScript/TSX files, **50,207 lines**. The entire video feature is about **1,970 lines (4 %)** across `src/main/video`, `src/main/media`, `src/shared/lib/video*` and two renderer components — this is a contained module, not a rewrite of the app.
- 17 files over 500 lines; `src/main/index.ts` is 2,928 lines; `src/main/video/service.ts` is 806.
- 360 lines longer than 400 characters (mostly single-line JSX); `VideoStudioView.tsx` is 64 lines with several 10k-character JSX lines.
- 50 explicit `any` uses, 19 empty `catch` blocks (mostly cleanup), 252 fire-and-forget `void` calls in the renderer, 262 main-process handlers and 220 preload invokes.
- This is a maintainability risk, not by itself a functional failure.

---

## 4. Requirement matrix against the plan in the document

Status meanings: **E2E** = the owner-facing chain exists in code; **Real** = proven on the owner’s machine.

| # | Requirement from the discussion | Code exists | E2E | Proven here | Honest state |
|---|---|---:|---:|---:|---|
| 1 | Safe link intake: preflight → approve → download → receipt → evidence | 70 % | 60 % | no | Works for YouTube/TikTok/Instagram and direct `.mp4/.webm/.mov/.mkv/.m4v` URLs. Other public sites are refused even when yt-dlp supports them. |
| 2 | Gemini-style adaptive reading: complete audio, transcript, speakers, scenes, OCR, tone, selected frames | 55 % | 40 % | no | Audio is complete; transcript chunks are 10 minutes; no diarization; “tone” is RMS/pace/pauses only; initial visual evidence is 1–3 frames. AI can request 1–6 more. |
| 3 | Online Creative Library: stock, music, templates, captions, effects, AI-operated | 35 % | 20 % | no | Openverse images/audio, Wikimedia images, optional Pixabay images/video; a locally generated design kit covers title/caption artworks, shapes, a gradient, a LUT and recipes. No fonts, icons or SFX. No video without a Pixabay key. No audio preview. AI can search but not see thumbnails. |
| 4 | Kdenlive connection, native protocol, reviewed Skill | 75 % | 45 % | no | Protocol adapter, identity pin, tool/schema checks, connector review, Skill installer. Requires the unpublishable third-party fork; no install flow. |
| 5 | Live editing: cuts, captions, B-roll, music, transitions, effects, reframing | 45 % | 10 % | no | Batch/plan/approval/revision code exists, but the AI has no timeline state or asset/bin IDs. It cannot form real commands. |
| 6 | Preview → inspect → improve, Undo, saved versions | 30 % | 10 % | no | Frame capture + Undo/Redo/history work in code. No preview render, no audio/motion inspection, no render verification, no version list/restore. |
| 7 | Free local rendering for short and long video, Reels/Shorts first | 10 % | 0 % | no | Delegated to Kdenlive. No short-form workflow, hook selection, reframing pipeline, caption timing or export verification. |
| 8 | OddBrain panel inside Kdenlive | 0 % | 0 % | no | Deliberately deferred to a future native dock. Today it is a separate app window; the record correctly says stock Kdenlive has no general panel API. |
| 9 | No paid dependency, local-first | 60 % | 30 % | no | No paid provider is required. But the only live-edit path requires building a GPL fork, which is a large hidden cost. |

If the owner accepts a **draft-project export** fallback (see §7), requirements 5–7 can become useful without the fork. If the owner insists on live timeline editing, the fork is the critical path and the project is blocked on a Windows build that does not exist publicly.

---

## 5. Defects found, by severity

### Blockers (the workflow cannot honestly work)

**B1. The AI is blind to the timeline.**
`src/main/video/nativeProtocol.ts:132` parses `desktop_state` into `KdenliveProjectSnapshot`, which contains only `documentUrl`, `sequenceId`, `sessionId`, `revision`, `modified`, `profile { width, height, description }`, `undo` and `counts`. The native server returns, and documents:
`fps`, `playhead`, `activeTrackId`, `tracks[]` (id/tag/type/locked/muted), `tracks[].clips[]` (clipId, binId, position, duration, sourceIn/Out, speed, group, linked partner), `bin[]` (binId, path, duration, ready), `markers[]`, `compositions[]`, `sequences[]`, subtitles, effects and history (`docs/native-mcp.md` → “State snapshot”, pinned `b9a1a6ce…`).
All of that is discarded. Consequences:
- The AI does not know the project FPS, so it cannot convert seconds to frames.
- It does not know clip IDs, track tags or bin IDs, so it cannot cut, trim, move, replace, caption or place B-roll.
- `oddbrain_kdenlive_state` (`src/main/video/service.ts:661`) returns this reduced object, so the AI cannot recover the missing data through another tool.
This is the single reason “exact edit plan” is not real today.

**B2. Downloaded assets never become editable timeline assets.**
`src/main/video/service.ts:395` (`importAsset`) returns only a boolean. `AssetInstallAnswer` (`src/shared/lib/videoStudio.ts:128`) has `path`, `imported`, `receipt`, but no `binId`. `projectSnapshot` also discards the `bin` section. The AI’s creative search returns remote metadata and a token, not a local path or bin ID. So:
- the owner can download an asset;
- the owner can import it into Kdenlive’s bin;
- the AI cannot name it in a plan or place it on the timeline.
The “AI searches the library and uses assets” chain is broken at the last step.

**B3. Live editing depends on a fork with no published build.**
The pin is `lucasscariot/kdenlive@b9a1a6ce…`. The repository has **no GitHub releases** (checked 2026-10-21), so there is no Windows binary to install. OddBrain only asks for a Kdenlive executable and runs `--version`; it cannot build, install or provision the fork. On a clean Windows 11 machine the user cannot reach the native MCP endpoint that every editing feature expects. This is an owner-machine blocker, not a code typo. It should be surfaced before the first “Test Kdenlive + MCP” attempt, with a plain explanation and an alternative.

**B4. The approval card hides the commands it is approving.**
`VideoStudioView.tsx:49` renders `planReview.commandSummary` only. `commandSummary` (`nativeProtocol.ts:190`) prints the command type plus `trackId`, `clipId`, `binId`, `position`, `start`, `end` when present. It omits effect parameters, title text/coordinates, keyframes, captions, source ranges, transition settings, asset paths and every other field. The full `plan` object is returned to the renderer but not displayed. This violates the rule “shows exact commands” and makes one-use approval uninformed. Fix: render the complete command JSON in a bounded, scrollable review block, with validation issues attached to the offending command index.

**B5. Audio and most video assets cannot be previewed.**
`preview()` (`service.ts:339`) calls `fetchImage()`, which accepts only `image/jpeg|png|webp|gif`. Openverse audio results therefore fail; video results work only when a provider supplies a JPEG thumbnail. Music/SFX selection is blind. There is no audio player in the Video Studio. Fix: split preview into `image`, `video-thumbnail` and `audio-window` (bounded 10–20 s, base64 or a temp file), or clearly say “no visual preview” instead of a generic error.

**B6. The AI connector cannot be registered unless Kdenlive is already connected.**
`VideoStudioSettings.tsx:22` throws “Save and test this exact loopback Kdenlive MCP address first” before adding `oddbrain-video`. But evidence reading, creative search and plan proposal do **not** need Kdenlive to be open. This couples unrelated systems and blocks the useful part of the AI workflow. Fix: allow the connector whenever `aiToolsUrl` exists; let the Kdenlive-specific tools return a clear “editor not connected” error.

### High severity (usable but wrong or incomplete)

**H1. Initial frame selection is biased to the first third.**
`src/shared/lib/videoStudio.ts:281` computes overview positions as `duration * ((index + 1) / (wanted * 3 + 1))`. Measured with the real function:
- 60 s, 3 frames → 6 s, 12 s, 18 s (instead of 15/30/45 s);
- a 10-minute video with no scene candidates → ~86 s and ~171 s, both in the first 29 %.
`src/main/media/service.ts:196` also caps initial frames at 3 (`Math.min(3, …)`). The result is not “three meaningful samples spread across the video”; it is up to three early samples. Fix: spread overview points across `[margin, duration-margin]`; allow 8–12 initial frames for long videos (store locally; only send the ones the AI asks for); keep the scene-change priority.

**H2. The AI tool surface is too narrow for the documented protocol.**
`oddbrain-video` exposes 8 tools (`service.ts:660`): state, frame, sources, evidence, evidence-expand, evidence-note, creative-search, plan-propose. It does not expose `desktop_capabilities`, `desktop_media_wait`, `desktop_transcript`, `desktop_silence_detect`, `desktop_range_cut`, `desktop_title_create`, `desktop_effect_list`, `desktop_preview_render`, `desktop_render_verify` or `desktop_project_save_as`.
Some of these should stay owner-only (render, save). Read-only ones that the plan needs (capabilities, bin/clip state, transcript, silence, effect list, title read) should be proxied with bounded output.

**H3. No preview render, audio inspection or export verification.**
`desktop_preview_render` is in the required-tool list (`nativeProtocol.ts:28`) but never called. The UI says “the safe AI connector cannot start renders.” There is no `desktop_render_verify` call, no output playback, no render journal. “Preview → inspect → improve” is limited to still frames. This is the second-largest gap after B1.

**H4. No Reels/Shorts workflow.**
The only short-form signal is a `vertical` design-kit canvas and example prompts. There is no deterministic pass for hook selection, 9:16 profile change, per-shot reframe, caption timing, music ducking or short-form pacing. The native protocol supports `desktop_project_profile`, `desktop_clip_reframe` and `desktop_audio_duck`; none is wired into a workflow.

**H5. Link support is narrower than yt-dlp and preflight is fragile.**
`classifyVideoUrl` (`src/shared/lib/videoStudio.ts:306`) recognises only YouTube, TikTok, Instagram and URLs whose pathname ends in a video extension. Facebook, X, Reddit, Vimeo, `.m3u8` and signed CDN URLs without an extension become `unknown` and are refused. Direct preflight uses `HEAD` and requires `content-type: video/*` (`service.ts:423`); many CDNs return `application/octet-stream` or reject `HEAD`. There is no download size cap; a huge public file could fill the project drive despite the free-space check.
Fix: if yt-dlp is configured, accept any credential-free HTTPS URL and let `--simulate` decide; keep the no-DRM/no-cookie policy. Fall back to a `GET` range probe when `HEAD` is unavailable. Enforce `estimatedBytes` at approval time.

**H6. The local AI MCP endpoint has no authentication.**
`/api/video-studio-mcp` (`src/main/api/server.ts:209`) checks loopback Host, no Origin and POST/JSON, but any local process can read every stored transcript/frame, search the library and submit plans. The native Kdenlive endpoint optionally supports a bearer token; OddBrain’s own endpoint should too. Generate a per-launch token, write it only into the reviewed engine connector, and reject other callers. This is a local threat model, but the data is private video evidence.

**H7. Versions are not implemented.**
`KdenliveAction` includes `'save-version'`, `actionTools` lists guessed tool names, and `service.ts:697` exposes the IPC, but no UI calls it and the pinned native protocol has no checkpoint tool. “Versions and shared history” in the UI is history only. Either remove the dead action or implement real project-copy/version listing with a native save-as and an OddBrain receipt.

**H8. Evidence details are incomplete or invisible.**
- `expandEvidence` passes `videoOcr = false` (`service.ts:493`), so question-driven frames never get OCR even when video OCR is configured.
- `oddbrain_video_evidence_note` attaches a description to a moment only if a moment exists at that exact timestamp (`service.ts:718`). Descriptions at new timestamps are stored but not shown in the UI, so the owner cannot confirm them.
- `appDataBackup.ts:10` includes `video-studio.json` but not `video-evidence-v1.json` or `video-evidence-files/`, so a normal app-data backup loses the durable evidence map.

**H9. `workspace()` can block on a hung MCP port.**
`service.ts:611` calls `nativeConnection()`. If a connection was established it is reused, but when none has ever succeeded (never connected, or Test cleared `lastConnection`) each refresh runs a full three-request handshake with a 20 s timeout per request and no abort signal from the view. A port that accepts and stays silent can therefore stall Video Studio for ~60 s per refresh. Add negative caching and pass the view's cancellation signal; retry only on an explicit Test/refresh.

**H10. Kdenlive detection may fail on a Windows GUI build.**
`testKdenlive` (`service.ts:253`) runs `<exe> --version` and treats nonzero/empty output as “could not be verified.” A GUI-subsystem Qt app may not attach stdout the way this expects. Add a fallback: file exists + Windows version resource (`FileVersionInfo`) + user confirmation, then try the MCP endpoint separately. Do not conflate “exe verified” with “MCP compatible.”

### Medium / maintainability

- `save-version` dead code and several protocol tools are declared but unused.
- `reviewEngineConnector` filters out `kdenlive` and `oddbrain-video`, then pushes only the proxy. That is a safe choice, but it must be paired with a rich read-only proxy (B1/H2).
- AI `creativeProposal` is memory-only; a restart loses the proposal, and each search overwrites the previous one.
- `recordEvidence` deduplicates by SHA-256 + source kind, not by owner; two windows share maps. Fine for one owner, but state it.
- Design-kit cleanup removes the whole new folder on failure (`service.ts:590`). The random name makes collision unlikely, but a pre-existing folder should be refused instead of deleted.
- The main process has 2,928 lines and the video view is nearly unreadable one-line JSX. Split `main/index.ts` into handler modules and format `VideoStudioView.tsx`. This is not cosmetic: it is why integration gaps were easy to miss.
- There is now no automated regression safety net. That is intentional for this reset, but the next change should add a small honest suite, not 1,650 mocks.

---

## 6. What is genuinely good

This is not a failed rewrite. The following are real and worth keeping:

- **The protocol adapter is careful.** Exact server-name/version/protocol pinning, required-tool and input-schema checks, bounded JSON, command type allow-list, no GPL code copied.
- **The approval model is sound.** One-use tokens, preference digests, revision re-checks, atomic batches, “uncertain on Stop” language, no silent retry.
- **The network boundary is careful.** Loopback-only MCP; DNS/private-address checks; redirect re-checks; bounded responses; HTTPS-only; no cookies or DRM bypass; licence-specific download blocking and receipts.
- **The local design kit is real.** Two editable title SVGs, shapes, a gradient, two ASS caption families, a restrained LUT and recipe JSON are generated without any provider or model, and the file says plainly that Kdenlive owns animation and rendering.
- **The evidence model is honest.** Raw transcript/scene/frame, unconfirmed AI descriptions and confirmed owner notes are separate; hashes and coverage are stored; no emotion/diarization claims.
- **The product docs are now honest** about the removed test suite and the external Kdenlive gate. That is a real improvement over the previous “everything is complete” claims.
- **The app builds and the UI renders.** The previous chat made it sound like the repo was falling apart; at the build/render level it is not.

---

## 7. What to do — implementation plan

The plan below accepts the repo’s current architecture (OddBrain = brain + library + approval; Kdenlive = timeline/render). It does **not** add a second timeline engine and does **not** rewrite an open project file.

### Phase A — Make the chain real (1–2 days)

1. **Replace the reduced snapshot with a bounded state model.**
   - New `src/main/video/state.ts` with `KdenliveState`: `fps { numerator, denominator }`, `duration`, `playhead`, `activeTrackId`, `tracks[]`, `clips[]`, `bin[]`, `sequences[]`, `markers[]`, `counts`, `undo`, `revision`, `documentUrl`, `sequenceId`.
   - Parse `desktop_state` fully but bound it: e.g. 50 tracks, 2,000 clips, 2,000 bin items, 1,000 markers; summarize older items with counts and a filter.
   - Add `fps`/`duration` to `KdenliveProjectSnapshot` and to the UI header.
   - Acceptance: with a fixture state, the AI can compute `frame = round(seconds × fps)`, name every clip/bin item and see track tags.

2. **Expose the read-only state to the AI.**
   - `oddbrain_kdenlive_state` returns the bounded tracks/clips/bin/sequences/markers and `desktop_capabilities` summary.
   - Add `oddbrain_kdenlive_bin` (id, name, path basename, duration, ready, type) and `oddbrain_kdenlive_clip` (id, binId, track, position, source range, speed, linked/group).
   - Keep `sessionId` out; keep Apply out.
   - Acceptance: from a real project, the AI can write a 3-command insert/trim batch using real IDs without guessing.

3. **Carry downloaded assets through to a plan.**
   - `desktop_media_import` result or `desktop_state.bin` gives the bin ID. Return `binId` and `localPath` in `AssetInstallAnswer`.
   - Persist a bounded `video-assets.json` mapping `sha256 → { binId, localPath, providerId, licence, receipt, projectFolder }`.
   - Add `oddbrain_creative_assets` (read-only) so the AI can see which approved assets exist and their bin IDs.
   - Acceptance: owner downloads one Pixabay clip; AI proposes `insert` using that binId; validation accepts it.

4. **Show the exact plan.**
   - In `VideoStudioView.tsx`, render the complete `planReview.plan.commands` JSON in a `<pre>` (bounded height, copy button), plus validation issues with `commandIndex`.
   - Show the asset binding per command (`binId`, file name, licence receipt).
   - Acceptance: the owner can inspect every field that will be sent; no hidden parameters.

5. **Decouple the AI connector from Kdenlive.**
   - Remove the `saved.mcpConnected` guard in `reviewEngineConnector`.
   - Register `oddbrain-video` whenever `aiToolsUrl` exists; Kdenlive tools return “editor not connected” until Test succeeds.
   - Acceptance: with Kdenlive closed, the AI can list evidence, search the library and submit a plan (which validation refuses cleanly).

6. **Fix previews.**
   - `preview()` returns a typed result: image bytes for images, a JPEG thumbnail for video, and a bounded audio window (or a clear “audio preview unavailable” for providers that only give a page URL).
   - Never send an audio URL to `fetchImage`.
   - Acceptance: Openverse audio plays (or explicitly says why not); Pixabay video shows a thumbnail.

### Phase B — Make it usable without building Kdenlive (3–5 days)

7. **Draft-project export fallback.**
   - New `src/main/video/kdenliveProject.ts` that serializes an approved plan + evidence into a **new** `.kdenlive`/MLT XML project: tracks, clips, source in/out, titles, audio, effects. Never touch an open file.
   - UI: “Export draft and open in Kdenlive.” If the native MCP is absent, this is the primary action; if present, it is an extra.
   - Acceptance: a clean Windows machine with stock Kdenlive can open the draft, play it and render it. No live readback is claimed.
   - This is the practical answer to B3. It uses Kdenlive’s own project format, not a second timeline runtime, and it can be implemented without the fork.

8. **Kdenlive detection that tells the truth.**
   - Accept stock Kdenlive, show “Live MCP unavailable” and the draft-export action.
   - Detect the fork by probing the endpoint, not by trusting a version string.
   - Link to the fork’s build instructions and its exact commit. Do not pretend OddBrain installs it.

9. **Owner-side preview and render verification.**
   - Add “Preview 10 s” (owner approval) calling `desktop_preview_render`; display the returned MP4/WAV through a safe local media route.
   - Add “Verify export” calling `desktop_render_verify` for a chosen path; show technical results, never claim editorial approval.
   - Keep these owner-only; do not give the AI a render tool.

10. **Short-form mode.**
    - A deterministic plan builder for 9:16: project profile, per-shot `reframe`, caption style, hook selection from transcript, music ducking.
    - AI reviews/edits the plan; the builder consumes no model tokens.
    - Acceptance: a 16:9 talking-head clip becomes a 30 s 9:16 draft with captions and reframed shots, verified by frame captures.

11. **Link and library coverage.**
    - Any credential-free HTTPS URL when yt-dlp is configured; `--simulate` preflight; size cap and free-space check.
    - Provider interface with pagination; add Openverse audio, Wikimedia audio, Google Fonts (no key), and a clearly licensed SFX source. Do not claim CapCut/Canva parity.
    - Add up to 4 thumbnail image blocks to `oddbrain_creative_search` so the AI can rank visually.

### Phase C — The agentic reader (3–5 days)

12. **Word-level transcript.**
    - For Kdenlive bin clips, use `desktop_transcribe`/`desktop_transcript` (Whisper/Vosk) and store exact words + pauses.
    - For standalone attachments, add a `whisper.cpp` adapter behind the existing recognizer interface. Keep System.Speech as an optional fallback. No automatic model download.
    - Disclose what is unavailable instead of relabelling 10-minute chunks as fine timing.

13. **Durable scene map.**
    - One keyframe + score + optional OCR + optional local-vision description per meaningful scene; store with the source hash.
    - Fix H1 frame distribution; increase initial coverage; keep a token budget so the AI only reads what it needs.
    - Keep AI descriptions unconfirmed and show every one in the UI for confirmation.

14. **Reference-style fingerprint.**
    - Deterministic metrics: shot lengths, cuts/min, motion, color histogram, caption position/size, music tempo/ducking. No “style replication” claims beyond measured evidence.
    - Acceptance: a reference video yields a fingerprint the AI can cite by timestamp; a generated plan references those metrics.

### Phase D — Proof (2–3 days)

15. **Rebuild a small suite.** Pure functions (`adaptiveFramePoints`, `classifyVideoUrl`, plan normalization), a fixture MCP server for protocol shape, IPC contract checks, and the jsdom UI smoke used in this audit. No 1,650 mocks. Add a Windows acceptance checklist with exact evidence to record.

16. **Do not call it complete until:** a real Windows 11 machine opens a real project, the AI reads state, proposes a batch, the owner approves, the batch applies as one Undo step, a 10 s preview is watched, and the final export verifies. If the fork is not installed, prove the draft-export path end to end instead.

---

## 8. What not to do

- Do not build another timeline editor or a second render engine.
- Do not parse or rewrite an open `.kdenlive` file behind Kdenlive’s back.
- Do not make the GPL fork a hard dependency for basic chat, video reading, library search or draft export.
- Do not re-add the 1,650 mock tests. Add a small suite that tests the real contracts.
- Do not promise CapCut/Canva’s catalogue. Use licensed provider APIs and say what is missing.
- Do not let the AI download or Apply directly. Keep the one-use owner review.
- Do not “fix” the missing state by asking the model to guess FPS or clip IDs. Read it from the server.

---

## 9. Next 30–45 minute chunk (if you approve)

The smallest set that removes the most false confidence:

1. Fix `adaptiveFramePoints` so overview frames span the whole duration; add a 5-case probe. (~15 min)
2. Render the complete plan JSON in the approval card. (~20 min)
3. Remove the Kdenlive-connected guard from the AI connector. (~5 min)
4. Return a typed “no audio preview” instead of trying `fetchImage` on audio. (~15 min)
5. Add `fps` and `duration` to the visible snapshot + AI state, without the full state model yet. (~30 min)

After that, the next chunk should be Phase A.1–A.3 (full state + bin IDs), because nothing else in the edit workflow is honest until the AI can see the timeline.

---

## 10. Decisions needed from the owner

1. **Panel vs companion:** Do you accept the separate OddBrain window (current repo direction), or is a panel inside Kdenlive a must-have? The latter requires maintaining a GPL Kdenlive fork; the current repo deliberately does not do it.
2. **Fork vs draft export:** Do you want to build/install the native Kdenlive fork on Windows, or should the default path be “generate a new Kdenlive project and open it”? Draft export works with stock Kdenlive and no build; live readback/Undo does not.
3. **Short-form first:** Confirm Reels/Shorts is still the first workflow. If yes, Phase B.10 comes before deeper reference matching.

Nothing in this audit changes product authority. `RULES_FEATURES_AND_REASONS.md` remains the rulebook; this file is evidence and a proposed plan.
