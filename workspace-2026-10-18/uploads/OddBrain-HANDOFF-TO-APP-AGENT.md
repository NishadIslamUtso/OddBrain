# OddBrain concept → `AI ASSistant` app · handoff brief for the building agent

**Audience:** the agent (or developer) implementing the desktop app.
**Purpose:** carry every design decision from the concept work into the real app, with the numbers already measured, so nothing has to be re-guessed.
**Status of the concept:** a design brief and a measuring instrument. It is **not** the app, not a code base to port, and not proof that any native feature works.

Owner: Utso (`nishadislamutso@gmail.com`) · machine: ASUS TUF A15, Ryzen 7, 8 GB RAM, 4 GB VRAM RTX 3050, Windows 11, Asia/Dhaka.

---

## 0. What you will be given, and what each thing is for

| Artefact | What it is | What to do with it |
|---|---|---|
| **This brief** | Decisions, measurements, rules, acceptance checks | Follow it. Where it disagrees with your own reading of the repos, re-measure and say so explicitly. |
| **`OddBrain.html`** (1,667,979 bytes, SHA256 `7e00e200734b3de121ef45bd3d1d9ba00630e2e205f4730f6ca5157b1962a556`) | One self-contained offline concept: 8 interface structures, 9 palettes, 4 interface styles, 4 motion modes, 77 embedded SVGs, 14 settings sections, 184 wired actions. No external requests. | Open it, click through it, copy **behaviour and numbers**, not markup. It is the reference for *what screens should feel like and how big things should be*. |
| **Motion kit 3.0.1 HTMLs / gallery** | The 77 original SVGs (76 scenes + `loader-eye-roll`), 304 status words, role assignments, animation sequences | Extract the SVGs into the app as **exact** files. Rules in §8. |
| **`claudereverse` clone** (`qa/claude-scale.json` records the extraction) | Owner's public recovery of the Claude Desktop 2.42304.0 Windows payload — measured **CSS tokens and shell markup only** | Read **measurements** only. No fonts, icons, assets, code or branding. See §3.5. |

Anything not in these files is not authority. The owner's own approved mockups inside the app repository remain the design authority for the app itself.

---

## 1. What the owner asked for, in his own terms

Verbatim constraints that shaped every decision below:

1. *"check v3 not main"* — the app's **`v3` branch** is the source of truth for current screens and behaviour.
2. *"the entire thing looked little too cluttery. and childish, i need a little bit more mature"*.
3. *"meet the owners needs"* — judged against the owner's own living docs, not against taste.
4. *"the header fills everything too much"*.
5. *"user likes the uiux of claude, specially it's size of things"*.
6. He likes the **concepts** (the eight structural layouts) and wants them kept.

Rejected earlier and not to be revisited: answering "what should this look like?" with more palettes or recolours of one layout. Structure (nav model, columns, content width, organisation) is a real axis; paint is a separate one.

The owner's own rules, from his repo: **nothing is built without his explicit yes**; ideas land only after research *and* talking to him; every feature must be proven by a test; numbers are never invented; the engine trio is fixed (`claude-code`, `Ollama`, `agy`); engine-native first, app-built fallback second.

---

## 2. Source of truth and provenance (re-verify before citing)

| Reference | Pin used | Notes |
|---|---|---|
| App repo `AI-ASSistant`, branch `v3` | **`3fb694534c637e95320550d20ec7e10a94346ae9`** (app version **0.9.0**) | 6 commits past `e648dc0…` used earlier. Adds: Memory pane, turn journal, extended thinking, copy/edit of turns, context totals, second-pass reviewer, auto-keep, `00_LIVING_DOCS/`. |
| Owner's recovery collection `claudereverse` | `ed441917058eb0adabd4924aa7a6aa61867a5fcd` | Claude Desktop Windows **2.42304.0** payload. Measured file: `compiled-vite/renderer/main_window/assets/MainWindowPage-DTxMhyWF.css` (251,089 bytes; 2,383 custom properties: 1,036 static + Tailwind runtime). |
| Motion kit | **3.0.1** — 76 scenes + loader, 304 status words, 77 SVG files | The `forge` hammer orientation was fixed in 3.0.1; do not reuse older assets. |

**The clone was never edited, committed or pushed to.** Treat every repository as read-only review data. Re-run `git ls-remote` before quoting a commit in a report to the owner.

---

## 3. Non-negotiable constraints

1. **Honesty.** No real model, no real command execution, no real file access, no browser control may be *claimed*. In the app, features that do exist are named plainly; features that do not exist are named in one muted line — never listed in the nav as if they worked.
2. **Offline by default.** The shipped app must not depend on CDNs, external fonts or remote assets. (The concept enforces this with a runtime CSP and a zero-request test.)
3. **Numbers are countable.** Any figure shown to the owner must be derivable from records on screen (e.g. "1 of 8,192 tokens in context" counts the visible transcript; "3 files · 2 lines" counts the rows rendered). No estimates, no invented percentages.
4. **State is portable and visible.** Preferences in browser/electron storage with **hash-suffixed keys**; an exported HTML snapshot seeds its own namespace then **stored-first** loading wins; embedded snapshots must never silently override later saves. File checkpoints stay **separate** from artifact version history.
5. **Reduced motion is respected without changing exported bytes.** Preview-level stillness only; downloads stay byte-exact.
6. **Attribution boundary (Claude reference).** Claude Desktop is Anthropic's. The recovery collection is the owner's own public work. Use **only measurements** — sizes, radii, spacing, type scale. Do **not** ship Anthropic fonts (`AnthropicSans*`, `AnthropicSerif*`), icons, copy, logos or code from it, and do not claim the app is Claude or built by Anthropic.

---

## 4. The two independent axes — keep them independent

### 4.1 Structure (what the user liked — keep all eight)

| Structure | Navigation | Columns | Content width | Build note |
|---|---|---|---|---|
| Classic sidebar | Six-item sidebar | sidebar · content | comfortable | mirrors the repo's own nav: Chat, Artifacts, Today, Projects, Vault, Brain |
| Top bar | horizontal section strip, no sidebar | one column | very wide | good for wide monitors |
| Rail + list | 62px icon rail + list column | rail · list · content | wide | rail collapse must **remove** the brand row, not leave a 48px empty row |
| Command first | no chrome; one command bar, ⌘K / K | centred 760px | narrow | filters the real command index; Enter opens the best match |
| List + detail | top strip + list pane | list · detail | wide | selecting a row opens that item |
| Bento | top strip + live tile board | tile grid | very wide | Today becomes working tiles |
| Console | prompt + stream + status | single stream | full width, mono | typing a section name navigates; `clear` / `help` work; anything else is refused with "nothing was executed" |
| Floating window | window tabs + inner rail over a desktop | window + rail | medium | |

Responsive rules, adopted because they were tested: three-column structures drop their **list column at ≤900px**; every structure falls back to the **drawer shell at ≤730px**.

### 4.2 Look & feel (secondary controls — never the answer to "what do I want")

- **9 palettes:** Neutral (default), Paper & Plum, Midnight Ink, Sage Notes, Peach Fuzz, Blue Hour, Lemon Drop, Rose After Dark, Quiet Graphite.
- **4 interface styles:** Editorial, Soft studio, Ink & paper, Glass studio.
- **4 motion modes:** Calm, Balanced, Playful, Still (plus speed and pause).
- Each look carries a sensible default structure; the structure can then be overridden independently. A "look" is a **design brief applied to existing tokens**, not a shipped theme system.

---

## 5. The size of things — measured, then applied

### 5.1 Claude Desktop's real scale (from the shipped CSS, `data-density=comfortable`)

| Token group | Values |
|---|---|
| Title bar | **48px** drag strip; ground `#fcfcfb` light / `#151515` dark; hairline `rgba(11,11,11,.1)` drawn at **0.5px** |
| Control heights | base **32** · xs 24 · sm 28 · lg 40 · nested 22 / 18 / 20 / 28 |
| Icons | base **20** · xs 16 · sm 16 · lg 24 |
| Padding steps | 6 / 8 / 12 / 16 / 24 |
| Gap steps | 8 / 12 / 16 / 28 / 40 |
| Radii | base **8** · xs 6 · sm 7 · lg 10 · panel 12 · composer 14 (Tailwind base 4px) |
| Type | caption 12 · footnote 13 · code 13 · body **14** · heading 15 · title 22 · prose 16 |
| Leading | caption 17 · footnote 17 · code 19 · body 20 · heading 20 · title 28 · prose 24 |
| Small controls | switch 20 · checkbox 20 · avatars 20 / 24 / 32 / 40 |

### 5.2 What that changed in the concept (do the same in the app)

| Where | Before | After | Why it matters |
|---|---|---|---|
| Header | 85px | **48px** + hairline | +37px of content on every screen |
| Brand row | 85px | **48px** | sidebar header matches the title bar |
| Primary control | 43px | **32px** (small 26px) | density without shrinking hit targets below 26px |
| Nav row | 32px | **29px** | more items visible |
| Card radius | 17px | **10px**; controls **8px** | less toy-like |
| Body type | 13px | **13–13.5px**, leading ~1.6 | one step up for legibility |
| Page headline | 39px | **25–27px** | editorial, not poster |
| Today hero block | 276px | **229px** | first screen shows work, not a billboard |
| Stat cards | 71px | **63px** | three numbers, no decoration |
| Mascots | 210 / 145 / 43 | **158 / 104 / 28** | the character stays, the noise goes |
| Artifact thumbnails | clipped at the smaller scale | re-fitted: 96px visual, smaller poster/timer/wordmark | nothing may clip in a tile |

**Rules when applying this in the app:** clone the *steps*, not the pixel literals; keep controls ≥26px; keep one obvious 8px radius for controls and 10px for surfaces; keep body ≤14px and headings ≤16px inside panels; never introduce a second type scale for "personality".

---

## 6. Maturity pass — the rules that removed the childishness

**Do**
- Default to a quiet look: neutral paper, one muted accent, calm motion, compact spacing, editorial type. The loud options stay one click away.
- Settings rows are **a label and its control**. Nothing under the label.
- Let the mascot carry personality on **Today and empty states only**.
- Prefer statements over exclamations in microcopy: "Recent conversations", "Projects", "Start a conversation", "Search".
- State facts where a number exists: "Six sample conversations, three artifacts, nine notes."

**Don't**
- Descriptions under every settings row (return via *Appearance → Row explanations*, default **off**).
- Decorative chrome: star doodles, dotted stage backgrounds, dashed rings around the mascot, stat foot-lines, vibe-name billboards, duplicated privacy lines.
- Exclamation-led headings, "little/odd/cute" in headings, or mascot motion on work surfaces.
- A second paint control in the header (one "Look & feel" entry plus an icon for the studio is enough).

**Exception that must stay:** five honesty rows keep their explanatory line even with explanations off — `OddBrain`, `Engine & models`, `Network`, `Files`, `Your choices`. A misread there would be a false claim, not a style choice.

**Calm is not frozen.** Calm **slows** the hero and brand mascot (`--duration-scale: 1.6`); `Still` and OS reduced-motion stop everything. Never let "calm" mean "dead".

---

## 7. Surfaces from `v3` 0.9.0 that the concept adopted (build these properly)

| Surface | Where | Rule |
|---|---|---|
| **Memory** | Settings section, after Hooks, before House rules | Name the folder, list remembered files with line counts and a "last pass" stamp, offer a pass, allow deleting a file. Plain Markdown; the copy says a pass is an ordinary turn and its writes ride the same permission cards. |
| **Turn journal** | Chat header + Settings → Memory link | Per turn: time, title, engine, model, files touched, outcome, reviewer verdict. Countable only. |
| **Second-pass review** | Toggle in Appearance; per-turn "Review" action | Report-only. Must say so in the UI: it cannot approve, change or run anything. |
| **Extended thinking** | Composer chip | Explicit on/off; off by default. |
| **Auto-keep** | House rules section | "Keep the previous version of a file the moment an approval would change it." On by default. |
| **Per-turn edit** | Message actions | Loads the earlier order back into the composer; nothing is re-run. |
| **Work line** | Under the composer | engine · model · local/online · context tokens · auto-keep. Every value must be derivable on screen. |

**Nav discipline:** six sections only — Chat, Artifacts, Today, Projects, Vault, Brain. Agent access is not a nav item. Code opens from a project, not from the nav. A nav that lists every feature stops being a map of the work.

---

## 8. Motion kit usage (the SVGs you will be given)

1. Ship the **77 originals byte-exact** (76 scenes + `loader-eye-roll`). Verify with CRCs against the kit; `forge.svg` must be the 3.0.1 corrected hammer.
2. **Namespace per live instance:** SVG element IDs (`#obui-<n>`) and keyframe names get a unique prefix, or two instances on one screen will fight over one animation.
3. **Eight assignable roles** per theme look: `idle`, `thinking`, `working`, `waiting`, `done`, `searching`, `making`, `resting`. Roles map to real app states — never random.
4. **Loader:** `loader-eye-roll` is the loading state (the confused, circular, hazy-eyed roll). Use it for waiting, not for errors.
5. **Words:** 304 status words ship with the kit (e.g. "Cerebrating", "Tinkering", "Lollygagging"). Show one at a time, in the status line — they are flavour, never a substitute for a real state name.
6. **Reduced motion / Still / pause:** stop animation everywhere, including inside artifact previews, **without** modifying downloaded or exported files.
7. **Performance:** render a bounded number of animated instances at once (the concept renders 12 tiles, not 77). Pause off-screen instances.
8. **Sizes** (post-pass): brand 28 · hero 158 · chat empty 104 · note cards 62–74 · thumbnail 84–112. Never animate more than ~6 instances at once on a work screen.

---

## 9. State, storage and export rules

- Preferences live under a **hash-suffixed key**; a state written by an exported snapshot must not overwrite a newer saved state — load **stored-first**.
- **Snapshots** must escape user text safely (no early `</script>`), must not retain inert hosts, and must keep working in a sandbox that blocks storage (session-only fallback).
- **File checkpoints** are distinct from **artifact history**; restoring a checkpoint is a new version, and restoring must preserve history.
- Exports that must keep working: theme JSON, 77-SVG ZIP (CRC-verified), sample vault ZIP, plugin/concept bundle, and a self-contained HTML snapshot of current state.
- Concept exports produced by the look lab: `OddBrain-what-I-want.md` (with `## Structure I want` and `## The eight structures`) and `OddBrain-vibe-choices.json` (`structure` block). Keep these shapes if the app ever writes the same briefs.

---

## 10. Verification protocol — what "done" means here

The concept shipped green on **227 checks, 0 page errors, 0 console errors, 0 network requests**:

| Suite | Checks | Covers |
|---|---|---|
| functional | 99 | workflows, approvals, diffs, checkpoints, exports, persistence, sandboxed artifact execution |
| layout-motion | 12 | 110 view layouts + 215 dialog layouts at 320/390/768/1024/1440, motion policy, keyboard, graph |
| edge | 9 | **184 discovered control actions** all wired; snapshot escaping; preview policy leaves download bytes unchanged |
| vibes | 43 | looks library, compare, quiz, mix, exports, persistence |
| vibes-layout | 20 | all eight looks, no overflow |
| shells | 44 | the eight structures: DOM/geometry probes, reload persistence, wireframes, verdict/note, cycling, console commands, exports |

**In the app, the equivalents are:** every feature proven by a test (the repo was at 387/387 tests, `tsc` clean), no page errors, no console errors, no network requests at rest, no horizontal overflow at 320px, and a build warning-free on Windows.

Two conceptual checks worth keeping forever:
1. *Is every number on screen countable from records the user can see?*
2. *Does any wording imply a model, command, file or browser action that did not happen?*

---

## 11. Open debts the owner already knows about (do not pretend these are done)

1. Undo card, session insights, prompt library + regenerate wiring.
2. Per-hunk accept/reject in diffs.
3. "Needs you" pulse on the blocked approval.
4. Session board plus a per-turn context pane.

And the standing truth from the repo's own audit: **the owner has never run the app.** His acceptance run on the TUF A15 is the outstanding proof; the installer was deliberately left last, and `agy` is blocked on his machine. Say that plainly if asked.

---

## 12. Quick paste-able checklist for the building agent

```
[ ] v3 tip re-verified (ls-remote) before any claim
[ ] Nav = six sections; nothing unbuilt is listed as working
[ ] Settings rows: label + control, no descriptions (toggle for explanations, default off)
[ ] Five honesty rows keep their line
[ ] 48px title bar + hairline; 32px controls (26px small); 29px nav rows; 16px icons
[ ] Radius 8 controls / 10 surfaces; body 13-14px; page h1 25-27px
[ ] Mascot on Today + empty states only; Calm slows, Still/reduced stops
[ ] No decorative chrome additions
[ ] Work line, journal, memory, review, thinking, auto-keep wired to real state or labelled simulated
[ ] 77 SVGs byte-exact, namespaced per instance, 8 roles mapped, loader for waiting
[ ] Exports verified: theme JSON, SVG ZIP CRCs, vault ZIP, snapshot, briefs
[ ] Storage hash-suffix + stored-first; checkpoints separate from artifact history
[ ] All suites green; 0 errors/console/network; 320px overflow-free
[ ] Nothing from the Claude reference copied except measurements
```

---

### Appendix A — exact concept figures (for cross-checking)

`OddBrain.html` · 1,667,979 bytes · SHA256 `7e00e200734b3de121ef45bd3d1d9ba00630e2e205f4730f6ca5157b1962a556` · 77 embedded SVGs · 304 status words · 9 palettes · 4 interface styles · 4 motion modes · 8 structures · 8 looks · 14 settings sections · 184 wired actions · 268,977 characters of inline JS (syntax-checked) · 0 network requests.

Measured after the pass (1440×900): title bar 48px, brand row 48px, nav row 29px, primary control 32px, hero block 229px with a 27px headline, stat cards 63px, page h1 25px, sidebar 216px.

### Appendix B — where the measurements came from

- Claude scale: `claudereverse/repositories/desktop-release-reconstruction/compiled-vite/renderer/main_window/assets/MainWindowPage-DTxMhyWF.css`, plus `main_window/index.html` (48px drag strip, grounds, hairline) — extracted table saved at `qa/claude-scale.json`.
- App behaviour and copy: `AI-ASSistant` @ `3fb6945`, `apps/03_ai-assistant/src/renderer/src/**` and `00_LIVING_DOCS/**`.
- Motion: kit 3.0.1 manifest, status map and `svg/*.svg`.
- Concept QA evidence: `qa/oddbrain-*.json` and `qa/oddbrain-screens/*.png`.
