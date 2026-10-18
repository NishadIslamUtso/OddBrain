# OddBrain

A desktop app that drives coding-agent CLIs — Claude Code and Google's agy —
through their own stream-json protocols, and shows their work as reviewable,
undoable steps inside a local Obsidian-style vault. Local-first: no model,
no cloud service, no telemetry ships with it. Free local brains come from a
staged Ollama.

**Status: built, tested, never used by a human yet.** The honest state of
every claim lives in [`00_LIVING_DOCS/JUDGE-BRIEF.md`](00_LIVING_DOCS/JUDGE-BRIEF.md).
Read that before trusting anything else in this repository, including the
changelog, which records development in a promotional voice.

## What works

- Engines: claude-code (full wire), agy (wire implemented against the real
  binary; a signed-in turn has not been driven yet), headless Ollama as the
  free fallback. Engines are detected on the machine, not invented.
- Permission cards: every file-touching step asks ("Full speed" is the one
  gear that turns the cards off, and it says so). Deny reaches the engine as a
  real deny. Checkpoints are taken before an Allow is forwarded — and if a
  checkpoint cannot be taken, the change is denied, not allowed blind. Every
  change is restorable, including files the engine created from nothing.
- Watch mode, recipes, split steps, battles, compaction, turn journal, auto
  memory, artifact previews with pop-out and PDF export, find-in-conversation,
  a quick-ask window on a global hotkey — all riding the one send path.
- The OddBrain motion kit: 77 animations keyed to real engine states, all
  pausable (Calm/Still, OS reduced-motion), never blocking interaction.

## Verify

```bash
git clone https://github.com/NishadIslamUtso/OddBrain.git
cd OddBrain/apps/03_oddbrain
npm ci && npx vitest run      # 99 files / 723 tests
npx tsc --noEmit && npm run build
```

CI runs the same on every push.

## Not done yet

- The owner's first real, signed-in session (Claude Code and agy).
- A verified Windows install and acceptance run.
- Screenshots of real model conversations (the gallery mostly shows a clearly
  labeled test stand-in engine).

## Layout

```
apps/03_oddbrain/    the app (src/main, src/preload, src/renderer, src/shared, tests)
00_LIVING_DOCS/         judge brief, changelog, receipts; archive/ holds old planning docs
```

OddBrain's own code is Apache-2.0 (see `LICENSE`). Engine CLIs are the user's
installs; no Anthropic or Google assets are bundled.
