# Report to orchestrator — audio/video/image intake

**Status: NOT COMPLETE.** This is a truthful handoff, not a green milestone claim. Baseline is `a6c7807`; current branch is `arena/9a3a5c88-oddbrain`, tip at report time `f65d352`.

## What exists now

The pre-brief commit `c17cf31` contains working-tree AV intake code and unit coverage:

- `apps/03_oddbrain/src/shared/lib/media.ts` validates MP3/WAV containers and derives bounded video-frame timestamps. Audio inputs are limited to 6 MiB, 90 seconds, mono/stereo and 8–48 kHz; supported formats are MP3 and uncompressed PCM/float WAV.
- `apps/03_oddbrain/src/shared/lib/attachments.ts` locally decodes/re-encodes PNG/JPEG/WebP images (input dimensions up to 8192 per side / 24 MP; output at most 2048 per side and 2 MiB), validates/decodes audio, and stores sent media bytes in IndexedDB. The current shared file also implements document extraction, which is outside this lane.
- `apps/03_oddbrain/src/renderer/src/lib/videoFrames.ts` attempts bounded MP4/WebM decoding: at most 100 MiB, 10 minutes, 4096 px per source side and four sampled frames, each no larger than 1280×720. Video audio is not extracted or sent; the UI/source note says so.
- `apps/03_oddbrain/src/renderer/src/App.tsx`, `components/Composer.tsx`, `components/ChatView.tsx`, `hooks/useChat.ts`, `src/shared/lib/providers.ts` and `src/shared/types.ts` wire intake to explicit model selection. Audio is allowed only through the explicitly selected, enabled OpenAI route; no alternate provider/model fallback is used. The UI warns before send that provider model listings do not establish audio capability and that the chosen model may refuse the clip.
- Evidence: `tests/audio-attachments.test.ts` covers local validation, refusal paths and persistence/reload through `loadAudio`; `tests/providers.test.ts` covers selected-provider serialization/refusal; `tests/cloud-routing.test.ts` checks the exact selected OpenAI model route. No live provider call was made.

The current implementation does **not** verify audio capability for each listed OpenAI model; it warns that the exact selected model may refuse. 8 GB/4 GB device performance has not been measured. No wake-word or continuous voice feature was added. The prior `Composer.tsx` change also sets dictation to one utterance; dictation is not this lane and is called out below as a scope collision.

## Intake ownership / path collision

The baseline has no `src/main/` media/decode registry (`git ls-tree -r a6c7807 apps/03_oddbrain/src/main` found no media/decode/attachment module). The existing AV path remains renderer-side (`App.addFiles` → `readAttachment` / `readAudioAttachment` and `extractFrames`). I did not create a second intake door or integrate another branch's registry. The named integration point for the intake-owner lane is that existing `App.addFiles` boundary; it needs coordination with `arena/6d6aabbf` before integration.

**Important collision:** `c17cf31` predates the lane brief and changes files outside the allowed paths. I am reporting, not concealing, that mismatch. Beyond `components/Composer.tsx` and `tests/`, the branch currently changes `package.json`/`package-lock.json`, `src/main/index.ts`, `src/main/windowBounds.ts`, `renderer/src/App.tsx`, `renderer/src/components/ChatView.tsx`, `renderer/src/hooks/useChat.ts`, `renderer/src/lib/videoFrames.ts`, `renderer/src/state/engine.ts`, `src/shared/lib/attachments.ts`, `media.ts`, `providers.ts`, `ollama.ts`, `documents.ts`, `pdfPages.ts`, `src/shared/types.ts`, and `vitest.config.ts`. Several are document extraction/window-bounds/provider-routing work or intake-door edits outside this lane's allowlist. I made no visual UI redesign and did not touch the visual-UI owner's branch.

## session-v2 comparison

**Ported: none.** I refused to apply `reference/session-v2/OddBrain-App-UI.patch` wholesale: its manifest identifies baseline `2f05dac9`, while this branch is based on `a6c7807`; the brief says it is reference-only and piecewise. No session-v2 AV implementation was copied into this branch.

## Gate results (ran in the required order, in `apps/03_oddbrain`)

1. `npm ci --ignore-scripts && node node_modules/electron/install.js`: `npm ci` installed 483 packages (14 audit vulnerabilities: 11 moderate, 1 high, 2 critical). Electron installation then failed with `TypeError: fetch failed`.
2. `npx tsc --noEmit`: **pass, 0 errors**.
3. `npx vitest run`: **pass, 103 files / 744 tests**.
4. `npm run build`: **pass**; two CSS optimizer warnings for the existing `::highlight(ob-find)` and `::highlight(ob-find-current)` rules.
5. `npm run smoke`: **fail** before launch because Electron was not installed; expected `SMOKE OK SCROLL OK errors=0 warnings=0` was not observed.

GitHub Actions run `39122937063` for `f65d352`, `39123551397` for `2a8e3fb`, and `39123693424` for `2218d5e` failed at the Tests step on Linux and Windows; Types passed and Build/Smoke were skipped. The exact workflow Vitest command with default + JUnit reporters passed locally with 103 files / 744 tests. The log download for the first run returned EOF; later check annotations provide only the generic exit code, so the CI-specific failure details and cause are unproven. `gh run rerun` refused the first run because the workflow may be broken. CI is **not green**.

## Remaining / unproven

- No `src/main/` AV decoder module or integration with the intake owner's registry.
- Per-model audio capability is not verified; only the selected/enabled OpenAI route is enforced and refusal is explained.
- No live provider test, Windows/Electron launch, real-device memory/VRAM measurement, or successful smoke run.
- The gate and CI are not fully green, so this branch is not marked complete.
