# ARCHITECTURE_LIVING.md — How the App, Vault and Extension Fit Together

**Last Updated:** 2026-10-14 (night) Asia/Dhaka

## 1. One-Line Architecture

**The app is the driver, the vault is the memory that outlives it, and the extension is a collector that
asks the app first.** Everything local by default; anything that reaches the network is granted in Settings.

## 2. The App — `apps/03_ai-assistant/`

```
Electron main process                preload                 renderer
  settings.ts   (atomic writes)   ──  window.api  ──►  React interface
  vault/                                              (chat, artifacts,
    service.ts  (what the vault means)                 comment mode, Settings)
    routes.ts   (GET/POST, 404/405)
    files.ts    (traversal + symlink refusal,
                 write-once sources, activity log)
    text.ts     (names, Asia/Dhaka dates, YAML)
    blacklist.ts (never-check rules)   shared/        (types, capture, inference,
    zip.ts      (export ≤200 files)     │              prompts, markdown, vault facade)
  api/ (loopback guard + server, ready for the      ──┘
        extension port when it is opened)
```

- **`src/main/vault/`** is the only thing that writes to the vault. JSON over the bridge; long file
  contents never travel through the UI layer.
- **`src/preload/index.ts`** is the entire bridge: `settings.read`, `settings.update`, `vault.chooseFolder`.
  Nothing else crosses from the renderer into the machine.
- **The renderer** holds no machine facts. It asks through `platform/bridge.ts`, which is also the reason the
  browser preview works: with no preload script, the bridge answers honestly ("not in this window") instead
  of throwing.

## 3. The Vault

- Canonical memory is `vault/AI-Brain/`, Obsidian Markdown, readable and editable without the app.
- A finished conversation is written to `02 Sources/Conversations/AI ASSistant/<year>/<id>.md`, with the
  frontmatter the vault's own templates describe. Conversations never create entity files.
- Every write appends one line to `09 Activity & Undo/<year>/<month>.md`.
- Days are **Asia/Dhaka** days, always — a journal entry written at 01:00 belongs to that day.
- The folder is resolved in this order: Settings → `AI_ASSISTANT_VAULT` → `AI_BRAIN_VAULT` → `AI_BRAIN_PATH`
  → the checkout's `vault/AI-Brain` → the app's own data folder.
- **A missing folder is never replaced.** The app reports `available: false` and writes nothing.

## 4. Memory Limits — How a 4GB Card Copes

- Ollama options come from `src/shared/lib/inference.ts`. Presets describe machines (4/6/8 GB, CPU-only) and
  Custom takes exact numbers; ranges are clamped to what the request is held to.
- `fitCheck()` measures the loaded model plus its context against **the budget of the profile that was
  chosen** (`PROFILE_BUDGET_GB`). CPU-only and Custom claim no card and are never warned about.
- When a preset genuinely cannot hold the loaded model, one sentence names the real numbers and one button
  fixes it: `fitToProfile()` lowers the context to a recognisable size, or the CPU-only profile when nothing
  fits. Numbers a person typed are never changed silently.
- The estimate is deliberately conservative (weights + 0.08 MB per context token + 0.4 GB overhead) and is
  documented as an estimate in the source.

## 5. Settings

One full-window surface (`components/SettingsView.tsx`), a rail on the left and one section at a time on the
right. Sections exist only where there is something real behind them:

| Section | What it changes | Where the value lives |
|---|---|---|
| System | nothing — it reports: app, model, endpoint, folder | read from the bridge |
| Appearance | accent + conversation width, as theme tokens | `localStorage` (`ai-assistant.appearance`) |
| Performance | Ollama options per message | `localStorage` (`ai-assistant.inference`) |
| Vault | the folder conversations are kept in | the machine's settings file, through the main process |

Appearance belongs to the window rather than the machine on purpose: an accent is a preference about
reading, and keeping it in the browser's storage is what makes it work in the preview too.

## 6. The Extension (spec + starter — not wired yet)

```
[Extension MV3]  --(would POST to a loopback port that does not exist yet)-->  [App]
      |                                                                            |
      +--- blacklist (host-aware) decides what may be collected                     +--- writes the vault
```

- The extension's spec is `extension/README.md` and `EXTENSION_SPEC.md`: check-everything by default after
  one permission, a never-check blacklist the owner can edit, failure logged as "wasn't accessible — reason"
  with no popup, and Capsule Hub + Quillbot behaviour for injecting context into other AIs.
- **The gap:** the app's vault API is in-process, so `extension/lib/vault-writer.js` has nothing to talk to.
  Opening a loopback port that accepts `chrome-extension://` origins is the work that unblocks it; the
  pending note lives in `apps/03_ai-assistant/tests/pending/README.md`.

## 7. Rules That Are Structural, Not Stylistic

1. **Nothing fake in front of the owner.** Missing things are said out loud; a screen may not exist without
   working.
2. **No console errors or warnings**, in the desktop window or the browser preview. The UI checks fail the
   run on any of them.
3. **One writer to the vault** (`src/main/vault/`), and never a replacement vault.
4. **Local by default**; network access is granted from Settings, per provider and per capability.
5. **The app is not a Claude clone**, and nothing user-facing carries Claude branding.
