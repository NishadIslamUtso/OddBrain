# OddBrain — Project Context

**Last updated:** 2026-10-18  
**Purpose:** the single concise handoff for the active UI-port work. Existing operational brief, question, and report files remain in place as records; this file does not replace or delete them.

## Active goal

Port the selected desktop UI/UX from `origin/arena/cc83a507-oddbrain` onto the fixed working branch `arena/9a3a5c88-oddbrain`, in small, reviewable renderer-only slices. The selected reference snapshot is `df4226a` (`Refine desktop navigation, graph appearance, and isolated sample workspace`). The UI branch is a design/code reference, **not** a merge target: its 174-file diff also changes main/preload, media, automation, dictation, and other runtime behavior.

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
- Use the reference for its shell, navigation, appearance/look system, chat and settings presentation, and graph appearance where dependencies allow.
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

**First renderer shell/navigation slice ported** from the selected reference on top of `3bfba4e`:

- Added `apps/03_oddbrain/src/renderer/src/styles/desktop.css` and imported it in the renderer entry point.
- Added the shared shell/content/title-bar/sidebar/chat/composer presentation hooks in `App.tsx`, `TitleBar.tsx`, `Sidebar.tsx`, `ChatView.tsx`, and `Composer.tsx`. The App and Composer edits are wrapper/class-only; the `App.addFiles` path, send path, AV handling/disclosure, and bridge behavior were not changed.
- Ported the reference navigation API: horizontal-tab styling and a pending-approval count. The collapsed sidebar now keeps section destinations reachable. Added `tests/app-nav.test.ts` for the count/horizontal nav presentation.
- No main-process, preload, shared backend, security, AV decoder, dependency, or lockfile paths were changed.

**Verification of this worktree:** `npm test` passed **105 files / 755 tests**; `npm run build` passed (including TypeScript); `npm run build:web` passed. Both builds report the existing CSS optimizer warnings for `::highlight(ob-find)` and `::highlight(ob-find-current)`; the web build also reports its existing >500 kB chunk advisory. The browser UI preview is running on port 5174. This UI slice has not yet been pushed, so it has no CI result yet. Local Electron smoke was not re-run; the earlier Electron install failure is recorded above.

**Next:** port appearance/look preferences and selectable shell layouts; then update chat/home/composer and graph presentation in compatible slices. Keep this section current with exact checks, any new CI run, and the branch HEAD after the next milestone.
