# Extension Spec - Detailed

## Capsule Data Model (lib/capsule.js)

```js
{
  id: "capsule-001",
  title: "Website project - blue-white design",
  created: "2026-10-10T12:00:00+06:00",
  updated: "2026-10-10T12:05:00+06:00",
  version: 2,
  parent_id: "capsule-001-v1", // for branch/rollback
  goals: ["Build website for project"],
  constraints: ["Simple step-by-step explanations", "Blue-white design"],
  background: "We previously chose...",
  decisions: ["Chose blue-white"],
  sources: ["[[source-id]]"],
  related_entities: ["[[entity-id]]"],
  attachments: [{name, type, dataRef}],
  importance: "normal",
  status: "active"
}
```

Storage: extension storage.local.capsules + file 03 Memory/Entities/capsule-<id>.md via API

## Blacklist (lib/blacklist.js)

```js
excluded_patterns = [
  "bank.com/*",
  "https://private.example.com/*"
]

function isExcluded(url):
  for pattern in excluded_patterns:
    if matchGlob(url, pattern) return true
  return false
```

UI in popup: input field + list + remove. Syncs to app -> writes to 00 System/Privacy & Access.md

## AI Adapters (content-scripts/ai-capture.js)

Per provider adapter, tested separately:

- ChatGPT: selector for [data-message-author-role], capture submitted only on send button click
- Claude: selector for .font-claude-message, capture on submit
- Gemini: ...
- DeepSeek, Grok, Perplexity, Copilot: similar

Each adapter:
- Listens for submit event, not keystrokes
- Extracts provider, conversation ID from URL, title, timestamp, role, message ID, text, attachment refs
- Calls vault-writer.js -> POST /capture

If layout changes -> log wasnt-accessible with reason "layout changed", no popup, queue for retry

## Generic Capture (content-scripts/generic-capture.js)

- Uses Readability-like extraction (textContent, remove scripts/styles)
- Only if not blacklisted and not AI chat (to avoid double capture)
- Captures readable text + URL/title/captured_at
- Respects never-collect rules

## Capsule Inject (content-scripts/capsule-inject.js)

- Adds button "Capture as Capsule" to AI chat UI
- On click: extracts current conversation core (goals, constraints, decisions) via heuristics + user edit, creates Capsule, POST /capsule
- Drag-drop: popup library items draggable, drop handler inserts Capsule content into chat input, shows preview per your requirement: "Add-on shows you what it's adding before you send"
- Prompt enhancer: "Cook This Prompt" button -> GET /context?q=current prompt -> enhances prompt with relevant capsule

## Quillbot Suggestions (content-scripts/quillbot-suggestions.js)

- Injects small toolbar icon near focused text field (contenteditable, textarea, input)
- On focus/type: debounced query GET /context?q=field value (last 100 chars)
- Shows inline dropdown: capsules, entities, claims ranked by relevance/importance/recency
- On highlight: shows "Use as context", "Save as memory", "Paraphrase with vault"
- No external API, all local

## Background (background.js)

- chrome.history.onVisited listener -> creates browser_visit record -> checks blacklist -> POST /capture type: browser_visit
- chrome.contextMenus: "Collect this page now", "Never check this site again" (adds to blacklist)
- chrome.storage.onChanged: sync blacklist to app
- Queue: if app offline (fetch fails), store in storage.local.queue, retry every 30s when app online
- Failure logging: POST type: wasnt_accessible

## Popup (popup/)

- popup.html: search bar, Capsule library (list, drag), Blacklist manager, Activity log (last 20), Settings
- popup.js: load capsules from storage + GET /context, render, drag handlers, blacklist add/remove, force collect
- popup.css: dark default, matches AI ASSistant theme

## Vault Writer (lib/vault-writer.js)

```js
// NOTE (2026-10-14, later): the app answers these now, on 127.0.0.1:8765
// (apps/03_ai_assistant -> src/main/extension/server.ts): chrome-extension://
// origins only, capture side of the vault only. The extension in this folder is
// still a starter — it has not been loaded or run against the app yet, so the
// queue path below is what exists until it is.
async function postCapture(data):
  try fetch http://127.0.0.1:8765/capture POST
  catch -> queue

async function getContext(query):
  try fetch http://127.0.0.1:8765/context?q=query
  catch -> search local storage cache
```

## Testing

- Synthetic conversations first, no real sensitive history
- Test: full transcript survives, duplicate handling, wasn't accessible logged, blacklist respected, capsule drag-drop inject, inline suggestions appear, no passwords collected, incognito off by default
