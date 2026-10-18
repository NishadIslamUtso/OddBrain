# Report to orchestrator — AV intake and renderer UI port

**Status: AV intake preserved; renderer/UI port IN PROGRESS.** The active task ports selected renderer/UI slices from `origin/arena/cc83a507-oddbrain` onto the fixed branch, while preserving backend/security contracts and AV behavior. Ruling #4 still governs AV ownership and the shared intake door. The shell/navigation slice is pushed in `a56a486`; build cleanup is committed as `7721935`. CI run `39134392056` passed Linux and Windows, including Electron smoke, for `7721935`. Local gates also pass (106 files / 756 tests, typecheck, desktop build, web build, diff check). The earlier local Electron install/smoke failure remains recorded as a local limitation, not a CI failure.

## Renderer UI port — 2026-10-18

- Design reference: read-only `origin/arena/cc83a507-oddbrain` at `df4226a`. Corrected-build comparison: read-only `origin/clean-build` at `6835309`, which descends from the UI reference. Neither branch is a wholesale merge target. `clean-build` removes operational docs and its reviewed app-code delta includes a Windows PDF.js font-data path fix plus Node-20 Promise compatibility configuration; those non-renderer changes are intentionally not part of this slice.
- The first renderer slice adds `src/renderer/src/styles/desktop.css`, imports it from renderer `main.tsx`, and connects shell/content/title-bar/sidebar/chat/composer class hooks. It ports horizontal navigation and approval-count styling and exposes destinations in the collapsed sidebar. `tests/app-nav.test.ts` covers the navigation states. It is committed in `a56a486`; `cfe79e9` is the current committed base.
- Build follow-up is committed as `7721935`: CSS Highlight rules moved to `lib/findHighlightStyles.ts` and installed before React renders, preventing Lightning CSS warnings while preserving Find behavior. Tests cover the runtime rules and optimizer-safe CSS input.
- Route views, conditional overlays, and `EnginePanel` now load lazily behind `Suspense`; `Mascot.tsx` lazy-loads and caches per-scene motion SVGs (including deduplicating concurrent requests). This reduces the web entry from 505.65 kB to **477.36 kB (146.42 kB gzip)**; the separate PDF chunk is 455.17 kB. The latest `build:web` emitted neither the prior `::highlight(...)` warnings nor the >500 kB advisory.
- Latest local gates in `apps/03_oddbrain`: `npm test` **106 files / 756 tests passed**; `npm run typecheck`, `npm run build`, `npm run build:web`, and `git diff --check` passed. Vitest prints an unrelated Vite CJS Node API deprecation notice. No main, preload, backend, security, AV decoder, dependency, or lockfile files were changed. Preview on port 5174 returns HTTP 200; it has not had a screenshot-based visual review.
- CI run `39134392056` passed Linux and Windows, including Electron smoke, for `7721935`. Local Electron smoke was not rerun; the earlier sandbox download limitation remains recorded.
- Next: visually inspect the live preview, then continue appearance/look preferences and selectable layouts. Keep chat/home/composer and graph changes renderer-only and compatible with the current bridge, AV and security contracts.

## What exists

### AV decoding and limits

- `apps/03_oddbrain/src/shared/lib/media.ts` validates MP3/WAV containers and derives bounded video-frame timestamps. Audio limits are 6 MiB and 90 seconds, mono/stereo, 8–48 kHz; formats are MP3 and uncompressed PCM/float WAV.
- The AV parts of `apps/03_oddbrain/src/shared/lib/attachments.ts` locally decode/re-encode PNG/JPEG/WebP images (source sides up to 8192 px / 24 MP; output sides up to 2048 px and output up to 2 MiB), validate/decode audio, and persist payloads in IndexedDB. Document extraction in that file is not this lane.
- `apps/03_oddbrain/src/renderer/src/lib/videoFrames.ts` bounds MP4/WebM work to 100 MiB, 10 minutes, 4096 px per source side, at most four sampled frames, each no larger than 1280×720 and 2 MiB. Video audio is not extracted or sent.
- `apps/03_oddbrain/src/renderer/src/components/composerMedia.ts` states audio capability as unverified for the exact selected OpenAI model when the provider model list has no capability field. It never infers support from the name, selects a default, or reroutes.
- `apps/03_oddbrain/vitest.config.ts` contains the Ruling #1 repair: `fileParallelism: false` replaces `maxWorkers: 1`, with only its adjacent comment updated.
- The same module reports `agy` image input as unsupported (the engine refuses it) and `claude-code` image input as unverified for its exact selected model. `Composer.tsx` displays this as a status line while image payloads are attached, before Send; it does not switch engines.
- `Composer.tsx` also displays exact prepared image/audio payload byte counts from the base64 payload. These are not source-video sizes or RAM/VRAM estimates; invalid or missing bytes produce no label.
- `apps/03_oddbrain/tests/composer-media-honesty.test.ts` covers exact-model audio disclosure, no automatic selection, AGY image refusal, unverified Claude Code image capability, no guessed model name, exact payload bytes, malformed payloads, and exact byte formatting.

## Intake ownership and integration

**Ruling #4 (in `ODD-BRAIN-BRIEF.md`, commit `4a459e3`) answers Q1.** There is no main-process media registry because image/audio/video decoding uses renderer APIs. The current `readAttachment`, `readAudioAttachment`, and `extractFrames` boundary is the explicitly approved fallback until `arena/6d6aabbf` lands its shared door. No second door and no `src/main/media` module should be added. The integration seam is the shared door's AV kind-dispatch calling these decoder functions and printing their named refusals verbatim. The door and `src/shared/types.ts` remain owned by the other lane; I did not edit them.

**Frozen, awaiting merge (no further edits):**

- `apps/03_oddbrain/src/shared/lib/documents.ts`
- `apps/03_oddbrain/src/shared/lib/pdfPages.ts`
- `apps/03_oddbrain/src/main/windowBounds.ts`
- `apps/03_oddbrain/src/renderer/src/state/engine.ts`
- `apps/03_oddbrain/src/shared/lib/ollama.ts`
- `apps/03_oddbrain/src/shared/lib/providers.ts`
- `apps/03_oddbrain/src/shared/types.ts`
- The pre-brief dictation hunk in `apps/03_oddbrain/src/renderer/src/components/Composer.tsx`; AV-only Composer changes do not touch it.

Other accepted out-of-allowlist ancestry from `c17cf31` remains unchanged. The `App.addFiles` door was not edited; the current UI work only wraps existing rendered content. In `attachments.ts`, only AV decoder work belongs to the AV lane; document extraction remains frozen. `media.ts` and `videoFrames.ts` remain the AV decoder paths under Ruling #4. The earlier AV-only continuation did not include visual redesign; the selected reference is now being ported renderer-only as documented above.

## session-v2

**Ported: none.** `reference/session-v2/OddBrain-App-UI.patch` is reference-only and declares baseline `2f05dac9`, not this branch's `a6c7807`; the brief disallows applying it wholesale. No session-v2 code was copied.

## Gate evidence for the current worktree

Latest commands were run in `apps/03_oddbrain` against commit `7721935`:

1. `npm test`: **106 files / 756 tests passed**. Vitest still prints its Vite CJS Node API deprecation notice.
2. `npm run typecheck`: passed.
3. `npm run build`: passed. No CSS Highlight optimizer warnings were emitted; desktop renderer chunk sizes are uncompressed build output and this config emits no >500 kB advisory.
4. `npm run build:web`: passed with **no CSS Highlight optimizer warnings and no >500 kB advisory**. Web entry JS is **477.36 kB / 146.42 kB gzip**; PDF chunk is 455.17 kB.
5. `git diff --check`: passed.
6. `npm run smoke` was not run locally for this follow-up. In the earlier sandbox attempt, Electron's install failed with `TypeError: fetch failed`; local smoke did not reach launch. Do not count local smoke as passed.

CI run `39134392056` passed Linux and Windows, including Electron smoke, for `7721935`. Earlier runs `39133252677` (`cfe79e9`) and `39133043196` (`a56a486`) passed as well.

## Remaining / unproven

- The visual design port currently includes the shell/navigation foundation; the build cleanup is a separate renderer performance/accessibility slice. Look/layout preferences, the new appearance/settings surface, chat home/composer refinements, and graph appearance from the reference remain unported.
- Per-model audio and Claude Code image capability remains unverified because the available model lists do not expose modality capability data. The composer names that uncertainty before send; AGY's image refusal is explicit. No live provider request was made.
- The owner's 8 GB RAM / 4 GB VRAM device's decode peak, available memory, and model fit were not measured. Fixed decode bounds remain; only exact prepared payload bytes are shown.
- No physical-device media corpus, codec matrix, or encrypted/DRM fixture was run. The shared door's integration is deferred until `arena/6d6aabbf` lands, per Ruling #4.
