# Branch Testing Guide — How to Test Before Merging

This repo is designed so any branch is fully testable, by a person or by an AI, without the owner's machine.

## What a branch contains

- `apps/03_oddbrain/` — **the app**: Electron + React + TypeScript. Main process (files, settings, vault
  service), preload bridge, renderer (chat, artifacts, comment mode, Settings), shared logic, tests.
- `apps/01_claude-exact-pixel-clone/`, `apps/02_electron-claude-clone-v6/` — historical; not the target.
- `extension/` — MV3 starter + spec. The app now opens `127.0.0.1:8765` for it (capture side only,
  `chrome-extension://` origins); the extension itself has not been loaded or run against the app yet.
- `vault/Brain/` — the canonical Obsidian vault.
- `00_LIVING_DOCS/`, `.ai/` — living docs and machine-readable context. **Both must be updated in the branch.**

## How to test a branch

```bash
git fetch origin
git checkout <branch>
cd apps/03_oddbrain
npm install
npm test                 # 269 tests, 28 files — the whole automated suite
npm run typecheck        # strict TypeScript, no output means clean
npm run build:web        # browser preview build
npm run preview:web      # http://localhost:4174 — the interface, honestly labelled as preview-only
```

Then, with Ollama running (`ollama serve`, and a model pulled):

```bash
npm run dev              # the real desktop app
npm run smoke            # builds, opens, closes — prints "SMOKE OK ... errors=0 warnings=0"
npm run dist:win         # Windows installer -> dist/OddBrain-Setup-<version>.exe (unsigned, see its notes)
```

## What to check by hand

1. A conversation answers, streams, and **stops** when you press stop (a stopped answer keeps its partial text).
2. The conversation appears in the vault as Markdown under `02 Sources/Conversations/<provider>/<year>/`.
3. **Settings** (sidebar, bottom left) opens as the full window: rail on the left, `System`, `Appearance`,
   `Performance`, `Vault`. The search box finds settings by name.
4. `Appearance` → accent and conversation width change the app immediately and survive a reload.
5. `Performance` → the numbers under the profile are the numbers Ollama is given. Choosing a bigger profile
   **must not** produce a warning about a smaller card.
6. `Vault` → point it at a folder that exists: it is accepted, and the path shown is the one the vault reports.
   Point it at a folder that does not exist: it is refused, and nothing is created in its place.
7. **Agent access** (Settings) — switch one keyed provider off and confirm a `provider/model` request is refused
   with a sentence rather than attempted; switch `Keep conversations` off and confirm the title bar says
   `Vault off` and a new conversation is not written.
8. **Browsing Maps** (sidebar) — it shows the vault's own record, the counts follow the filters, and a visit
   says it is a visit.
9. **Artifacts** (nav) — ask a chat for something like "make me a pomodoro timer", then open Artifacts: one
   card with a real thumbnail, its date and `v1`. Rename it, and the name changes in the card. Remove it: the
   grid empties and the message says the files moved to the library's `.trash/` folder — they are still on disk.
10. **The sidebar** collapses to a 56px rail and back (button at the top of the sidebar), and its edge can be
   dragged wider; both survive a restart. A chat with artifacts has a rail on the right that can be hidden and
   brought back.
11. **No console errors or warnings anywhere.** This is a hard rule, not a nicety.

## Windows notes

- `npm install` then `npm run dev`. There is no `.bat` installer for the app yet — that is still a gap.
- If Ollama is not answering, the app says so in its header rather than pretending.
- If the model list is empty, pull a model (`ollama pull qwen2.5:3b`) and reopen Settings.

## Report back

State plainly: what worked, what looked wrong, which step produced red text, and the console output if
anything failed. Do not report a feature as working because it appears in a plan — say what you saw.
