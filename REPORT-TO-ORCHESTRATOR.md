# Report to orchestrator — audio/video/image intake

**Status: NOT COMPLETE.** The Vitest CI repair is green. The additional AV honesty changes below pass the local typecheck, tests, and build, but have not yet run in GitHub Actions. Baseline: `a6c7807`; branch: `arena/9a3a5c88-oddbrain`.

## What exists

### AV handling already present on this branch

- `apps/03_oddbrain/src/shared/lib/media.ts` validates MP3/WAV containers and derives bounded video-frame timestamps. Audio limits are 6 MiB and 90 seconds, mono/stereo, 8–48 kHz; formats are MP3 and uncompressed PCM/float WAV.
- `apps/03_oddbrain/src/shared/lib/attachments.ts` locally decodes/re-encodes PNG/JPEG/WebP images (source sides up to 8192 px / 24 MP; output sides up to 2048 px and output up to 2 MiB), validates audio, and keeps media bytes in IndexedDB. This file also contains document extraction, which is outside this lane and frozen.
- `apps/03_oddbrain/src/renderer/src/lib/videoFrames.ts` bounds MP4/WebM work to 100 MiB, 10 minutes, 4096 px per source side, at most four sampled frames, each no larger than 1280×720 and 2 MiB. Video audio is not extracted or sent.
- Existing `App.addFiles` routes attachments through `readAttachment`, `readAudioAttachment`, and `extractFrames`. Audio goes only to the explicitly selected, enabled OpenAI model; there is no provider/model fallback. The provider model list does not establish per-model audio capability.

### AV-only changes in this continuation

- `apps/03_oddbrain/src/renderer/src/components/composerMedia.ts` now reports audio capability as **unverified** for the exact selected OpenAI model when the provider listing lacks capability data. It does not infer support from a model name. It distinguishes no selection and a model missing from the enabled list; it never selects or reroutes automatically.
- `apps/03_oddbrain/src/renderer/src/components/Composer.tsx` uses that model-specific disclosure before send. It also shows exact outgoing image/audio payload bytes, calculated from the prepared base64 payload and labeled in bytes. Invalid or missing payload data produces no size label. These are payload byte counts—not source-video sizes, RAM/VRAM readings, or fit estimates. The prior dictation hunk in this file was not changed.
- `apps/03_oddbrain/tests/composer-media-honesty.test.ts` adds five checks for unknown model capability, explicit selection/no fallback, exact byte counts, and refusal to invent a size.
- `apps/03_oddbrain/vitest.config.ts` contains only the Ruling #1 fix: `fileParallelism: false` replaces `maxWorkers: 1`, with its adjacent comment updated. Local Vitest and CI now pass with the setting.

## Intake ownership and collision

The baseline has no `src/main/` media/decode registry (`git ls-tree -r a6c7807 apps/03_oddbrain/src/main` found none). No second intake door was added. Current AV decoders remain behind the existing `readAttachment` / `readAudioAttachment` / `extractFrames` functions; `App.addFiles` is the named integration point for `arena/6d6aabbf`'s shared intake registry. Registry integration is still pending coordination with that lane.

**Frozen, awaiting merge (no further edits):**

- `apps/03_oddbrain/src/shared/lib/documents.ts`
- `apps/03_oddbrain/src/shared/lib/pdfPages.ts`
- `apps/03_oddbrain/src/main/windowBounds.ts`
- `apps/03_oddbrain/src/renderer/src/state/engine.ts`
- `apps/03_oddbrain/src/shared/lib/ollama.ts`
- `apps/03_oddbrain/src/shared/lib/providers.ts`
- `apps/03_oddbrain/src/shared/types.ts`
- The pre-brief dictation change in `apps/03_oddbrain/src/renderer/src/components/Composer.tsx` (the AV-only composer edits above do not touch it).

Other out-of-allowlist ancestry from `c17cf31` remains a reported collision, not new work: `package.json` / `package-lock.json`, `src/main/index.ts`, renderer `App.tsx`, `ChatView.tsx`, `useChat.ts`, `renderer/src/lib/videoFrames.ts`, `src/shared/lib/media.ts`, and `src/shared/lib/attachments.ts`. No further edits were made to those paths in this continuation. The one-file `vitest.config.ts` change is the explicit Ruling #1 exception. No visual redesign or work on the visual-UI owner's branch was done.

## session-v2

**Ported: none.** `reference/session-v2/OddBrain-App-UI.patch` is reference-only and declares baseline `2f05dac9`, not this branch's `a6c7807`; the brief disallows applying it wholesale. No session-v2 code was copied.

## Gate and CI evidence

### Current AV working tree (local)

- `npx tsc --noEmit`: pass, 0 errors (also rechecked through `npm run build`).
- Focused AV tests: 3 files / 15 tests passed.
- `npx vitest run`: **104 files / 749 tests passed**.
- `npm run build`: pass. It emitted the same two CSS optimizer warnings for the existing `::highlight(ob-find)` and `::highlight(ob-find-current)` rules.
- The current AV edits have **not yet been pushed or checked by CI at this report point**.

### Vitest repair and prior environment limits

- CI run `39124976799` for `0228186` passed on Linux and Windows: Install, Types, Tests, platform speak checks, Build, and Smoke all passed. No Windows “Built media worker” failure was reported, so no question line is needed.
- The pre-fix CI failure was tinypool's `RangeError: options.minThreads and options.maxThreads must not conflict`: a 4-vCPU runner selected `minThreads: 2` while `maxWorkers: 1`. Ruling #1 authorized the one-file `fileParallelism: false` repair. The earlier failing runs are `39123693424` and `39123792135`.
- The sandbox's earlier `npm ci --ignore-scripts` installed 483 packages (audit: 14 vulnerabilities—11 moderate, 1 high, 2 critical), but `node node_modules/electron/install.js` failed with `TypeError: fetch failed`. Local `npm run smoke` therefore failed before launch and was not retried. CI Smoke passed on `0228186`; smoke for the newer AV edits is pending CI.

## Remaining / unproven

- Shared intake-registry integration is not done; coordinate at `App.addFiles` with `arena/6d6aabbf`. No `src/main/` media registry was present at baseline, and no second door was built.
- Audio capability remains unverified per model because the provider listing exposes no capability field. The composer says this before send; a selected model may refuse. No live provider request was made.
- The 8 GB RAM / 4 GB VRAM device's real decode peak, available memory, and model fit were not measured. Fixed input/frame bounds remain; exact prepared payload bytes are shown without implying RAM/VRAM use or a performance fit.
- No real-device media corpus, codec matrix, DRM/encryption fixture, or current-AV-change Windows/Electron smoke run has been demonstrated. Do not claim the lane complete until the pushed AV changes pass CI and registry ownership is resolved.
