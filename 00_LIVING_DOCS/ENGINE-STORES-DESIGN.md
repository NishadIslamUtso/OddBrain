# Engine marketplaces, inside the store — DESIGN (his go recorded 2026-10-17)

**His correction, verbatim intent:** the app's store was never meant to EXCLUDE the
engines' own marketplaces — it was meant to include them. The store page becomes
one place with several sources: OddBrain's own index (packs, already built) PLUS
the engines' own catalogs, browsable and installable through each engine's
official channel. Nothing syncs automatically; adding a source is always the
person's act.

## Sources, phase by phase

| Phase | Source | What it lists | Install channel |
|---|---|---|---|
| 1 | OddBrain store (SHIPPED) | mod packs: skills + prompts + themes, sha-pinned | own pack installer (`packs.ts`) |
| 2 | Claude Code plugin marketplaces | plugins/skills the community publishes for Claude Code | `claude plugin marketplace add <repo>` run as a permission-carded command, through the engine's own CLI — never hand-copied files |
| 3 | agy's catalog (when Google ships one for the CLI) | agy extensions | agy's own install door, same card rule |

## The rules that do not bend

1. **The engine installs its own things.** A marketplace item for Claude Code is
   installed by Claude Code's own command (shown first on a permission card:
   the exact line, the exact repo). The app never assembles plugin folders by
   hand — that is how formats drift.
2. **Browse reads, install asks.** Reading a marketplace index is a GET with a
   size/time cap (the store's own fetch rules apply). Installing is always a
   card with the exact command.
3. **One page, labelled sources.** The Store screen shows which source every
   card came from: `OddBrain` / `Claude Code marketplace` / `agy`. No blended
   results that hide provenance.
4. **No auto-sync, no auto-update.** A source is added by the person; its
   refresh is explicit. Updates go through the same cards.

## What phase 2 needs that does not exist yet

- The marketplace command surface probed on the REAL claude binary (v2.1.300+
  supports `plugin marketplace add/list`; to be verified live on the TUF A15
  run — recorded as unproven until then, same rule as agy's wire).
- A renderer source picker on the Store screen (small; the pack grid already
  renders from an index — a marketplace index renders the same way).
- Result cards carrying: name, author, source badge, install command.

## Deliberately out of scope

- A curated OddBrain account of anyone else's catalog. The app shows sources;
  it does not become one.
- Anything that runs at app boot. Marketplaces are entered, never listened to.

**Status:** design only, no build until his go. Phase 1 needs nothing (shipped).
Phase 2 is a small build after the live verification above.
