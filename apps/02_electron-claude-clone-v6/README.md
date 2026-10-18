# AI ASSistant - Claude Exact Clone + Vault Driver

Cloned from https://github.com/Damienchakma/Open-claude (MIT) - open source Claude UI replica, then customized for AI ASSistant.

**What this app is:**
- Exact Claude layout: left compact history (64), centered transcript (max-w-4xl), right-aligned user bubbles, plain assistant replies, bottom composer, memory side panel
- Dark warm charcoal by default (#1a1a1a), persistent light/dark switch
- Windows title bar + close controls visible (Electron default)
- Driver of vault: hosts local API at 127.0.0.1:8765 for extension + vault writes
- Uses AI-Brain Obsidian vault as canonical memory, .brain/ as rebuildable index
- Model-aware: supports Ollama qwen2.5:3b baseline, qwen3-vl:4b vision, plus remote after approval. Tracks in 00 System/Model Registry.md
- Capsule Hub + Quillbot UX: drag-drop capsules, inline suggestions, Cook This Prompt

**Roles:**
- App (this) = driver
- Vault (AI-Brain/) = organizer / keeper
- Extension (AI-ASSistant-Extension) = collector + context suggester

**Tech stack:**
- Frontend: React 18, Vite 5, Tailwind CSS (from Open-claude)
- Desktop: Electron 31 (Windows native)
- Backend: Node Express local API at 127.0.0.1:8765 - writes to vault per Source Capture Map
- LLM: Ollama local (qwen2.5:3b) + supports OpenAI/Claude/Gemini/Groq via Open-claude's ModelService.js
- Vault: Obsidian Markdown + JSONL, Priority & Retention.md logic

**Build on Windows (your hardware: 8GB RAM, 4GB VRAM):**

1. Install Node.js 20+ and .NET not needed for this Electron version
2. Install Ollama separately: https://ollama.com/ - then `ollama pull qwen2.5:3b`
3. Clone / copy this folder to Windows
4. Copy AI-Brain vault to Documents/AI-Brain or same folder as app
5. In app folder:
```
npm install
npm run dev:server  # starts vault API at 127.0.0.1:8765 in one terminal
npm run dev         # in another terminal, starts Vite at http://localhost:5173
```
Or both together:
```
npm run dev:all
```

For Electron desktop:
```
npm run electron:dev
```

Build installer:
```
npm run build
npm run electron:build  # creates dist/ installer
```

**How vault integration works:**

- When you chat in app, `ChatMode.jsx` fetches `GET /context?q=last 100 chars` from local API, ranks by relevance/importance/recency per Priority & Retention.md, injects top 3 capsules as context preview
- On send, POST /capture {type: conversation, provider: AI ASSistant} -> writes to 02 Sources/Conversations/AI ASSistant/<year>/
- Extension POSTs to same API: browser_visit, web_page, conversation, capsule, wasnt_accessible, blacklist_update
- GET /context searches 03 Memory/Entities/*.md for relevant capsules/entities, filters generic test titles, returns top 5
- Queue: if API offline, extension queues in chrome.storage.local.queue, flushes every 30s

**Default capture policy (your rule):**
- Default check everything, if inaccessible log "wasn't accessible" in 09 Activity & Undo + 01 Inbox/Processing Errors, no popup
- Never-check blacklist in 00 System/Privacy & Access.md + popup -> Never-Check tab, stored in chrome.storage.sync.excluded_patterns
- Never collects passwords/cookies/tokens/payment/unsent drafts/keystrokes

**Claude exact layout verification:**
- Left: 64px compact history, + New chat, history list
- Center: max-w-4xl centered transcript, centered greeting "What would you like to do?" like Claude
- Right: VaultPanel toggleable (Capsules drag, Blacklist, Open Loops) - side panel so doesn't squeeze conversation
- Bottom: composer with rounded-xl, auto-growing textarea, send button white circle with arrow, disclaimer "AI ASSistant uses vault as memory"
- Dark default #1a1a1a, light/dark switch (from ThemeContext)
- Windows controls visible

**Honest status:**
- This is Electron source tree based on Open-claude MIT clone, customized for vault driver. Not yet compiled on Windows in this sandbox.
- Local model qwen2.5:3b quality limits remain, cannot be promised to equal Claude. UI parity != intelligence.
- Full Claude feature parity needs audit via 00 System/Claude Feature Audit.md - artifacts, vision, files, etc. Some features from Open-claude already: artifacts, vision, file upload, streaming, code blocks.

**Next steps to test on Windows:**
1. Build on Windows 10/11 x64 with Node 20+
2. Test vault read/write, conflict safety, model capabilities, Claude UI inventory, authorized capture, journal/provenance, retention controls, model switch, external-send approval with synthetic data first
3. Test extension -> app API -> vault flow: enable broad access in popup, visit site, check 02 Sources/Browser Activity/, check 09 Activity & Undo/
4. Test capsule drag-drop inject + Cook This Prompt + inline suggestions