# Report to orchestrator — AV intake and renderer UI port

**Status: AV intake preserved; renderer/UI port IN PROGRESS.** The active task ports selected renderer/UI slices from `origin/arena/cc83a507-oddbrain` onto the fixed branch, while preserving backend/security contracts and AV behavior. Ruling #4 still governs AV ownership and the shared intake door. The first shell/navigation slice is pushed in `a56a486`; GitHub Actions run `39133043196` passed Linux and Windows, including smoke. The earlier local Electron install/smoke failure remains unpassed, not a CI failure.

## Renderer UI port — 2026-10-18

- Reference: read-only `origin/arena/cc83a507-oddbrain` at `df4226a`. The reference branch has broad non-UI changes; only selected renderer files are being ported, not merged wholesale.
- First slice adds `src/renderer/src/styles/desktop.css`, imports it from renderer `main.tsx`, and connects the shell/content/title-bar/sidebar/chat/composer class hooks. It ports the reference `AppNav` horizontal mode and approval-count badge, and exposes destinations in the collapsed sidebar. Added `tests/app-nav.test.ts` for these UI states.
- Changes to `App.tsx` and `Composer.tsx` are structural/presentation-only; the shared intake `App.addFiles` path, send path, AV disclosure/processing, and bridge behavior were not changed. No main, preload, shared backend, security, AV decoder, dependency, or lockfile files were changed.
- Current worktree gate in `apps/03_oddbrain`: `npm test` passed **105 files / 755 tests**; `npm run build` passed, including typecheck; `npm run build:web` passed. Both builds show existing CSS optimizer warnings for `::highlight(ob-find)` and `::highlight(ob-find-current)`; web build also shows the existing large-chunk advisory. GitHub Actions run `39133043196` passed Linux and Windows, including the smoke steps, for code commit `a56a486`. A browser preview is running on port 5174.
- Next renderer slices: look/appearance state and selectable shell layouts, then chat/home/composer and graph presentation. Keep every shared file hunk-compatible with current bridge, AV and security contracts.

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

Commands were run in `apps/03_oddbrain`:

1. `npm test`: **105 files / 755 tests passed**.
2. `npm run build`: passed, including TypeScript; two CSS optimizer warnings remain for `::highlight(ob-find)` and `::highlight(ob-find-current)`.
3. `npm run build:web`: passed; the same CSS warnings and the existing >500 kB chunk advisory were reported.
4. `npm run smoke` was not run during this UI slice. In the earlier sandbox attempt, `npm ci --ignore-scripts && node node_modules/electron/install.js` installed 483 packages, reported 14 audit vulnerabilities (11 moderate, 1 high, 2 critical), then failed to fetch Electron with `TypeError: fetch failed`; the subsequent smoke failed before launch. Do not count local smoke as passed.

GitHub Actions run `39128942052` succeeded for base commit `3bfba4e`. The renderer shell/navigation slice was pushed as `a56a486`; run `39133043196` passed on both Linux and Windows, including Electron smoke.

## Remaining / unproven

- UI work is only at the shell/navigation foundation. Look/layout preferences, the new appearance/settings surface, chat home/composer refinements, and graph appearance from the reference remain unported.
- Per-model audio and Claude Code image capability remains unverified because the available model lists do not expose modality capability data. The composer names that uncertainty before send; AGY's image refusal is explicit. No live provider request was made.
- The owner's 8 GB RAM / 4 GB VRAM device's decode peak, available memory, and model fit were not measured. Fixed decode bounds remain; only exact prepared payload bytes are shown.
- No physical-device media corpus, codec matrix, or encrypted/DRM fixture was run. The shared door's integration is deferred until `arena/6d6aabbf` lands, per Ruling #4.
