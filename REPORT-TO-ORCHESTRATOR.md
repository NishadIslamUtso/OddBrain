# Report to orchestrator — audio/video/image intake

**Status: IN PROGRESS.** Ruling #4 answers the registry question and approves the current decoder boundary until the shared door lands. This continuation adds visible per-model image-capability disclosure. Local typecheck, tests, and build pass; Electron install/smoke failed in the sandbox, and CI for these latest changes is pending. No completion claim.

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

Other accepted out-of-allowlist ancestry from `c17cf31` is unchanged in this continuation: `package.json` / `package-lock.json`, `src/main/index.ts`, renderer `App.tsx`, `ChatView.tsx`, `useChat.ts`, and other non-AV hunks. The `App.addFiles` door was not edited. In `attachments.ts`, only AV decoder work belongs to this lane; document extraction remains frozen. `media.ts` and `videoFrames.ts` are AV decoder paths under Ruling #4. No visual redesign or work on the visual-UI owner's branch was done.

## session-v2

**Ported: none.** `reference/session-v2/OddBrain-App-UI.patch` is reference-only and declares baseline `2f05dac9`, not this branch's `a6c7807`; the brief disallows applying it wholesale. No session-v2 code was copied.

## Gate evidence for this local update

Commands were run in order in `apps/03_oddbrain`:

1. `npm ci --ignore-scripts && node node_modules/electron/install.js`: installed 483 packages; audit reported 14 vulnerabilities (11 moderate, 1 high, 2 critical). Electron install then failed with `TypeError: fetch failed`.
2. `npx tsc --noEmit`: pass, 0 errors.
3. `npx vitest run`: **104 files / 752 tests passed**.
4. `npm run build`: pass; two existing CSS optimizer warnings for `::highlight(ob-find)` and `::highlight(ob-find-current)`.
5. `npm run smoke`: failed before launch because Electron was not installed. The Electron mirror retry was not run in this sandbox. Do not count local smoke as passed.

The prior AV commit `9f4e5e1` had green Linux/Windows CI in run `39125432706`; this Composer update is not included in that run. CI for the current update is pending its push.

## Remaining / unproven

- Per-model audio and Claude Code image capability remains unverified because the available model lists do not expose modality capability data. The composer names that uncertainty before send; AGY's image refusal is explicit. No live provider request was made.
- The owner's 8 GB RAM / 4 GB VRAM device's decode peak, available memory, and model fit were not measured. Fixed decode bounds remain; only exact prepared payload bytes are shown.
- No physical-device media corpus, codec matrix, or encrypted/DRM fixture was run. The shared door's integration is deferred until `arena/6d6aabbf` lands, per Ruling #4.
