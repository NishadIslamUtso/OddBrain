# OddBrain — Project Context

**Last updated:** 2026-10-18  
**Purpose:** the single concise handoff for the active UI-port work. Existing operational brief, question, and report files remain in place as records; this file does not replace or delete them.

## Active goal

Port the selected desktop UI/UX from `origin/arena/cc83a507-oddbrain` onto the fixed working branch `arena/9a3a5c88-oddbrain`, in small, reviewable renderer-only slices. The selected reference snapshot is `df4226a` (`Refine desktop navigation, graph appearance, and isolated sample workspace`). Use `origin/clean-build` at `6835309` as a read-only corrected-build reference, not a wholesale merge target: it descends from the UI reference but also deletes operational docs and includes non-renderer changes.

## Scope and invariants

- Work only on `arena/9a3a5c88-oddbrain`; do not switch branches or merge the UI-reference branch wholesale.
- Preserve tracked project source and history. Do not wipe, rename, or recreate the repository.
- Port renderer presentation and UI-only state as needed. Keep backend, main/preload contracts, security, existing operational behavior, and the already-landed AV work intact. Review any shared renderer file carefully and make presentation-only edits around existing behavior.
- Do not add a second media-intake door or move decoder ownership. The AV decoder boundary remains `media.ts`, the AV portions of `attachments.ts`, and `videoFrames.ts`; the shared door/type belongs to `arena/6d6aabbf` per Ruling #4 in `ODD-BRAIN-BRIEF.md`.
- Preserve truthful media disclosure and current caps: audio 6 MiB / 90 seconds; video up to four sampled MP4/WebM frames, 100 MiB / 10 minutes, at most 1280×720 / 2 MiB prepared output; image source up to 8192 px / 24 MP and prepared output up to 2048 px / 2 MiB. Prepared payload bytes are not RAM/VRAM estimates.
- Keep the interface consistent with the chosen reference and current product contracts. Do not claim browser preview, local model, engine, or vault capabilities that are not actually present.
- Avoid additional user prompts unless a material ambiguity blocks safe progress; the renderer-only/preserve-backend scope and the context-file choice are already settled.

## UI reference

- Read-only remote ref: `origin/arena/cc83a507-oddbrain` at `df4226a`.
- Use the selected UI reference for its shell, navigation, appearance/look system, chat and settings presentation, and graph appearance where dependencies allow.
- `origin/clean-build` (`6835309`) is a descendant of that UI reference and a build comparison. Do not apply its broad doc deletions or merge it wholesale. The reviewed non-renderer app delta includes a Windows PDF.js font-data path correction and Node-20 Promise compatibility configuration; keep those outside this renderer-only slice unless scope is explicitly broadened.
- Port in slices; do not copy unrelated main/preload, backend, media, automation, dictation, sample-runtime, or security changes just because they share a commit with UI work.

## Port sequence

1. Establish the shared desktop styling/shell foundation without changing app actions or bridge behavior.
2. Port navigation/sidebar/layout presentation and only the UI preference state needed to support it.
3. Port chat home, transcript, composer, and graph appearance in compatibility-preserving slices; retain AV handling and disclosure.
4. Port appearance/settings UI and remaining content surfaces; keep any main-process or service requests on the existing contracts.
5. For each slice: inspect the reference diff, implement narrowly, run focused tests plus typecheck/build as applicable, review the diff for backend/security/AV drift, then update this context and the operational report with actual results.

## Workspace and handoff

- Fixed checkout: `/home/user/OddBrain` on `arena/9a3a5c88-oddbrain`.
- Before this UI port, HEAD was `3bfba4e`; the AV disclosure worktree was clean.
- GitHub Actions run `39128942052` succeeded for `3bfba4e`. A prior local Electron install/smoke attempt failed before launch with `TypeError: fetch failed`; do not report that local smoke as passing.
- Relevant records: `ODD-BRAIN-BRIEF.md` (ownership ruling), `QUESTIONS-TO-ORCHESTRATOR.md` (answered Q1), and `REPORT-TO-ORCHESTRATOR.md` (implementation/check history). Retain these files; add only this one new authoritative context handoff.
- Current renderer target: `apps/03_oddbrain/src/renderer/src/`. Review sensitive/shared files such as `App.tsx`, `Composer.tsx`, and `main.tsx` by hunk so only UI changes land.

## Current progress

**Renderer shell/navigation slice:** committed as `a56a486` on top of `3bfba4e`; documentation follow-up is `cfe79e9`. The slice adds the shared desktop shell styling, horizontal navigation, approval counts, and collapsed-sidebar destinations while preserving the existing send, bridge, and AV contracts. No main-process, preload, shared backend, security, AV decoder, dependency, or lockfile changes were made.

**Build-warning and initial-load follow-up (current uncommitted work):**

- Moved CSS Highlight API rules from `globals.css` to `lib/findHighlightStyles.ts`, injected before React renders, and updated tests to protect both highlight styling and the optimizer-safe CSS source.
- Lazy-loaded route views, conditional overlays, and `EnginePanel` behind React `Suspense` fallbacks. Motion SVGs now load as per-scene async chunks with caching and in-flight request sharing; motion timing is gated on the asset being ready.
- The corrected-build reference `origin/clean-build` at `6835309` was reviewed read-only. Its PDF.js Windows font-data path change is outside the renderer-only scope and was not imported. Its documentation deletions were not copied; `PROJECT-CONTEXT.md` remains the one authoritative context file while operational docs are retained.
- Latest `npm run build:web`: **no CSS Highlight optimizer warnings and no >500 kB chunk advisory**. The web entry JS is **477.36 kB (146.42 kB gzip)**; the PDF chunk is 455.17 kB. Scene assets are emitted separately. `npm test` passed **106 files / 756 tests**; `npm run typecheck`, `npm run build`, `npm run build:web`, and `git diff --check` all passed. Vitest still prints its unrelated Vite CJS Node API deprecation notice.
- Preview remains on port 5174. Local Electron smoke has not been rerun; the earlier sandbox Electron download failure remains recorded above. CI run `39133252677` passed Linux and Windows for `cfe79e9`, but does not cover this current uncommitted follow-up.

**Next:** visually recheck the live preview, review/commit this build-cleanup slice on the fixed branch, then continue appearance/look preferences and selectable shell layouts. Keep chat/home/composer and graph ports renderer-only and behavior-compatible.
