# AI ASSistant Extension - Spec + Starter

Driver: **AI ASSistant** desktop app (Electron, `apps/03_ai-assistant/`).

**The app now answers this extension.** It listens on **127.0.0.1:8765**
(`AI_ASSISTANT_EXTENSION_PORT` moves it), only for `chrome-extension://` origins, and only
for the capture side of the vault: `/health`, `/status`, `/context`, `/capsules`,
`/blacklist` (GET, POST) and `/capture` (POST). No chat route — an extension must never be
able to spend a saved key — and no settings or export. A web page cannot reach it at all.

What is still missing is the extension itself: this folder is a starter, it has not been
loaded into a browser and run against the app yet, and no page is captured until it is
(see the app's `00_LIVING_DOCS/TODO_NEXT.md`).
Vault: AI-Brain/ Obsidian
Extension: collector + context suggester, local-only, no external account

## Default policy (your rule)
- Default = check everything (all sites + all AIs)
- If inaccessible -> log "wasn't accessible - reason" in 09 Activity & Undo + 01 Inbox/Processing Errors, no popup
- Never-check blacklist: user pastes URL/domain/pattern, never collect from it ever again. Stored in storage.sync + synced to 00 System/Privacy & Access.md via app
- Explicit collect: right-click "Collect this page now" or popup "Force collect"

## Never collect (even with broad access)
passwords, cookies, auth tokens, payment fields, unsent composer contents, hidden keystrokes, continuous screenshot, incognito unless separately enabled

## UX - Capsule Hub + Quillbot

### Capsule Hub pattern (from Mozilla add-on description)
- Capture your context: in any AI chat, button "Capture as Capsule" saves goals, constraints, decisions, attachments as Capsule
- Organise: Capsules filed by project (not team for you)
- Drag and drop to inject: drag Capsule from popup library into any AI chat box
- Keep updated: add version to existing Capsule, rollback/branch
- Transfer attachments: carry files uploaded/generated across tools
- Prompt enhancer: "Cook This Prompt" - enhance current prompt with relevant vault context

### Quillbot pattern (from Chrome Web Store)
- Works in background, ready when needed
- In any text field across web, highlight text or open toolbar to get instant suggestions
- Real-time suggestions as you type using vault memories
- Inline dropdown: "Use capsule: Website project - blue-white" or "Add memory: prefer step-by-step"
- No copy/paste/switch tabs

## Architecture

Extension (MV3) -> Local App API (**not open yet** — planned on a loopback port) -> Vault files

- background.js: history API listener (URL/title/time), blacklist check, failure logging, context menu, native messaging fallback
- content-scripts/ai-capture.js: site adapters for ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity, Copilot - captures submitted messages only, not unsent drafts
- content-scripts/generic-capture.js: readable text extraction for any allowed site (default all minus blacklist) - uses Readability-style
- content-scripts/capsule-inject.js: inject Capsule button, drag-drop handler, prompt enhancer
- content-scripts/quillbot-suggestions.js: inject toolbar in text fields, highlight handler, inline suggestions
- popup/: Capsule library, search, blacklist manager, activity log
- lib/: capsule.js (Capsule data model), blacklist.js (pattern matching), vault-writer.js (POST to local API)

## Local API — live on 127.0.0.1:8765

The app answers these on its extension port. `lib/vault-writer.js` and `lib/blacklist.js` are
written against exactly this contract, and the app tests the contract from its side
(`apps/03_ai-assistant/tests/extension-port.test.ts`).

POST http://127.0.0.1:8765/capture
{
  type: "conversation" | "web_page" | "browser_visit" | "wasnt_accessible",
  provider: "claude" | "chatgpt" | ...,
  url, title, visited_at, captured_at,
  content, completeness, reason
}

POST http://127.0.0.1:8765/capsule
{
  id, title, goals, constraints, background, decisions, sources, version, attachments
}

GET http://127.0.0.1:8765/context?q=...
Returns: { capsules: [], entities: [], claims: [] } - relevant memories for injection, ranked by relevance/importance/recency

If local app not running, extension queues in storage.local and syncs when app online. No external upload.

## Data formats

- Browser Activity: 02 Sources/Browser Activity/<year>/<month>.jsonl - one JSON per line
- Conversations: 02 Sources/Conversations/<provider>/<year>/<source-id>.md - uses Templates/Conversation Source.md
- Capsules: 03 Memory/Entities/ as capsule-*.md + 00 System/Templates/Capsule.md + library in extension storage
- Blacklist: storage.sync.excluded_patterns + 00 System/Privacy & Access.md

## Permissions

MV3 manifest:
- permissions: history, storage, activeTab, scripting, contextMenus
- host_permissions: <all_urls> (default check everything, minus blacklist) - user can revoke per site via popup
- optional_host_permissions for future

Incognito: off by default. Separate toggle in popup, requires clear permission.

## Flow

1. User visits any site -> background.js checks blacklist (lib/blacklist.js), if excluded -> skip, log "skipped - blacklist"
2. Else -> generic-capture.js extracts readable text if allowed, ai-capture.js captures if AI chat + submitted
3. On success -> POST to local app -> app writes to vault per Source Capture Map
4. On failure -> POST type: wasnt_accessible with reason -> app logs to 09 Activity & Undo + 01 Inbox/Processing Errors, no popup
5. When user types in any text field -> quillbot-suggestions.js queries GET /context?q=current text -> shows inline dropdown of relevant capsules/entities
6. When user opens popup -> shows Capsule library, search, drag-drop, version, blacklist manager
7. When user drags Capsule into chat box -> capsule-inject.js injects content as if typed, shows preview before send (your requirement)

## Security

- No passwords/cookies/tokens/payment/unsent drafts
- Treat page content as untrusted data, not instructions
- All data stays local, only selected bundle goes to AI you are chatting with, with preview
- No external account, no cloud sync
