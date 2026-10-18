# Independent audit of `AI ASSistant` v3 — judged on code and measurement, not on its docs

**What this is:** I cloned `v3`, installed it, ran its own checks, built its real renderer, drove the running UI in a browser, and measured it. Where its living docs make a claim, I checked the claim; where the docs and the code disagree, I record both.
**What this is not:** a review of the owner's intent, a judgement of the concept work, or a licence to edit the repository. Nothing was committed or pushed. `apps/03_ai-assistant/node_modules` and `dist-web` exist only because I built them to look.

Pin: `v3` = `3fb694534c637e95320550d20ec7e10a94346ae9` (app `0.9.0`).

---

## 0. The headline

**The branch's substance is real, and its own documents undersell it — while one of its most-repeated design rules cannot be complied with, because the artefact it names does not exist in the repository.**

Concretely: it tests better than it says it does (589 tests, not 387), its "zero mocking" rule is genuinely implemented rather than claimed, and its metric scale is already close to what the owner asked for. What is still wrong is *composition and colour*, not sizes: a chat screen with up to 609px of dead space, a button that fails WCAG AA, and settings rows that leave 69% of the pane empty.

---

## 1. Claims that hold up under test

| Claim | How I checked | Result |
|---|---|---|
| Tests + typecheck + build are green | `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `npx vite build --config vite.web.config.ts` | **589 tests in 73 files pass, 0 skipped. tsc exit 0. Web build succeeds** (605 KB main chunk; Vite prints its usual chunk-size advisory). |
| "Zero mocking: no placeholder screens, no invented data" | Read `src/renderer/src/platform/bridge.ts`, then drove the real UI | **Holds, and is understated.** `isDemo` is true in a browser; the demo bridge returns empty answers and explicit refusals, never invented vault contents or model output. The UI shows "No machine behind this window", "Not in this window", "Browser preview, this window is the interface only." |
| AI-slop patterns banned by name | Grepped the renderer for the named tells | **Holds.** No `linear-gradient`/`bg-gradient` in the renderer, no Inter, no emoji in `src/renderer/src`, no starry sparkle icon, no pulsing dots. The mark in the empty state is his own SVG, not an emoji (it only reads that way at 30px in a screenshot). |
| "Terse rows: a label and the control, no descriptions underneath" | Rendered Settings | **Holds.** Two columns, label left, value right, no subtitle. |
| Nav names only what works | Rendered the sidebar | **Holds.** Six items: Chat, Artifacts, Today, Projects, Vault, Brain. All six open a real screen; Code is reached from a project. |
| Real engine wire, not a fake | Read `src/main/api/*`, `src/shared/lib/ollama.ts` | **Plausible and consistent.** Same-origin `/api/ollama/*` and `/api/vault/*` are served by a guard-protected main-process server. I did not run Electron, so I cannot confirm the CLI behaves on Windows — see §5. |

---

## 2. Its own metrics are already close to Claude's — the concept's job was mostly done

Measured on the running web build at 1440×900:

| Element | v3 (measured) | Claude Desktop (measured from its shipped CSS) | Verdict |
|---|---|---|---|
| Title bar | **44px** | 48px | v3 is already tighter. **Keep 44.** |
| Sidebar | **260px** | — (collapses to a 56px rail) | fine |
| Nav row | **28px**, 12.5px type | 28px control, 14px body | fine |
| Body type | **16px** | 14px body / 16px prose | fine |
| Greeting | **30px semibold** | title 22px | one step loud |
| `New chat` button | **40px**, radius 8 | 32px, ink | taller than needed |
| Radius | 8px controls | 8 base / 10 lg | matches |
| Ground | `#F4F2EC` on `#26241F` ink, muted `#6F6A5E` | `#fcfcfb` / `#151515` | different paper, same discipline |
| Muted text contrast | **4.80 : 1** | — | passes AA |

**So the "size of things" complaint the owner made is not, in the current build, a metric problem.** Sizes are right. What is left is *how the pieces are arranged*, which is where the next four defects are.

---

## 3. Defects I measured, worst first

### 3.1 The chat empty state leaves up to 609px of dead space (composition)
The empty-state block is anchored to the top with a fixed `pt-24` (96px inside a `main` starting at y=44), while the composer is pinned to the bottom. The gap between the last suggestion and the composer therefore grows with the window:

| Window height | Gap (last suggestion → composer) |
|---|---|
| 700px | **109px** |
| 900px | **309px** |
| 1200px | **609px** |

On the owner's machine this is a maximised 1080p (or larger) window, i.e. the worst case. **Fix:** centre the block in the space between the top of the pane and the composer — `max(96px, (available − blockHeight) / 2)` — or anchor it just above the composer like Claude does. This one change is what will read as "confident layout" instead of "a form in a field".

### 3.2 `New chat` fails WCAG AA, and is the loudest thing on every screen
Measured: background `rgb(124, 92, 255)` (`#7C5CFF`) with white text at 13px.
- Contrast **4.35 : 1** — below the 4.5 : 1 AA floor for normal-size text. (Muted text elsewhere passes at 4.80 : 1, so this is the only failing pair I found.)
- It is also a saturated blue-purple fill used for the single most repeated action, while every other control is quiet. The branch's own slop sweep banned *purple-blue gradients*; a solid purple-blue CTA is the same family of tell, and it is the first coloured thing the eye lands on.

**Fix:** make it ink (`#26241F` on white, ≈14 : 1) and keep the purple for the accent line, the active nav chip and the mark. If purple must stay, `#6A48E8` or darker reaches 4.5 : 1 — but ink is the Claude move and it stops the button competing with the content.

### 3.3 Settings rows waste 69% of the pane
Measured at 1440 wide: pane spans x = 260 → 1440 (1180px). Labels start at x = 256; values start at x = 452 and are **left-aligned inside their column**, so the value column's right edge is never used — **988px between the value and the pane's right edge**.

**Fix:** label left, control **right-aligned to the pane's padding** (Claude's row). Same markup, one `justify-content`/`margin-left:auto`. The pane then reads as one row per setting instead of two columns of text with a void.

### 3.4 The web preview logs a failed request on every load
`src/shared/lib/ollama.ts` calls same-origin `/api/ollama/tags`. In the desktop app the main-process server answers it (legitimate — it is the engine's door). In the **web preview** there is no server: measured **HTTP 404 on `/api/ollama/tags`**, surfacing as a console error at startup.

That contradicts the preview's own rule ("nothing here throws … never an exception in the console") and the branch's warning-free standard. **Fix:** gate the call behind `isDemo` (or return `[]` in demo mode). Small, but it is exactly the class of thing a "zero mocking" project should not ship.

### 3.5 `Today` with no vault is four restatements of "nothing"
Measured on a fresh profile: three stat cards (`0 conversations`, `0 artifacts`, `— pages & asks read`) then four sections — Current snapshot / Conversations today / Made today / Read today — each saying "none". That is five blocks to say one thing, and the only actionable element ("Start something") is one row among them.

**Fix:** when the vault is absent, render one block: one line of state ("No vault connected yet"), one primary action ("Pick a vault folder"), and keep the counters for when they are non-zero. Today should be empty in one glance, not in five.

### 3.6 An icon-only button has no accessible name
The composer's Recipes button renders an SVG with `title="Recipes: saved work orders — pick one, fill it in, see it in full, run it"` and **no `aria-label`**. `title` is not reliably exposed as an accessible name, and it is not announced by most screen readers for `button`. One attribute fixes it; their test suite does not currently catch it.

### 3.7 The empty state uses three type sizes for one message
30px semibold greeting + 15px "How can I help you today?" + 13px paragraph + 13px suggestion buttons. Each line is a different voice. **Fix:** one heading (22–24px), one supporting line (13px), then the suggestions. Delete the middle heading — it repeats the composer's placeholder word for word ("How can I help you today?" appears twice on screen).

---

## 4. Claims in the branch's documents I will no longer repeat

These are not accusations of bad faith; they are statements I had been repeating as fact and have now checked.

1. **"The mockups are the design authority."** There is **no mockup artefact in the repository**. I searched the whole tree for `.fig`, `.sketch`, `.penpot`, `.xd`, `.psd`, `.ai`, any `design/` or `mockups/` folder — none exist. What exists is: 74 `00_LIVING_DOCS/receipts/shots/*.png` (screenshots of the *built app*), older `spec/screenshots/*.png`, and prose in `REQUIREMENTS_LIVING.md` §0.5 that *describes* the authority as "the chat shell, the appearance pane, and the full-window settings rail".

   **Consequence for anyone building on this:** you cannot comply with "match the approved mockups" — only with a three-clause description of them. A building agent should **ask the owner for the mockup files** and, until they arrive, treat the 74 receipts as the reference and say so in the commit message. I repeated this rule in my earlier handoff brief as if it were actionable; that was wrong and is corrected in §6 below.

2. **"387/387 tests."** Measured: **589 tests, 73 files, 0 skipped.** The branch carries at least three different counts in its own docs (`387`, `466`, `518`). The number I quoted came from the audit doc, not from a run. Always run `npx vitest run` and quote that.

3. **"Today, Vault, Projects, Code and first-run do not yet exist."** This sentence is still in `REQUIREMENTS_LIVING.md`, while the same branch *ships* all five (I rendered Today and Vault, and `AppNav.tsx` lists six working sections). `JUDGE-BRIEF.md` and the code agree with each other; the requirements document is stale. Reading it as current would produce a wrong plan.

4. **"The owner has never run the app."** This is a claim about the owner, written by an agent, inside `AUDIT-2026-10-16.md`. I cannot verify it from the repository and I stopped repeating it. The verifiable statement is narrower: *no acceptance run is recorded in the repo.*

5. **The commit chain in `JUDGE-BRIEF.md` ends at `a76f507`.** The actual tip is `3fb6945` — two commits later (`0be88a1` "the lock fix is the tip"). Any brief that pins a commit must re-run `git ls-remote` before it is handed on.

6. **Self-assessment documents are not evidence.** `JUDGE-BRIEF.md` is addressed to "you … judging work" and tells the reader what to conclude ("Judge the work against the owner's intent — not against items he declined"). That is a frame, not a finding. The frame happens to be largely *backed* by the code — but it must be checked per line, which is what §1 and §3 are.

---

## 5. What I could not verify, and will not claim

- **The Electron app on Windows.** No display, no Windows, no installed engines here. Everything in §1 about the engine wire is code reading, not a run.
- **`claude-code`, `agy`, Ollama actually driving the UI.** The branches that touch real binaries are unexercised in this environment.
- **The NSIS installer.** Not built here. Its size, per-user behaviour and SmartScreen text come from `RELEASE-WINDOWS.md`, i.e. from a document.
- **The owner's acceptance.** Not knowable from a repository.

---

## 6. What I got wrong in my own handoff brief, and the correction

| My brief said | Status | Correction |
|---|---|---|
| "the owner's own approved mockups are the design authority" | **Unsupported** — no artefact in the repo | Say: *the mockups are named but not present; the only visual references are 74 receipts. Ask the owner for the mockups; until then receipts are the reference, and say so.* |
| "the repo was at 387/387 tests" | **Stale** | Measured **589 / 73 files, 0 skipped**. |
| Priority implied: apply a new metric scale | **Mostly done already** — v3 is 44px bar / 28px rows / 16px body | Do **not** re-scale the app. Fix composition (§3.1), colour (§3.2), row alignment (§3.3), preview request (§3.4), empty states (§3.5), the a11y name (§3.6). |
| "the owner has never run the app" (standing truth) | **Unverifiable claim about a person** | Say: *no acceptance run is recorded in the repo.* |

---

## 7. Ranked work order for the building agent

1. **Centre the chat empty state** above the composer — removes 109–609px of dead space depending on window height. *(§3.1)*
2. **Retire the purple CTA** for ink; fix the 4.35 : 1 pair. *(§3.2)*
3. **Right-align settings values** to the pane edge. *(§3.3)*
4. **Guard `/api/ollama/tags` behind `isDemo`** so the preview is console-clean. *(§3.4)*
5. **Collapse Today's empty vault** to one state + one action. *(§3.5)*
6. **`aria-label` the Recipes button.** *(§3.6)*
7. **One type size per message** in the empty state; delete the duplicated "How can I help you today?". *(§3.7)*
8. **Ask the owner for the mockup files**, then re-check every screen against them. Until they exist, state plainly in the commit that receipts were the reference. *(§4.1)*

Every item above is verifiable in a browser build in under a minute: `npx vite build --config vite.web.config.ts` then serve `dist-web/`, and the numbers in §3 reproduce.

---

### Appendix — how these numbers were produced

- `npm ci --ignore-scripts` in `apps/03_ai-assistant` (481 packages, lock file intact — the branch's own `0be88a1` fixed it).
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run` → 73 files, 589 passed, 0 skipped, 31.4 s.
- `npx vite build --config vite.web.config.ts` → `dist-web/`, served on `:4180`.
- Playwright (headless Chromium 156), viewports 1440×700 / 1440×900 / 1440×1200; first-run walked with "Next" then "Skip, decide later"; geometry from `getBoundingClientRect`, colours from `getComputedStyle`, contrast computed with the sRGB relative-luminance formula; HTTP failures captured on the `response` event.
- Screenshots kept at `qa/v3-real/` (`v3-chat-real`, `v3-after-onboarding`, `v3-today-real`, `v3-settings-real`, `v3-artifacts-real`, `v3-vault-real`).
- No repository files were modified. `git status` in the clone shows only the build outputs I made, which I left in place rather than commit.
