# DECISIONS — the ledger of every "why"

> Companion to `HANDOVER.md`. The handover is the map; this is the ledger:
> every nook and cranny of the app, **why it is like that**, whose wish or
> which lesson caused it, and what guards it so it cannot quietly regress.
> Entries are grouped. When a decision came from the owner's words, his
> intent is quoted or paraphrased with the date. Update this file in the
> same landing that changes a decision — a stale ledger is a lie.

---

## A. Product laws and the lessons that wrote them

| # | Law | Why it exists (the lesson) | Guard |
|---|-----|---------------------------|-------|
| A1 | **No fake dots.** A colored dot never claims "installed/working". Words instead (`installed · 2.1.302`, `not installed`, `answering at 127.0.0.1:11434 · 3 brains`). | The owner: *"fake green dots."* The title-bar dot showed green from a process check while every turn failed; the engine picker's green dot read "this works". | `honest-defaults.test.ts` (no `entry.found ? 'bg-ok'` in the picker; title-bar dot = `turn?.state === 'running'`) |
| A2 | **No invented model names.** Default model is EMPTY = "the engine's own choice — its own login". `gemma4:cloud` is banned and migrates out of saved settings. | The owner: *"fake model names."* The app shipped a hardcoded model the machine never had, painted everywhere as if real. | `honest-defaults.test.ts` (default empty; migration; no UI file hardcodes a model name) |
| A3 | **An empty model choice forces no door.** A NAMED brain rides its baseUrl; no brain = no `ANTHROPIC_BASE_URL` at all. | The owner's machine: claude-code was forced at a dead localhost door → "the brain is not answering, retry 1/2/3" forever. The Memory-pass ECONNREFUSED was this same door. | `engine.test.ts`, `engine-process.test.ts` (launch env pins) |
| A4 | **Retries must name the fix.** From the third `api_retry`, the status says: run `claude` once in a terminal and sign in / check connection — still trying. | Counting retries with nothing actionable left the owner staring at "retry 3" with no next step. | `engine.test.ts` (wire pin), `stream.ts` |
| A5 | **A crashed pane says so in words.** Error boundary at the app root and around every settings row: the reason + stack head + Try again. | The owner: *"Connectors / store / extension pages = blank screen."* React's default unmount turned crashes into silent blanks. | `ErrorBoundary.tsx` wraps `row.body` in `SettingsView` and `<App/>` in `main.tsx` |
| A6 | **Themes carry the ENTIRE style — "not your skeleton".** Pack themes may ship a full stylesheet (`css`), applied after the app's so it wins; a css-only theme is valid; a design system retires the pack style and vice versa (one look at a time). | The owner, verbatim: *"i said to take the entire style, you kept your skeleton."* The first implementation allowed only the app's five switches and REJECTED everything else. | `pack-css.test.ts`, `design-systems*.test.ts` (shipped themes refuse to exist without a stylesheet) |
| A7 | **Everything must work on HIS machine.** CI-green ≠ world-clean; the TUF A15 is the acceptance lab. | Seven real-machine breakages (spaces username ×3, PATH snapshot, blank pages, white paint, scroll) that CI never saw. | The acceptance checklist lives in `HANDOVER.md` §8.4 |
| A8 | **Claims must survive hostile judges.** Tests assert real shapes and real behavior, not flattering stubs. | The 13-round systemic failure: tests stubbed the environment instead of the platform and passed while the app broke. | Test-writing rules (§K) |

---

## B. Deliberately NOT built (and why)

| Not built | Why |
|---|---|
| **Buddy companion / computer-use** | From the original scope triage: not taken (would promise presence the app doesn't have). |
| **Account-gated integrations** | Local-first law; accounts are the owner's own, entered at the engines themselves. |
| **agy-via-claude-code translator** | Dropped by the owner; agy's limitation is disclosed in the UI instead — accepted gap, owner's call. |
| **The in-app Ollama downloader as the primary route** | The owner: *"leave the downloader things altogether."* The Connectors card recommends `winget install Ollama.Ollama`; the app finds ANY Ollama at `127.0.0.1:11434` automatically. The staged copy stays secondary in the Engine bay. The measured fix (§H6) is written down for the day he wants it. |
| **Auto-updater** | No signing certificate exists; he installs CI artifacts explicitly. Silent updates would contradict "nothing machine-wide without a permission". |
| **Marketplace auto-sync / auto-update** | Approved design: "a source is added by the person; its refresh is explicit. Updates go through the same cards." |
| **Telemetry** | Local-first law. Nothing ships, nothing phones home; the interface must work with no connection. |
| **Automatic rulebook/memory writes on a timer** | The owner presses the button (memory pass, rulebook refresh). The vault's truth is his act, not a background daemon's. |
| **Code signing** | No certificate. Stated honestly everywhere: Windows will show "unknown publisher" until then. |

---

## C. Security walls — each one behind a real attack or failure

| Wall | The why (attack/lesson) | Guard |
|---|---|---|
| **Parsed-origin IPC guard** (not regex) | A judge's smuggle: `http://127.0.0.1:PORT@attacker.example/` passed the old start-anchored prefix regex. The door now parses components; user-info always fails; `file:` must be the app's own exact URL. Seven adversarial tests pin the paths an attacker would walk. | `ipcGuard` tests (mutant-killing: revert to prefix → userinfo case fails) |
| **Navigation lock** | A link must never walk the window (and its preload bridge) elsewhere; external links open the real browser. | `lockNavigation` + tests |
| **Extension pairing** | A random website must not talk to the app. Token = `randomBytes(24).hex` in `userData/extension-pair.json`, sent as `x-oddbrain-pair`; 401 without it — and the capture is DROPPED, never queued (page contents must not sit in browser storage without consent). | `extension-pairing.test.ts`, `blacklist-pairing.test.ts` |
| **Outbox semantics** | 200 → delivered (leaves storage); 401 → drop with metadata-only record (never re-park); 403 → same; 5xx/dead network → keep for next flush; a throw keeps too; no double-parking. The old flush deleted on ANY non-throw — a judge caught the page content silently destroyed on a 500. | `outbox.test.ts` (six cases, real shapes) |
| **Manifest loopback grant** | The MV3 service worker had no permission for `http://127.0.0.1/*`, so every relay failed — the judges' first finding. The manifest grants exactly the loopback host. | extension manifest + relay tests |
| **Classic `sendResponse` listener** | Promise-returning `onMessage` is only honored from ~Chromium 148 with rollout caveats; the classic return-true + sendResponse pattern works everywhere. | background.js + messaging tests |
| **Checkpoints before Allow** | An unawaited snapshot could lose the race against the engine's write. The keep completes BEFORE the allow leaves; a failed keep DENIES instead of allowing blind; a deny never needs a keep. | `claudeCode.ts answer()`; `engine-media.test.ts` (deterministic waits, not sleeps) |
| **Checkpoint index race** | Read-modify-write runs as one queued unit per folder — 30 concurrent checkpoints left 1 record before; now 30. | `checkpoints` tests |
| **Zip bomb walls** | Central-directory declarations are checked up front (count, per-file, total) AND the aggregate is measured on actually-inflated bytes (a forged zero-size declaration once smuggled real bytes past the cap — a judge's 1,800-under-100 repro). Path traversal (`..`, drive letters, leading `/`) refused. Pack limits stay tight; runtime limits exist for the official Ollama zip (§H6). | `downloads.ts unzipArchive` + judge repro tests |
| **Download pins** | Official URL pinned, every redirect hop allowlisted by parsed host (claude.ai → downloads.claude.ai; ollama.com → github → objects/release-assets.githubusercontent.com — verified live), size caps enforced mid-stream. Byte-exact URL pins once refused the publishers' own real redirects — fixed to host-allowlists. | `engineDownloads.ts` + chain tests |
| **Spawn safety** | Command arrays, never shell strings — EXCEPT Windows engine spawns, which must shell (npm `.cmd` shims), and therefore must QUOTE paths with spaces (`shellSafeCommand`). The one non-fixed argument (model) is validated by `MODEL_PATTERN = ^[\w.:@/-]+$` before it can reach a spawn. | `command-line.test.ts`, `engine-detect-paths.test.ts` (source-pins every spawn/probe site) |
| **Electron fuses** | Packaged binary: no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`. | `scripts/apply-fuses.cjs`, CI installer run |
| **CSP** | No remote scripts, no remote fonts, no eval; `self` + inline styles only; `connect-src` limited to self + loopback ws/http. The app must work with no connection. | `src/renderer/index.html` |
| **Loopback-http interface** | The renderer is served over `http://127.0.0.1:<port>` (never `file://`) so every fetch is same-origin and the API boundary sees a real Origin. Fallback file page pinned exactly so offline mode keeps a working interface. | `index.ts createWindow` |

---

## D. The username saga — one lesson, three bugs

His Windows name is **"Nishad Islam Utso"** — spaces. Everything below exists because of it:

1. **The copied installer command broke** at `C:\Users\Nishad` (bare `join(' ')` display). → `displayCommandLine` quotes any piece with whitespace; copy + card both use it. Guard: `command-line.test.ts`.
2. **Absolute-path engine spawns would break the same way** under `cmd /c` (his own terminal proved the shape: "Processing -File 'C:\Users\Nishad' failed"). → `shellSafeCommand` wraps every engine spawn and every detection probe; source-pinned. Guard: `engine-detect-paths.test.ts`.
3. **First run "couldn't detect" his name** — the field started empty and he typed `""` and moved on. → The `app:whoami` door (`userInfo()` → `USERNAME` env fallback) prefills the name, spaces carried untouched. Guard: handover checklist step.

Also: engine names are resolved to **absolute binaries** (`resolveEngineCommand`) before spawning — bare names only work through a fresh PATH.

---

## E. Engine detection — the PATH saga

- **The snapshot bug:** the machine PATH was resolved once at boot and handed out forever; engines installed later stayed invisible. Now `enginePathSync` kicks a background registry re-read when the snapshot is stale (>5 min), so the next detection sees the machine as it is. Guard: `enginePath` tests.
- **The bare-name bug:** detection and spawns used `agy`/`claude` by name — `"'agy' is not recognized as an internal or external command"` is the owner's verbatim error. Detection now probes known absolute spots and reports WHERE it found the binary (`found at …`, path on hover): npm dir (`claude.cmd`), `.local\bin`, `Programs`, and — first of all — **the app's own staging ground** `…/oddbrain/engines/<id>/app(\<binary>.exe|.cmd|<binary>)` (he staged engines there by hand and the probe ignored that folder). Spawns prefer the same resolved absolute binary. Guards: `engine-detect-paths.test.ts`, `staged-engines.test.ts` (counted through `join`, not literal slashes — a Linux-shaped pin once failed Windows CI).
- **Re-scan** in the bay skips the 30 s remember-cache — installed-something-just-now needs an answer NOW, not in 30 s.

---

## F. The honesty round — one commit as reference

`4fb6c15` is the canonical "we do not lie" round: fake model dead (A2), no forced door (A3), dots → words (A1), detection proof on the card face (`installed · 2.1.302`, path on hover), the engine strip made collapsible **with force-unfold while a permission waits** (Allow/Deny can never hide behind a fold; state remembered in `localStorage`), thinking **collapsed until the owner opens one — then always open everywhere** (one shared flag `thinkingOpen.ts`, live-writing blocks still unfold), and the six shipped themes given real stylesheets (A6). Everything above is pinned; `honest-defaults.test.ts` refuses regressions by name.

---

## G. Sizes and numbers — the measured truths

| Thing | Value | Why |
|---|---|---|
| Ollama Windows zip (measured 2026-10-17) | **1.47 GB** compressed, 87 entries, **1.94 GB** unpacked, biggest file **692 MB** (cublasLt64_12.dll) | Killed the 400 MB download cap → 2.5 GB (`06da1c1`); the pack-sized unpack limits (200 MB/file, 400 MB total) would STILL refuse it — the runtime limits in §H6 are the written fix. |
| Download cap `MAX_DOWNLOAD_BYTES` | 2.5 GB | A ceiling against hostile offers, not big honest ones. Refusals speak human (`humanBytes` → GB/MB). |
| Model sizes | `inference-fit.ts` sizes to 8 GB RAM / 4 GB VRAM | The TUF A15 cannot load what it cannot hold. |
| Thinking budget | `MAX_THINKING_TOKENS=31999` only when the owner picks Extended | The engine's own documented knob; the app adds nothing by itself. |
| Keep-loaded | `OLLAMA_KEEP_ALIVE=-1` (a JSON NUMBER — the bare string `"-1"` is invalid per Ollama's FAQ; `"-1m"` is the string form) | "Model stays loaded" must survive restarts without re-loading 8 GB into RAM. |
| A11y capture caps | 400/12/120 (nodes/depth/…), cuts ANNOUNCED | Structure captures must say what they cut, never silently. |
| Memory graph | 400-node cap, hand-rolled canvas force layout, resolved links only | The vault graph must stay readable and honest (resolved links only). |
| Find bar | max 6 hits listed | Noise budget in the transcript UI. |
| Installer | ~96 MB, NSIS per-user, one-click, `runAfterFinish`, locales pruned to en-US (46 MB of Chromium locales dropped), `compression: maximum`, `npmRebuild: false` (no native modules), `asar` on, uninstall KEEPS the person's data | The owner ordered ONE CLICK (2026-10-15) — the folder-choice screen was dropped for it. English-only law prunes locales. Uninstall must not eat his vault. |
| Icons | `buildResources: resources/` — NOT `build/` | Workspace snapshots exclude directories named `build/` — it silently deleted the icon TWICE. An icon is source; it lives in `resources/`. |
| Artifact | `OddBrain-Setup-<full-sha>.exe`, expires ~30 days | CI artifacts are the only canonical builds (he has no local build chain). |

---

## H. Wire facts (proven against the real binaries)

1. **claude-code**: launched `--output-format stream-json --input-format stream-json --include-partial-messages --verbose --permission-mode <manual|plan|…> --permission-prompt-tool stdio` (`--model X` ONLY when a brain is named; `--resume <id>` on relaunch). Proven against real v2.1.300: `manual` makes the CLI ask; `stdio` routes the question to the app.
2. **Deny shape**: the CLI rejects a bare deny — the deny must carry `message` (proven v2.1.300).
3. **control_request/can_use_tool** → permission card; the app answers `control_response` with `subtype:'success'` and `behavior: allow|deny{message}`.
4. **api_retry** → status line (A4). **permission_denied by the engine itself** → shown, never swallowed. **Failed tool_result** → news, not silence.
5. **stderr tail (600 chars)** surfaces on a non-zero, non-deliberate close: "engine closed with an error: …".
6. **Ollama**: tags at `/api/tags`; `:cloud` suffix / `remote_model` marks cloud brains; keep-alive env NUMBER `-1` (G). Serve process owned by the app (Start/Stop in the bay); **a runtime the owner started himself stays his** — the app never kills what it did not spawn.
7. **agy**: stdin stream-json; resume via `--conversation`; the app reads `event:'result'` as the turn's end; pictures NOT sent (the app says so in words); its model list is plan-gated and only appears once signed in; a signed-in live turn is **recorded unproven** until driven on his machine. Test stand-ins carry the marker `1.0.0-ob-shim (TEST STAND-IN…)` so a fake can never masquerade as the real wire.
8. **Claude brain routing**: a provider key rides the ENGINE's env (`ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`) — the app itself never calls the provider. Machine Anthropic credentials are stripped from the inherited env on every launch (the app never borrows his account), and **clearing a key stops the engine only if the engine was launched with THAT provider's key** (`sessionAuthProvider`).

---

## I. UI decisions — the why behind each visible thing

- **One send path.** Chat, watch, recipes, memory pass, battles, split, quick-ask — all through the same engine send, so every guarantee (cards, checkpoints, journal) holds once and holds everywhere.
- **The engine strip** (above the composer): a RECORD, not a transcript — resume carries context forward; honest phase names; token totals; queue ("In the line"); Stop/Copy/Edit/Hand off/Compact/Review buttons each with a real title explaining itself. **Collapsible** per the owner; **force-unfolds on a waiting permission**.
- **Thinking blocks**: collapsed by default; opening one opens them all (shared flag); live-writing stays open while writing. His rule, exact.
- **Title-bar dot**: green only while a turn is live (A1). The **Vault chip** tells the truth too: green only when keeping is actually ON — "a green Vault while nothing is written would be the one kind of lie this app forbids."
- **Model menu**: "the engine's own choice — its own login" first (A2), then machine-produced entries with cloud chips or GB sizes.
- **Appearance lives in window storage, not the machine settings file** — deliberately: "an accent colour is a preference about reading, not a fact about the computer," and it makes the browser preview honest too.
- **Accent ink is readability, not decoration**: every accent carries its ink chosen for ≥4.5:1 (violet deepened for white text; amber carries near-black). `accent-contrast.test.ts` computes the ratios so no hue can ship unreadable.
- **Motion kit honesty**: 76 scenes + 1 loader, 304 words, 8 roles; every scene reachable (rotation through real states); the word travels with the animation it was measured for (the kit's variant map); **a word is flavour — it never replaces the honest state name beside it**. One pause rule for every reason (Still, OS reduced-motion, off-screen, the six-instance budget, a one-shot that finished): `ob-still` stops everything; the kit's shipped scene files are never modified.
- **Quiet scrollbars, blinking caret, empty-state mascot ("Dozing")** — reading comfort is a feature; the transcript is where he lives.
- **Menu bar (File/Edit/View/Go/Help)**: every item does a real thing — New chat, Settings, Go-to-screen; no decoration.
- **Single instance**: a second launch focuses the window you already have.
- **Quick-ask window**: global hotkey, minimal box, "the same engine, the same cards" — same guarantees in a small surface.
- **First run**: steps (name prefilled from the machine — D3; engine pick with real detection; vault folder with default), animated brain greeting, finish gates into the app. The animated mascot also idles by the sidebar profile row; the sidebar carries search, new chat, nav, "No conversations yet" honesty, and the profile row into Settings.
- **Settings search** filters rows by terms and auto-opens the first matching section, so the pane never sits blank next to results; per-section **Reset** restores safe defaults.
- **Voice**: a speak button on assistant messages when the platform supports TTS — read-aloud is a small, local, honest feature.
- **Error boundary** copy speaks to a person: what broke, that the rest still works, the reason to send along, Try again (A5).

---

## J. Data decisions — the vault and its promises

- **Structure**: `Documents/ASSistant/AI-Brain` by default (or chosen), seeded with the canonical folders (`00 System … 10 People`, `90 Archive`), templates (Person, Knowledge Note, Source kinds…), and `CLAUDE.md`/`AGENTS.md` rulebooks the engines must read. Fresh checkouts boot quiet (seeds are canonical texts).
- **Sources are write-once**: conversations, browser captures, imports, laptop-file references, a11y trees — never silently edited after the fact; review is a separate, explicit act (Keep-or-Forget).
- **Conflict settle**: when structure integrations disagree, files are kept side-by-side and the OWNER settles: Keep-mine / Use-new / Both / Combine — recorded.
- **Link rules**: dead and ambiguous links checked, exact-path; templates exempt; the rulebook refresh runs only when the owner presses it.
- **Blacklist law**: never-capture paths are honored by the app, the extension, and the popup alike — one door, parity-tested.
- **Activity & Undo**: every change journaled (`09 Activity & Undo`); restore is byte-exact, including files the engine created from nothing.
- **Handoff**: a finished turn becomes a vault document any later session can continue — and is copied to the clipboard in the same action.
- **Compaction**: conversation → brief, fresh session, brief rides along — the record is kept even as the context resets.
- **Checkpoints**: queued per folder (C); the old self is kept BEFORE the allow leaves; restore works for edits AND creations.
- **Warm boot & boot order**: the warm-up runs AFTER the bridges exist (a judge caught warm-up racing registration — `boot-order.test.ts` pins the source order); warm/keep-loaded/startup flags are machine facts (`appFlags.ts`), the renderer reads them through guarded doors and says honestly when it's a demo.

---

## K. Process discipline — how this repo is run

1. **One landing = one commit**, pushed `HEAD:v3 HEAD:main` together; CI is the truth (checks ×2 + installer ×2). A red X on ONE branch with the identical commit green on the other = flake: re-run the failed jobs before suspecting the code (done via API; the junit comment bot posts failures "in its own words" on the commit).
2. **The sandbox's git index rots between turns** (reverts to an ancient commit; remotes vanish). Recovery law: back up ONLY this round's files → `git fetch origin && git reset --hard origin/v3` → re-apply → verify the status list is exactly the round's files → gate → commit. NEVER `git add -A` on a rotted tree without that reset (one near-miss shipped 612 stale files into a commit — caught before push by the missing remote, then redone cleanly).
3. **The gate runs from `apps/03_oddbrain`** (a wrong cwd once fetched a bogus `tsc@2.0.4`). `npm ci --ignore-scripts` + `node node_modules/electron/install.js` (node_modules evaporates between turns; electron's postinstall is skipped by `--ignore-scripts`).
4. **Smoke**: built app opens under xvfb; `SMOKE OK SCROLL OK … errors=0 warnings=0` — a WARNING is already a failure; the scroll chain is PROVEN on the built app (forces overflow, demands real movement — the chat-scroll bug from the real machine can never return silently).
5. **Test-writing rules**: assert against real shapes (the judge lessons); source-order pins for boot; deterministic waits, never fixed sleeps (the `engine-media` flake); platform-neutral pins (count through `join`); jsdom only where DOM is real; read the FULL runner output (a silent grep once matched nothing and looked green).
6. **Patches**: exact-literal replaces with loud failure on miss; read back after JSX edits; heredocs standalone with a final print.
7. **Counts are updated every landing** (README / JUDGE-BRIEF ×2 / CHANGELOG bullet) — a handover that drifts is a lie with better manners.
8. **Workspace hygiene**: ≤ ~128 MB snapshot budget, English-only outputs, the AI-slop rule (no filler, no promotional varnish — say what it does and stop).
9. **Sandbox downloads**: `/tmp` is ~1 GB tmpfs — big files go to `/var/tmp` (the Ollama zip is 1.47 GB).
10. **CI machine deps**: xvfb + libnss3/libnspr4/libasound2t64 (workflow), plus the full GTK set locally when electron's dist is re-provisioned.

---

## L. Store & marketplace rules (design approved, build pending his go)

One page, **labeled sources** (OddBrain / Claude Code marketplace / agy) — no blended results that hide provenance. Browse = capped GET reads; install = the ENGINE'S OWN command (e.g. `claude plugin marketplace add <repo>`) shown first on a permission card — **the app never assembles plugin folders by hand** (that is how formats drift). Phase 2 needs: the source picker on the store page, marketplace index readers (same fetch caps as the pack store), result cards (name, author, source badge, install command), and a live probe of the real `claude plugin marketplace` surface on his machine before any claim. Phase 3 (agy) waits for Google to ship a catalog. Nothing runs at app boot — marketplaces are entered, never listened to.

---

## M. The acceptance bar (unchanged)

He installs the newest `OddBrain-Setup-<sha>.exe` on the TUF A15 and runs the checklist in `HANDOVER.md` §8.4. Real turn, Allow/Deny/Restore, always-loaded, startup, extension captures — **his hands, his machine, his verdict**. Everything else in this ledger exists to make that checklist boring.

---

*Written 2026-10-17 at `341efc5`+ (with HANDOVER.md). Add a row the moment a decision is made — this ledger is only as true as its last landing.*
