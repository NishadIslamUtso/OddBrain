# AGENT INSTRUCTIONS — For Any AI Continuing This Repo

**You are an AI taking over this repo. Read this before doing anything.**

## 1. What This Repo Is

This is not a normal GitHub repo. It is **memory + handover + living requirements** for project
**OddBrain**: a local-first desktop assistant that drives an Obsidian vault and, one day, collects
from the browser through an extension.

- **App** — `apps/03_oddbrain/` (Electron + React + TypeScript). It is the product.
- **Vault** — `vault/Brain/`, Obsidian Markdown. The memory that outlives the app.
- **Extension** — `extension/`, MV3. Spec + starter; it cannot reach the app yet.

The owner is Utso, one person, on a 4GB-VRAM laptop. The repo is written for AIs to continue from, not to
look human-made.

## 2. Mandatory Read Order

1. `README.md` — where the app is, and **the owner's standing instructions in his own words**
1b. `00_LIVING_DOCS/JUDGE-BRIEF.md` — **judges and reviewers start there**
1c. `00_LIVING_DOCS/TODO_NEXT.md` — the live state (items 1–15-done = built)
2. `.ai/CONTEXT.json` — who the owner is, the hardware, capture policy, model constraints
3. `.ai/STATE.json` — what is built, what is verified, what is missing
4. `00_LIVING_DOCS/REQUIREMENTS_LIVING.md` — the living truth and its acceptance checklist
5. `00_LIVING_DOCS/HANDOVER_LIVING.md` — current state and next steps
6. `00_LIVING_DOCS/ARCHITECTURE_LIVING.md` — how the pieces fit

## 3. Rules You MUST Follow

### The no-fake rule (the strictest one)
Nothing goes in front of the owner that does not work. No placeholder screens, no invented data, no
"coming soon" rows, no mock replies in the real app. If something is missing, the interface says so in
plain words. Every automated check that runs the UI fails the build on **any console error or warning**.

### Living docs rule
Every change updates `00_LIVING_DOCS/TODO_NEXT.md` + `CHANGELOG.md` (the live pair since 2026-10-16),
`.ai/STATE.json`, and writes `memory/sessions/<date>-session.md`. This is the whole point of the repo.
Work lands on `v3` only; `main` is frozen until the owner orders a merge.

### The owner's standing instructions (do not relitigate)
- Build to the approved mockups; **where a mockup would be broken or dishonest, infer the intent and fix it**.
- **Settings is one full-window surface** (rail + panes), the way Windows' own settings work.
- **Never warn about memory after asking which GPU the machine has.** The chosen profile is the answer;
  measure against it, stay quiet when it fits, and offer a one-click fix when it does not.
- Settings are terse: a label and the control. No written-out descriptions under options.
- **No Vercel deployment files.** Deleted on request; do not re-add. (The Vercel design theme and the
  `vercel.json` written into exported site ZIPs are different things and stay.)
- The app name is **OddBrain**. No Claude branding in anything a person reads.
- Never take JSX/UI from other branches. Logic only.
- Open-source ready: no hardcoded names, emails, paths or model tags.
- Work on `v3`, merge into `main` when the step is finished and verified.
- One step at a time, verified, then stop. "Don't rush it and don't destroy it."
- Voice/Jarvis is parked until the owner has better hardware.

### Code rules
- Don't ask the owner to repeat requirements that are in `REQUIREMENTS_LIVING.md`.
- Do not claim a feature works because it appears in a plan. Mark things planned / in source / tested.
- TypeScript is strict; `npm run typecheck` must be clean. Tests are Vitest, run with `npm test`.
- The vault is written through `src/main/vault/` only. Nothing outside it writes to the vault.
- Keep original sources until the owner deletes them.
- Everything network-facing is granted by the owner from Settings, off by default.

## 4. Repo Structure Logic

- `.ai/` — machine-readable context (JSON) for fast injection; `ai/` is the same files, visible mirror.
- `00_LIVING_DOCS/` — `00` so it sorts first; these are the source of truth.
- `apps/03_oddbrain/` — the app; `01` and `02` are history kept for porting logic.
- `spec/`, `docs/originals/` — historical; useful for pixel history, not for current work.
- `memory/sessions/` — one log per session.

## 5. How to Build and Test

```bash
cd apps/03_oddbrain
npm install
npm test              # 28 files / 269 tests
npm run typecheck     # clean
npm run build:web     # browser preview build -> dist-web/
npm run preview:web   # http://localhost:4174 (interface only, and it says so)
npm run build         # desktop bundle
npm run smoke         # opens the real window: "SMOKE OK ... errors=0 warnings=0"
npm run dev           # the desktop app (needs Ollama on 11434)
npm run dist:win      # Windows installer (unsigned; notes in apps/03_oddbrain/RELEASE-WINDOWS.md)
```

The desktop end-to-end check (mock model server + real window over the DevTools protocol) lives outside
this repo, in the workspace's `shot-tools/`. It is what proves a conversation reaches the vault.

## 6. Current Known Gaps

- Not yet run on the owner's Windows machine. No installer.
- Cloud providers (Claude / GPT / Gemini APIs) are not implemented — they are a required feature.
- `Settings > Agent access` does not exist yet; it is built when something real can be granted.
- The extension cannot POST to the app: the vault API is in-process and no loopback port is open.
- No voice, no wake word (parked by the owner).

## 7. What To Do Next

`00_LIVING_DOCS/TODO_NEXT.md`, in priority order. The first item is the owner's own Windows test.

## 8. Handover Format

When a session ends, write `memory/sessions/YYYY-MM-DD-session.md` with what was done, what broke, what is
next, and the commit SHAs. Then update `CHANGELOG.md`, `HANDOVER_LIVING.md`, `REQUIREMENTS_LIVING.md` and
`.ai/STATE.json`.

## 9. Don'ts

- Don't make the repo look human-made; the structure is for AIs on purpose.
- Don't re-add the Vercel deployment files.
- Don't reintroduce Claude branding, in the UI or the docs.
- Don't create a second source of truth for memory: the Obsidian vault is canonical.
- Don't invent personal facts, offline events, or feelings.
- Don't merge anything the owner did not ask to be merged.
