# apps/01_claude-exact-pixel-clone

Exact Claude-desktop clone, driven by a local Ollama model and an Obsidian vault.
Target screenshots: `spec/screenshots/191547 … 191707.png`.

## Run on Windows (TUF A15, 8 GB RAM, 4 GB VRAM)

```
start-app.bat
```

It: detects a **running** Ollama and only starts `ollama serve` when needed, sets
`OLLAMA_ORIGINS=*`, offers to pull `qwen2.5:3b` only if missing, installs deps (plus the
Windows rollup binary Vite wants), starts the vault API on 8765 if it is not already up,
opens `http://127.0.0.1:5173`.

`check-ollama.bat` prints the state of Ollama / models / vault API / node.

## Why there is no CORS problem

`vite.config.js` proxies every local call, so the browser is always same-origin and
`OLLAMA_ORIGINS` no longer matters:

| Browser call | Forwarded to |
|---|---|
| `/api/ollama/tags`  | `http://127.0.0.1:11434/api/tags` |
| `/api/ollama/show`  | `http://127.0.0.1:11434/api/show` |
| `/api/ollama/chat`  | `http://127.0.0.1:11434/api/chat` |
| `/api/vault/...`    | `http://127.0.0.1:8765/...` |

`server/proxy-policy.cjs` sits in front of those routes and allows **only** the
endpoints this UI needs. Model pull/delete, arbitrary vault paths, cross-origin
requests and browser-form writes are refused with 403/415. The proxy target is
validated to be an unauthenticated loopback service, so no remote AI or vault
destination can be substituted.

**On your own machine nothing extra is needed** — the browser origin is
`127.0.0.1` or `localhost`, which is allowed by default.

If you serve the dev server through a forwarded/preview hostname, both layers
need to be told:

```
ALLOW_PREVIEW_ORIGINS=1 node server/vault-api.cjs
ALLOW_PREVIEW_ORIGINS=1 npx vite --host 0.0.0.0 --port 5173
```

That permits `*.e2b.app` origins only. **Do not set it for a normal local run** —
it exists solely so the app can be previewed from another host.

## UI lineage

The interface was adopted wholesale from the `arena/01199af1-ai-assistant` branch
at the user's request ("take this branch for the ui/ux"). That branch's palette is
the one the user specified — `#1a1a1a` main, `#202020` sidebar, `#242424`
composer, 260px sidebar — so the earlier measured-pixel conflict does not apply
here. See `spec/MEASURED_PIXELS.md` for the geometry it still governs.

Two things from this branch were kept on top of it, because they are stated
requirements that branch did not have:

| Kept | Why |
|---|---|
| `src/components/TitleBar.jsx` | File/Edit/View/Go/Help **Windows title bar** — required, and the adopted UI had none |
| `src/components/TodayView.jsx` (`Alt+T`) | P8 Today view; also reachable from the sidebar |

`src/index.css` carries a short compatibility block that points the older token
names those two components use at the adopted palette, so they follow the theme
instead of carrying their own colours.

## Layout (from 191547.png)

```
┌ TitleBar  File Edit View Go Help              ✳ AI ASSistant   ● Ollama ● Vault ┐
│ Sidebar 260px #202020      │ Center #1a1a1a          │ AI-Brain │ Artifacts     │
│  Search                    │  Free plan · Upgrade    │ (Ctrl+J) │ (Ctrl+Shift+A)│
│  + New chat                │  "Evening, Utso." ✳     │          │               │
│  Projects / Artifacts (n)  │  composer #242424       │ capsules │ preview|code  │
│  Customize                 │  Project · model ·      │ blacklist│               │
│  Oct 8 / Older / Pinned    │  Medium · Manual ·  ↑   │ today    │               │
│  [NU] Utso · Free          │                         │          │               │
└────────────────────────────┴─────────────────────────┴──────────┴───────────────┘
```

## What each file does

| File | Purpose |
|---|---|
| `src/App.jsx` | Shell state, views (chat / artifacts / projects), dialogs, shortcuts |
| `src/hooks/useChat.js` | Send, stream, retry, and capture each turn into the vault |
| `src/hooks/useModels.js` | Model list + verification; refuses remote/cloud models |
| `src/hooks/usePersistentState.js` | localStorage with recovery — never silently overwrites an unreadable value |
| `src/lib/ollama.js` | Ollama client: tags/show/chat, NDJSON reader, `<think>` split, capabilities |
| `src/lib/vault.js` | Vault API client + the `vault` facade TodayView reads |
| `src/lib/artifacts.js` | Artifact extraction, "did the user actually ask?", sandboxed preview HTML |
| `src/lib/attachments.js` | File/image intake and size guards |
| `src/lib/storage.js` | Defaults + normalisers for chats, settings, projects |
| `src/components/Sidebar.jsx` | 260px sidebar: chat groups, Projects, Artifacts, Today, user menu |
| `src/components/Center.jsx` | Greeting, transcript, artifact cards, composer |
| `src/components/Composer.jsx` | `#242424` input, model/effort/thinking/project, uploads, capsules |
| `src/components/ModelSelector.jsx` | Local model picker with refresh and size labels |
| `src/components/SettingsModal.jsx` | Appearance / Voice / account sections |
| `src/components/AppsExtensionsModal.jsx` | Apps + extensions (191636) |
| `src/components/UserMenu.jsx` | 191608 user menu |
| `src/components/ArtifactPanel.jsx` | Sandboxed artifact preview, code, version save |
| `src/components/ArtifactsLibrary.jsx` | All artifacts across chats, import |
| `src/components/VaultPanel.jsx` | Capsules, never-check blacklist |
| `src/components/BlacklistManager.jsx` | Never-check pattern editor (explicit deny) |
| `src/components/ThinkingDisplay.jsx` | Model thinking output |
| `src/components/Dialog.jsx` | Accessible dialog: portal, focus trap, inert background |
| `src/components/ClaudeMark.jsx` | The Claude starburst |
| `src/components/TitleBar.jsx` | **Kept from this branch** — File/Edit/View/Go/Help (191558) |
| `src/components/TodayView.jsx` | **Kept from this branch** — P8 Today view (`Alt+T`) |
| `server/vault-api.cjs` | The only thing that writes to the vault |
| `server/proxy-policy.cjs` | Allows only the endpoints this UI needs; blocks the rest |
| `server/mock-ollama.cjs` | Ollama-compatible stub for previews only — never started by `start-app.bat` |
| `tools/pngread.py` | Dependency-free PNG decoder used to verify the pixel spec (repo root) |

## Pixel spec

The palette is the one the user specified, and it is authoritative:

| Role | Value |
|---|---|
| Main | `#1a1a1a` |
| Sidebar | `#202020`, 260px |
| Composer | `#242424` |
| Accent | `#d48264` |

Values **measured** from the screenshots (`spec/MEASURED_PIXELS.md`, re-derivable
with `tools/pngread.py`) still govern geometry the user never specified. The
earlier round of measured *colours* was reverted at the user's instruction; the
rule is that a measurement never silently overrides a value they stated.

## Keys

`Alt+T` Today view · `Ctrl+,` settings · `Ctrl+B` collapse sidebar ·
`Enter` send · `Shift+Enter` newline.

## Tests

```
npm test          # 48 tests: artifacts+storage, ollama, proxy policy,
                  #           vault API (in-process), vault API (spawned, on disk)
npm i -D jsdom    # only needed for the UI smoke test
npm run test:ui   # 5 jsdom tests: shell, artifact gating, settings/theme,
                  #               Today view, sidebar context menu
```

jsdom is deliberately **not** a declared dependency — the target machine has a
slow connection — so `test:ui` skips cleanly when jsdom is absent.

## Preview without a GPU

This sandbox has no Ollama, so previews run `server/mock-ollama.cjs`. It speaks
enough of the Ollama API (`/api/tags`, `/api/show`, `/api/chat`) to exercise
model verification, streaming and artifacts, and **labels every reply as a
mock**. `start-app.bat` never starts it — the real build always talks to the real
Ollama on `127.0.0.1:11434`.

## Credits

Design system tokens and the skills mechanism are derived from
[open-design](https://github.com/nexu-io/open-design) (Apache-2.0).
See `THIRD_PARTY_NOTICES.md`.
