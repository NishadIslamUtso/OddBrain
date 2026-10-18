# OddBrain

A desktop app that drives coding-agent CLIs — Claude Code and Google's agy —
through their own stream-json protocols, and shows their work as reviewable,
undoable steps inside a local Obsidian-style vault. Local-first: no model,
no cloud service, no telemetry ships with it. Free local brains come from the
Ollama already installed on the machine — the app starts it, and stops only a
runtime it started itself.

**Status: built, tested, never used by a human yet.** The honest state of
every claim lives in [`00_LIVING_DOCS/JUDGE-BRIEF.md`](00_LIVING_DOCS/JUDGE-BRIEF.md).
Read that before trusting anything else in this repository, including the
changelog, which records development in a promotional voice.

## What works

- Engines: claude-code (full wire), agy (wire implemented against the real
  binary; a signed-in turn has not been driven yet), headless Ollama as the
  free fallback. Engines are detected on the machine, not invented.
- **Sign-in is asked, not assumed.** Connectors runs the engine's own
  `claude auth status` and shows its answer; when the answer is "not signed
  in", one button opens the CLI's own login in a terminal and reads nothing
  back. agy has no such command, and says so instead of showing a green dot.
- **The local runtime is checked, not assumed.** Connectors asks Ollama for its
  version and says whether it is new enough (0.14+) to serve Claude Code's
  local door.
- **Tool servers are one list, written where the engines read them.** Add,
  list or remove stdio or http MCP servers; the first write into a folder keeps
  any config that was already there as `*.oddbrain-original`, and a list this
  app cannot read is reported instead of shown as empty.
- **A model name the CLI knows can be typed in**, checked against the shape a
  model name can take and passed through; empty means the engine's default.
  Claude Code's subscription models are never invented.
- **Known catalogs are one click**: `anthropics/claude-code` and
  `anthropics/skills` are the two public marketplaces that resolve.
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
npm ci && npx vitest run      # 131 files / 893 tests
npx tsc --noEmit && npm run build
```

CI runs the same on every push, on Linux and Windows, plus the browser-preview
build and a five-minute `electron . --smoke` on Windows.

### Proven against the real CLI

Run on 2026-10-18 against Claude Code **2.1.302** in a throwaway `HOME`, with
the exact argument vectors the app builds:

| Command | Engine's answer |
|---|---|
| `claude auth status` | `{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}` (on **stderr**) |
| `claude plugin marketplace add anthropics/claude-code --json` | `{"outcome":"ok","marketplace":"claude-code-plugins"}` |
| `claude plugin marketplace list --json` | `[{"name":"claude-code-plugins","source":"github","repo":"anthropics/claude-code"}]` |
| `claude plugin install code-review --marketplace anthropics/claude-code --scope user --json` | `{"outcome":"ok","plugin":"code-review@claude-code-plugins"}` |
| `claude plugin disable` / `enable` / `update` `… --scope user --json` | `"outcome":"ok"` each |
| `claude plugin uninstall … --scope user --keep-data --json` | `{"outcome":"ok","keptData":true}` |

That is the whole store path — find a catalog, add it, install, disable,
update, remove — exercised end to end, not only in a test. A plugin whose
install runs a marketplace-declared command still refuses without `-y`; the app
never passes it.

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
