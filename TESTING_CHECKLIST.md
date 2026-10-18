# Testing Checklist — Before Merging Any Branch

Run it in this order; each line is a thing you can see with your own eyes.

## 1. Automated (no machine required)

- [ ] `cd apps/03_oddbrain && npm ci` completes
- [ ] `npx vitest run` → **621 tests, 78 files, all passing**
- [ ] `npx tsc --noEmit` → no output

> Every engine-era feature (battles, split, recipes, compaction, watch, review,
> checkpoints, extended thinking, the work line, the journal, auto memory) is
> receipt-verified live: `00_LIVING_DOCS/receipts/SCREENS-GALLERY.html` (g51–g64).
> This checklist stays the pre-merge core.
- [ ] `npm run build:web` → clean, writes `dist-web/`
- [ ] `npm run preview:web` → the preview opens on http://localhost:4174

## 2. The browser preview (interface only — it says so)

- [ ] Header shows `OddBrain`, a `Preview` chip, and the preview line above the composer
- [ ] Sending a message explains that models run in the desktop app (no invented answers)
- [ ] Settings opens as the full window with a rail: System, Agent access, Appearance, Models, Performance, Vault
- [ ] The search box narrows the rail, and clearing it brings everything back
- [ ] Accent + conversation width apply immediately and survive a reload
- [ ] `Vault` explains there is no folder to choose in this window
- [ ] **Zero console errors and zero warnings** (open DevTools and look)

## 3. Desktop app (Ollama running)

- [ ] `npm run smoke` → `SMOKE OK ... errors=0 warnings=0`
- [ ] `npm run dev` opens the window; header shows green `Ollama` and green `Vault`
- [ ] A question answers and streams; the stop button keeps the partial reply
- [ ] The conversation is in the vault as Markdown; `09 Activity & Undo/<year>/<month>.md` is appended
- [ ] Settings → System shows the running model and the folder conversations are kept in
- [ ] Settings → Performance: choosing `6 GB VRAM` shows `num_ctx=8192 · num_batch=512 · num_predict=2048`
      and **no warning**; the options line follows the profile
- [ ] Settings → Performance → Custom opens four real number fields (Context window, Prompt batch,
      Longest reply, Layers on the GPU) with no written-out descriptions under them
- [ ] Settings → Vault: a folder that exists is accepted and reported back by the vault itself
- [ ] Settings → Vault: a folder that does not exist is refused and nothing is created
- [ ] Settings closes with the X and with Escape, and the app is exactly as it was
- [ ] **Zero console errors and zero warnings** in the desktop window too

## 4. Artifacts (nav) and the sidebar

> Automated: `node scripts/check-artifact-library.cjs` — starts the app and the mock model, then reads
> `index.json` and the version files off disk before it trusts the screen (22 assertions, console clean).

- [ ] A chat that produces a document ("make me a pomodoro timer") puts it in the Artifacts screen
- [ ] The card shows a real thumbnail, the date, and `v1`; the footer names the folder the files are in
- [ ] Rename changes the name **in the card**; Duplicate makes a `… copy` that can be edited independently
- [ ] Remove empties the grid and the message names the `.trash` folder — the files are still on disk there
- [ ] The sidebar collapses to a rail (top button) and comes back; the edge drags wider; both survive a reload
- [ ] A chat with artifacts has a right-hand rail that can be hidden and brought back

## 5. Browsing Maps (sidebar)

- [ ] It opens over the app, lists what the vault holds (conversations, captured pages, visits, newest first)
- [ ] The kind chips carry counts, and the count in the header always matches the rows on screen
- [ ] A visit is labelled `visit` and says a visit is not reading
- [ ] Search narrows to the rows it names; `7 days` / `30 days` / `everything` change the window
- [ ] Its banner line says where the map came from — the vault, not an index

## 6. Extension and the port it posts to

- [ ] `chrome://extensions` → load unpacked → `extension/`
- [ ] The blacklist matches hosts the way `tests/blacklist-parity.test.ts` says it does
- [ ] Settings → System shows `Listening at 127.0.0.1:8765`
- [ ] **The extension itself is still a starter** — it has not been loaded or run against the app, so nothing is
      captured from a browser yet (the port and its rules are proven by `tests/extension-port.test.ts`)

## 7. The Windows installer

- [ ] `npm run dist:win` → `dist/OddBrain-Setup-<version>.exe` (~100 MB; the
      shipped build is 0.9.0, sha256 `267a7530…` — table in
      `00_LIVING_DOCS/RELEASE-WINDOWS.md`)
- [ ] SmartScreen says *unknown publisher* — expected, not a failure (`apps/03_oddbrain/RELEASE-WINDOWS.md`
      says so before it appears)
- [ ] Installing needs no admin rights; **uninstalling leaves the vault and settings in place**
- [ ] **The install itself has not been run on Windows** — it is the owner's own test

## 8. Before merging

- [ ] `00_LIVING_DOCS/REQUIREMENTS_LIVING.md`, `CHANGELOG.md`, `HANDOVER_LIVING.md` updated
- [ ] `.ai/STATE.json` updated
- [ ] `memory/sessions/<date>-session.md` written
- [ ] The commit names every file it touched (untracked additions included)
