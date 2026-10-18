# Step 1 — the Artifacts screen (mockup 03), the plan before the code

**Why this step first:** the app already *makes* artifacts and shows nothing of it. They exist only inside
the conversation that produced them, there is no record after that conversation scrolls away, and nothing on
disk. Today's screen (step 2) has a tile that says "artifacts made today" — that number has to have a source
before it can be honest. So the library comes first.

---

## 1. What mockup 03 actually asks for

| Element | In the mockup |
|---|---|
| Nav rail | six items: Chat · Code · Projects · **Artifacts** · Vault · Today |
| Header | "Artifacts" + "Save, browse, and iterate on your creations." + **Import** (top right) |
| Grid | cards, 3 across; each a **live thumbnail** of the creation, its title, its date, and a `…` menu; the selected card gets a violet ring and a check |
| Right panel | the selected artifact, larger, with **Open** and **Export** at the top |
| Version chips | `v3 v2 v1` under the preview |
| **Tweaks** | sliders bound to the artifact's own design tokens (Accent 78, Radius 16) — live |

## 2. What already exists (verified in the code, not assumed)

- `Artifact` with **append-only `versions[]`** (`state/artifactEdits.ts`) — one bad rewrite can never destroy a
  document, and "restore v1" is itself a new version. Keep this exactly as it is.
- Extraction from replies, the streaming sweep, `buildPreviewHtml` (sandboxed preview), element-pick comment
  mode, ZIP export, and `withDesignTokens(source, tokens)` — the token injection the Tweaks panel needs
  **already exists**; only the sliders and the storage are missing.
- The right rail (`ArtifactsRail.tsx`) lists this conversation's artifacts and jumps to them in the transcript.
  That stays as it is; it is not the library.
- **Missing:** any persistence, any record of an artifact outside its chat, any library, any thumbnail, any
  version control outside a conversation, Tweaks, Import, and the nav rail.

## 3. Decisions (each one has a reason, and each can be argued with)

1. **Artifacts live in `<userData>/artifacts/`**, not in your vault. `index.json` (atomic tmp+rename, like
   settings) plus `items/<id>/v1.html`, `v2.html`, … The vault is your curated Obsidian brain; the app does not
   scatter its own working files through it without being asked. The artifact's *content* already reaches the
   vault inside the conversation Markdown, so nothing is lost by this. A "Save to vault" action can come later
   as an explicit click.
2. **Thumbnails are static, not live scripts.** A card renders the artifact in a script-less sandbox at ~0.28
   scale. On the TUF A15 that is the difference between a library that opens instantly and six Chromium
   documents executing at once — and a script-less thumbnail literally cannot phone home. Full interactivity is
   one click away in the right-hand preview (scripted sandbox, the same one chat already uses).
3. **The nav grows one screen at a time.** This step the rail has **Chat** and **Artifacts** only. Code,
   Projects, Vault and Today appear in the steps that build them. Four greyed-out items that do nothing would
   be exactly the dishonesty that got us here.
4. **"Open" = go to the artifact where it lives** (its conversation, in place) — that is the only meaning
   "open" can honestly carry today. **"Export" = the ZIP folder export that already works**, plus "Save a copy"
   of the current version as a file.
5. **Version chips preview that version**; **Restore appends it back** (append-only — never a truncation).
6. **Old artifacts get adopted, silently but accounted for.** The first time the screen opens, artifacts
   already sitting in saved chats are written into the library once, and a one-line footer says how many were
   adopted. Nothing is modified in the conversations, and nothing is asked.
7. **The sidebar search filters whatever view is showing** — artifacts on the Artifacts screen, chats on
   Chat — which is what a single search box in a sidebar should do.
8. **No dead buttons.** Import and Tweaks are real work, so they are step 1b below, not drawn-in-advance
   controls in this landing.

## 4. This step, file by file

**New — main process**
- `src/main/artifacts/store.ts` — the disk format and every operation: `list`, `read(id, version?)`, `save`,
  `rename`, `duplicate`, `remove`, `adopt`. Append-only versions; a torn/corrupt `index.json` is reported and
  rebuilt from the folders rather than crashing; nothing is ever half-written (tmp+rename).
- `src/main/artifacts/ipc.ts` — the preload channels (`artifacts:list|read|save|rename|duplicate|remove`),
  registered in `main/index.ts` next to `settings:*`.

**New — renderer**
- `components/ArtifactsView.tsx` — the screen: header, grid, right panel, version chips, empty states
  (no artifacts / nothing matches the search), one-line footers that say the true thing.
- `components/ArtifactThumb.tsx` — the static scaled thumbnail, mounted lazily via `IntersectionObserver`,
  capped at 60 cards with "show more" (a 4 GB machine should never hang because someone made 300 artifacts).
- `components/AppNav.tsx` — the rail, built to grow to six; two live items this step.
- `state/artifactLibrary.ts` — list/selection/filter state and refresh-after-mutation, in one place.

**Changed**
- `Sidebar.tsx` (mount the nav; search filters the active view), `App.tsx` (a `view` state: `chat` |
  `artifacts`), `useChat.ts` (when a reply finishes, its artifacts are saved to the library — the same moment
  the conversation is saved to the vault), `preload/index.ts` + `platform/bridge.ts` (the bridge, and the
  browser preview's honest "the library lives in the desktop app" answer), `types.ts` (`ArtifactRecord`).

**Tests** — `tests/artifacts-store.test.ts`: save/list, version append and restore-append, rename,
duplicate, delete-removes-everything, adopt-does-not-duplicate, corrupt index tolerated, missing item
reported, path traversal refused (`../` in an id), and an empty library as an empty library.

**Checker** — `shot-tools/check-artifacts.cjs`: mock Ollama answers with a real HTML artifact → the card
appears in chat → the library shows it with a real thumbnail → version chips → restore appends → rename →
delete → empty state → **console clean**. Screenshots 93/94.

**Evidence required before it lands:** the 255 existing tests plus the new ones green, typecheck clean, both
builds clean, smoke `errors=0 warnings=0`, and **all six existing desktop checkers still green** on the same
build — then commit, merge to main, push, verify, report. Docs (CHANGELOG, TODO_NEXT, HANDOVER, REQUIREMENTS,
STATE ×2, README, BUILD-TODO) in the same commit.

## 5. Step 1b — stated now so it cannot quietly vanish

- **Import** (the button in the mockup) — file dialog → `.html` / `.svg` into the library.
- **Tweaks** — the sliders from the mockup, bound to the artifact's design tokens through the
  `withDesignTokens` machinery that already exists; **saved as a new version**, never a silent mutation.

1b rides in the same screen, after the screen is proven — it is deferred by ordering, not dropped.

## 6. What I am not doing

- Not touching the append-only version rules, the comment-mode rewrite, or the ZIP export — they work.
- Not adding nav entries for screens that do not exist.
- Not writing into the vault without an explicit click.

---

**Say go and I build it.**
