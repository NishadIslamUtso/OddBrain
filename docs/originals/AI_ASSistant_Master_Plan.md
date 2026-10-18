# AI ASSistant — Single Source of Truth Master Plan

**Date:** 2026-10-10 (Asia/Dhaka)  
**Status:** AUTHORITATIVE - This one file replaces README.md, Memory Schema.md, AI ASSistant Blueprint.md, AI_Brain_Build_Plan.md, REQUIREMENTS.md, HANDOVER.md, and Untitled document.md. If anything conflicts, this file wins.  
**Purpose:** One file to look back at and say "are we doing it right or not?"

---

## 1. What You Are Building - In One Sentence

A **native Windows app named AI ASSistant** that looks exactly like Claude, uses a **real Obsidian vault as its permanent + working memory**, gets data about you from **every site you visit and every AI you chat with via a browser extension**, and is the **single brain for every AI you use** - without sacrificing reasoning ability to get bigger context windows.

## 2. Product Definition

- **Exact name:** `AI ASSistant` - preserve casing, double S.
- **Platform:** Native Windows 11 desktop app (WPF/XAML), not a browser page prototype. `static/` dashboard was prototype, not final.
- **Window:** Fully on-screen, Windows title bar + close controls always visible.
- **Theme:** Dark warm charcoal by default, visible persistent light/dark switch, remembers choice.
- **Polish:** Finished app must be polished, proactive, simple. User should NOT manage databases, folders, or backend settings.
- **Dates/Timezone:** Asia/Dhaka unless user changes.
- **Guidance:** Explain Windows tasks one simple step at a time, wait for result. Beginner-friendly.

## 3. Who & What Hardware

- **Device:** ASUS TUF Gaming A15, Ryzen 7, 8GB system RAM, RTX 3050 4GB VRAM, ~500GB storage.
- **Concern:** Very slow downloads. Don't call third-party installer safe without verification. Choose compact quantized models.
- **Current runtime:** Ollama installed separately (not bundled). Model `qwen2.5:3b` - small baseline, has shown limits: misreading "slow" as "Solow", generic answers, claiming it can't remember current chat.
- **No personal name saved yet.** Do NOT infer from Windows account/path. Arena.ai chats not auto-imported.

## 4. How You Asked For It - Evolution (from Untitled document.md)

1. **Initial:** "How to use obsidian as the ai brain that remembers everything? For Claude, DeepSeek, ChatGPT, Gemini..."
2. **Clarification:** "They won't open archive directly. Add-on acts like messenger: finds small relevant background and puts it into chat." Example: *"I'm building website, prefer simple step-by-step, we previously chose blue-white design."* Full archive stays local, only selected context goes to AI. Show what is being added before send.
3. **Correction 1:** "You know what a context window is? I want this as my main context window. Like a full brain with long term and short term memory just like ai's primary brain" - Not a prompt helper, a shared memory engine.
4. **Hardware question:** "Is there any local model better than or equal to Claude and DeepSeek best models?" Answer: No on this laptop. Frontier models (Claude Opus 5.5, DeepSeek V4.1 Flash 552B params) too large. Realistic local: Qwen3-VL 4B ~3.3GB download, tight on 8GB RAM.
5. **Correction 2:** "Normally local AIs cognitive architecture has to be sacrificed to get better context window. What I want is full cognitive ability even if context window is small, and use obsidian as brain to give permanent and working memory." - Key insight: **Don't make model dumber to get bigger context. Keep it smart, externalize memory to Obsidian.**
6. **Final intent:** "If reasoning, math, accuracy and complexity handling is good enough i can just use it as my primary ai. No need for it to do librarians job for other ai's" - Two modes:
   - **Mode A Librarian:** Obsidian brain supplies context to cloud frontier AIs via bridge.
   - **Mode B Primary:** Local model itself is thinker, using Obsidian as its memory.
7. **Naming & integration:** "Let's name app AI ASSistant, it will be exactly like claude, some models can do things other models can't, app should have all options so if i change model it should be able to do it. This app will be the one connected to obsidian."
8. **Latest clarification (this chat):** "Meh, it can all the access. It is a local ai after all. It is no problem. The app will be the driver of vault, and the browser extension, vault will organize and keep the memory, extension will take data and suggest contexts/prompts/files to give to the new ai session. The app will be like claude, where i can chat, command, and do everything claude app can do, it will use vault as its memory and organize memory in the way we decided. It will ask me things too."

## 5. Final Architecture - Driver / Vault / Extension

**You said:** App is driver, Vault organizes, Extension collects + suggests.

```
You browsing any site + chatting any AI (ChatGPT, Claude, Gemini, DeepSeek, Grok, Other)
  ↕
[Browser Extension] - sensor + context suggester
  - Captures submitted AI chats + readable page text from allowed sites
  - Records visit trail URL/title/time
  ↕ (local loopback, not internet)
[AI ASSistant Windows App] - THE DRIVER
  - Controls permissions, privacy, action-log, undo
  - Chat UI exactly like Claude, model-aware capabilities
  - Context builder & retriever, review queue, journals, follow-ups
  ↕
[Obsidian Vault AI-Brain/] - CANONICAL MEMORY, readable Markdown
  + .brain/index.sqlite - rebuildable index only, NOT source of truth
  ↕
When you chat in AI ASSistant OR on claude.ai/chatgpt.com via extension:
  Vault finds relevant memories → shows you exact bundle → injects into that AI's finite context
  AI sees only bundle, not whole vault. Full vault stays local.
```

**Six layers (authoritative):**
1. Authorized sources: AI websites, browser pages, laptop folders/apps, imports, user input
2. Visible permission, privacy, action-log, undo layer - separates local capture from external send
3. Context builder and retriever - finds only relevant, current, source-linked passages for selected model
4. Temporal personal memory graph - claims, events, people, projects, routines, preferences, evidence, time
5. Review, follow-up, maintenance - questions only when needed, dry-run audits, archive/forget/delete controls
6. Obsidian Markdown source vault + rebuildable local search index

## 6. Vault Map - Final

```
AI-Brain/
├── 00 System/
│   ├── START HERE.md
│   ├── AI ASSistant Blueprint.md (this master plan is source)
│   ├── User Setup Defaults.md
│   ├── Memory Schema.md
│   ├── Privacy & Access.md
│   ├── Source Capture Map.md
│   ├── Model Registry.md
│   ├── Claude Feature Audit.md
│   ├── Git, Backup & Recovery.md
│   ├── Templates/
│   │   ├── Conversation Source.md
│   │   ├── Browser Visit.json.md
│   │   ├── Laptop File Reference.md
│   │   ├── Entity.md
│   │   ├── Event.md
│   │   ├── Memory Claim.md
│   │   ├── Daily Journal.md
│   │   ├── Follow-up.md
│   │   ├── Sharing Receipt.md
│   │   ├── Source Scope.md
│   │   └── Monthly Audit.md
│   └── Connectors/ # provider/source setup notes
├── 01 Inbox/
│   ├── New Imports/
│   └── Processing Errors/
├── 02 Sources/ # ORIGINALS - never silently rewrite
│   ├── Conversations/<provider>/<year>/<source-id>.md
│   │   ├── ChatGPT/, Claude/, Gemini/, DeepSeek/, Grok/, Other/
│   ├── Browser Activity/<year>/<month>.jsonl # URL/title/time
│   ├── Web Pages/<year>/<source-id>.md
│   ├── Laptop Files/<source-id>.md # pointer, original stays in place
│   ├── Imports/
│   └── Attachments/
├── 03 Memory/
│   ├── Entities/<stable-id>.md # person, project, topic, routine - dynamic, not predefined folders
│   ├── Events/<date>-<stable-id>.md
│   └── Connections/ # explicit evidenced relationships
├── 04 Working Memory/
│   ├── Current Snapshot.md # short-lived, timestamped overview of NOW
│   ├── Open Loops.md
│   └── Active/<entity-id>.md
├── 05 Knowledge/ # reusable synthesis linked to evidence
├── 06 Review/
│   ├── Questions.md
│   ├── Conflicts.md
│   ├── Keep-or-Forget.md
│   ├── Cleanup.md
│   └── Monthly Audits/ # only after user starts audit
├── 07 Sharing Receipts/ # exact one-send approvals kept local
├── 08 Journal/<year>/<date>.md # Asia/Dhaka, event time vs capture time
├── 09 Activity & Undo/<year>/<month>.md
├── 90 Archive/ # inactive derived notes, not source deletion
│   └── Design History/ # old plans for traceability only
└── .brain/ # rebuildable index.sqlite + cache, not source of truth
```

Folders are broad layers, not rigid life taxonomy. Create entity when meaningful; don't predefine folder for every topic.

## 7. Memory Schema & Evidence

Each claim small enough to correct independently. Lives as section on entity/event note by default; don't create thousands of tiny files.

**Fields:**
```yaml
id: stable-unique-id
entity: "[[entity-id]]"
type: fact | preference | event | decision | goal | routine | task | observation | hypothesis
status: candidate | confirmed | disputed | superseded | expired | archived
evidence: user-stated | user-confirmed | assistant-suggestion | observed-pattern | hypothesis
source: "[[provider-conversation-id]]"
source_message: message-id-or-passage
captured_at: 2026-10-10T12:00:00+06:00
occurred_at: optional-date
time_valid_from: optional-date
time_valid_to: optional-date
importance: low | normal | high | pinned
sensitivity: ordinary | sensitive | local-only
retention: current | time-limited | keep-until-user-deletes
confidence: high|normal|low
related: ["[[other-entity]]"]
```

**Status meaning:**
- confirmed: note faithfully represents evidence (user said it, not world-verified)
- candidate: uncertain extraction, use only when genuinely uncertain
- disputed: same-time conflict unresolved
- superseded: newer dated evidence changed current value, preserve history
- expired: no longer current, retain history
- archived: inactive derived note outside active view

**Evidence labels:**
- user-stated: directly stated by you
- user-confirmed: you explicitly accepted/corrected interpretation
- assistant-suggestion: AI-generated, not personal fact unless adopted
- observed-pattern: repeated dated evidence, not causal
- hypothesis: interpretation, never fact until confirmed

**Rules:**
- Every important claim/link carries source + dates. Link does not imply causation.
- Newer fact may supersede current state while older history remains. Change across dates is not automatically conflict.
- Do not silently retrain model weights. Learning = external inspectable source-linked memory + reversible preference updates.

## 8. Browser & Laptop Collection - The Main Sensor

**Your stance:** "Meh, it can all the access. It is a local ai after all. It is no problem." + Latest: "by default check everything, if unaccessible, just say wasn't accessible, no need to ask unless i give instructions to collect something (like a option where i put in a url and it won't check any data from that url ever again)."

You are willing to grant broad access. App must still make it explicit, visible, revocable, pausable, with activity log, and honest about actual coverage.

**Default Capture Policy (your latest rule):**
- **Default = check everything.** Extension attempts to capture from any site + any AI you use.
- **If inaccessible:** Don't prompt or block. Just log in `09 Activity & Undo/` and `01 Inbox/Processing Errors/` as `wasn't accessible - [reason: permission blocked / layout changed / private window / paywall]`, with URL/title/time. Continue silently.
- **No need to ask** unless you explicitly give instruction to collect something special.
- **Never-Check Blacklist:** User setting where you paste URL / domain / pattern and it will never check any data from that URL ever again. Example: `bank.com/*`, `https://private.example.com/page`. Stored in `00 System/Privacy & Access.md` + `00 System/Connectors/Source Scope.md` as `excluded_patterns: []`. Revocable, editable list. This is opposite of allowlist - default allow, explicit deny.
- **Explicit collect instruction:** Option where you can right-click / use command palette "Collect this page now" or paste URL to force capture even if previously failed.

**Two streams (Chrome APIs):**

1. **Browser Trail (broad, low-content):** If you grant history permission, record URL, title, visit timestamp across sites you choose. Evidence of visit, NOT proof you read/agreed/did it. Requires `history` permission. [History API]

2. **Page / AI Chat Content (higher-content):** Site adapters via content scripts read accessible DOM after permission. Need host access, can break when sites change. [Content scripts] [Optional permissions]
   - **AI conversation content:** Capture submitted messages on supported provider sites after permission. Retain provider, title, ID, timestamps, roles, message IDs, text, attachment refs, capture completeness. Don't claim historical account export if unavailable. Save raw locally, deduplicate, keep edits/regenerations as versions. If fails, log as wasn't accessible per default policy, offer import/share fallback in Review queue but don't popup-ask.
   - **Readable web content:** Separately capture readable text only from allowed sites/pages (default all, minus blacklist), store source note + exact capture metadata.
   - **Laptop files:** Watch/read only explicitly enabled locations/formats. Keep originals in place, capture source note/pointer + relevant extracted text, not duplicate whole disk.
   - **Other apps:** Tested app/API connector or explicit import/share fallback. Don't claim universal access.

**Extension Context UX - Like Capsule Hub by Tilantra + Quillbot (your latest rule):**
- **Capsule Hub model:** Capsule Hub is "context-transfer layer for modern AI workflows. Capture once, reuse everywhere." [Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/capsule-hub-by-tilantra/) Turns conversations into reusable "Capsules" so you never restate goals/constraints/background. You want same:
  - **Capture your context** — in any supported AI chat, click Capture to save core details into a Capsule (goals, decisions, constraints, attachments).
  - **Organise** — file Capsules into folders (project-based, not team folders for you).
  - **Drag and drop to inject** — drag Capsule from library into any AI chat box. Assistant picks up background/goals/constraints/attachments.
  - **Keep context updated** — add new version to existing Capsule, rollback/branch from any version.
  - **Transfer attachments** — carry files you uploaded/generated across tools, not just text.
  - **Supported tools for you:** ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok, Copilot, plus any site via generic readable capture (your broader scope than Capsule Hub's limited list).
  - **Prompt enhancer:** "Cook This Prompt" equivalent - enhance current prompt with relevant vault context.
- **Quillbot model:** Quillbot "works in background, ready when you need it. Write in any text field across web, then highlight text or open toolbar to get instant suggestions." [Chrome Web Store](https://chromewebstore.google.com/detail/quillbot-ai-writing-assis/iidnbdjijdkbmajdffnidomddglmieko?hl=en) You want same:
  - Real-time suggestions as you type in any text field across web.
  - Highlight text or open toolbar to get instant context suggestions from vault.
  - Fix, rephrase, humanize, generate new text using vault context.
  - Works directly where you write, no copy/paste/switch tabs.
  - Inline dropdown list of suggestions (like Quillbot's Suggest Text) - e.g., typing in Claude chat shows "Use capsule: Website project - blue-white design" or "Add memory: You prefer step-by-step".
- **Your combined requirement:** Extension provides contexts like Capsule Hub (capsule library + drag-drop inject + versioning) AND like Quillbot (inline toolbar, highlight to get suggestions, real-time writing assistance using vault memories). No external account required (unlike Capsule Hub requiring free account) - everything local.

**Safety boundaries (even with broad access):**
- Never collect passwords, cookies, auth tokens, payment fields, unsent form/composer contents, hidden keystrokes. No keylogger or continuous screenshot recorder. Incognito/private capture off unless separately configured with clear permission.
- Treat page/file contents as untrusted data; embedded instructions cannot override user policy or trigger commands.
- Protect credentials, never expose to model or remote unnecessarily.
- On Android native apps: cannot connect in background - tap Copy my context and paste.

## 9. Automatic Capture & Organization

**Your correction:** Don't ask "save this?" for each useful item. Use your template.

- After source/scope authorized once, automatically preserve original and process ordinary directly supported material using templates.
- Automatically create/update source-linked entities, dated events, claims, decisions, goals, tasks, preferences, routines, open loops, journal drafts when evidence supports.
- **Do not interrupt for every note.** Use review queue for real uncertainty: unclear meaning, important inferred relationship, same-time conflict, high-impact ambiguity, decision that changes your data/commitments.
- Sensitive info may be retained locally from authorized source, clearly marked sensitive. Must not be sent externally without exact-content/destination preview + one-send approval.
- Routine vault writes logged, source-linked, non-destructive, versioned, undoable. Never silently rewrite originals, delete source material, run arbitrary commands, post/send messages, make irreversible changes.
- Failure must be shown as failure, not saved note. Provide retry/import/share fallback.

## 10. Retrieval & How Models Access Data

**Your question:** "How will these ai models access data i saved?"

**Answer:** They won't open archive directly. Extension + App act as messenger.

When you ask a question:
1. Search exact terms + semantic meaning in local rebuildable index (.brain/)
2. Follow only small number of relevant links (person/project/event/routine/topic)
3. Rank by relevance, current validity, importance, recency
4. Include source links + label user-stated / observed / hypothesis
5. Omit unrelated, expired, unavailable
6. Keep current-chat context separate from long-term vault memory
7. Show exact context + destination before remote send; sensitive excerpts require one-send approval

Selected model controls which model-specific options available. `Model Registry.md` tracks tested support for tool calls, images, files, audio, structured output, search, context limits. When you switch models, refresh UI to show every verified supported option and clearly disable unsupported ones. Don't claim model can access Obsidian/browser/laptop data unless AI ASSistant provides permitted connector/tool.

App must not say it cannot remember messages present in current conversation. If personal fact absent from both current chat + authorized memory, say unknown; don't infer name from Windows account/path. Arena.ai chats not imported automatically.

**Doesn't make context window infinite.** Vault can be huge, but each AI still receives selected bundle, not entire archive. Like person recalling right parts of long history.

## 11. Model-Aware & Claude Parity

- **Claude layout:** Copy Claude's chat layout exactly - compact history left, centered transcript, right-aligned user bubbles, plain assistant replies, bottom composer. Memory opens in side panel so it doesn't squeeze conversation. Dark default. This is native WPF implementation, not Claude product or exact branded copy.
- **Feature parity:** You said "with all the features and everything." Create concrete feature-by-feature inventory in `Claude Feature Audit.md` against Claude experience you mean. Don't silently narrow to message layout, don't claim parity while rows untested.
- **UI parity vs intelligence:** Separate. Local model can use Claude-like screen, but small local model cannot be promised to equal Claude. Explain quality/speed/hardware trade-offs plainly.
- **Model-dependent options:** Different models have different capabilities. App should expose every verified option available to selected model + authorized connectors; when model changes, update available controls. Track exact model ID/version, local/remote destination, tool calls, vision, files, audio, structured output, search, context limits, tested limitations. Hide/disable unsupported honestly. Don't silently switch to remote if chosen local can't do something.
- **Local-first:** Ollama is separately installed local runtime, not bundled. Local by default. No cloud model or external transfer without explicit request/approval. If sensitive context ever sent externally, preview exact text + destination + require approval for that send.

## 12. Journals, Open Loops, Check-ins, Monthly Audit

**Journals:**
- Create dated journal at `08 Journal/<year>/<Asia-Dhaka-date>.md` from captured/authorized sources + answers you give.
- Preserve event time separately from capture time. Link sources. Distinguish direct user statement, source observation, summary, hypothesis. Never invent offline events/feelings.
- Today view surfaces Current Snapshot, today's journal draft, due user-approved follow-ups, one useful next action. Other areas: Journal, Ask AI, Review, Explore, Connections/Settings. Keep advanced controls out of everyday path.

**Open Loops & Follow-ups (app asks you too):**
- Follow-up record: topic, last_update, next_check, cadence, sensitivity, status.
- Example: "Yesterday you mentioned fever. Would you like to update how you are today?" Options: better/same/worse/add detail/skip/snooze/don't ask about this. If skipped, leaves unresolved, not decided recovered.
- End-of-day reminder is opt-in. If enabled, show answer/skip/snooze/stop. Skipping leaves thread unresolved; silence is not resolution.
- User chooses cadence for sensitive topics. For trauma/heartbreak/health, ask before recurring check-ins and obey pause/stop.
- Never infer resolution from silence. Provide cadence controls.

**Monthly Audit:**
- User-triggered only, not background. Show reminder "Run 2-month memory review?" Reminder is not permission.
- When explicitly started: examines last 60 days new/changed memories + only older memories linked to those items. Checks newer info that may correct/supersede old claims, apparent conflicts against dates, revisits proposed connections without turning correlation into causation, flags duplicates, unsupported interpretations, stale summaries, temporary items no longer current.
- Produces concise source-linked report with suggested actions + open questions. Dry run. Can propose correct, supersede, merge, confirm connection, keep as hypothesis, archive, keep temporarily, forget derived memory, delete source too. Nothing applied until you approve individual proposals or explicitly approve batch. Sensitive memories stay local during review.
- Show dashboard grouped by what is using space (transcripts, media, index/cache, derived notes) and rank review candidates by likely value/risk: exact duplicates, large attachments, redundant derived summaries, superseded current notes, weakly supported claims, stale temporary state, orphaned records. Show counts, sizes, reasons, links, let you decide in batches. Low access frequency alone is not reason to delete - rarely used may still matter later.

**Four distinct retention actions - keep separate:**
- **Archive:** remove derived note from active view, keep locally searchable on request
- **Expire currentness:** stop treating temporary state as current, preserve dated history + source
- **Forget derived memory:** remove extracted item from active retrieval + indexes, retain original transcript
- **Delete source too:** after separate confirmation, remove transcript + attachments/index entries under backup-retention policy

Never auto-delete old or rarely accessed transcripts. Old transcripts not deletion candidates.

## 13. Privacy, Git, Backups, Activity Log

- Local processing/storage default; SQLite is only rebuildable index. Markdown + source files canonical. Obsidian stores notes as local Markdown files.
- Local Git commit = local version history OK. Remote Git push/cloud sync = external send. Review + approve destination/content first. Never upload private vault data automatically.
- No full-disk encryption assumed. Protect Windows account/device and back up only to destination user trusts.
- Keep local activity/undo history: what was captured, created, changed, skipped, failed, externally sent. In `09 Activity & Undo/<year>/<month>.md`
- Keep sharing receipts in `07 Sharing Receipts/` - what was approved and sent, to which provider, when.
- Sensitive info local by default: health, mental health, relationships, trauma, sexuality, finances, identifying details marked sensitive/local-only.

## 14. Learning & Behavior

- Learning = updating external inspectable memory, not secretly retraining model weights after every chat.
- Learn from: things you explicitly say about yourself/goals/preferences/experiences, corrections you make, which suggestions/context you accept/reject/edit/repeatedly ask not to include, outcomes you later report (routine/plan worked).
- Single click/choice is weak evidence. Repeated behavior can create candidate preference/pattern with dates + examples. Example: "You have asked for shorter explanation several times; should I remember as preference?" If uncertain/sensitive, ask before promoting. Corrections update future behavior only after memory accepted or clearly confirmed.
- Cannot know unshared offline behavior or activity inside unconnected app. Calendar, fitness, phone, or other activity data require separate explicit opt-in connection.
- Journal entries dated and sourced: distinguish event time from capture time, user-reported details from AI-generated summaries, confirmed facts from hypotheses. Never fill gaps with invented events/feelings.
- Daily check-ins require opt-in: ask once during setup whether to enable end-of-day reminder and at what time. Reminder is not permission to inspect unconnected activity. Generate check-in when you open/accept it.

## 15. Current Known State & Gaps (Honest)

**Facts, not requirements:**
- OS: Windows 11, ASUS TUF A15, 8GB RAM, 4GB VRAM RTX 3050, ~500GB storage, slow downloads concern.
- Ollama installed, qwen2.5:3b downloaded.
- Existing WPF app (v6) stores data in SQLite at `%LOCALAPPDATA%\SecondBrain\brain.sqlite3`, named Second Brain, manual Save as memory, not connected to Obsidian, not Claude parity, no automatic laptop/browser collection, no journal generator, no follow-up scheduler, no monthly cross-check, no voice/web search/remote keys/image understanding/connectors/artifact canvases/sync/installer.
- Recent tests: qwen2.5:3b misreading "slow" as "Solow", generic responses, incorrectly claiming it could not remember messages in same chat.
- v7 source ZIP and personal Obsidian starter vault ZIP (61 files) exist, but neither is completed app. Vault ZIP only creates structure/templates, doesn't connect app, doesn't provide Claude model, doesn't auto-monitor laptop.
- Latest Obsidian vault includes `00 System/Claude Feature Audit.md` as tracker only, not implementation.

**This target system is not built yet.**

## 16. Execution Plan - Phased Build Order

**Phase 1 - Foundation:**
- Create local vault from this master plan, memory policy, backup, sample synthetic data.
- Implement `.brain/index.sqlite` rebuildable from Markdown.
- Define Model Registry format, Source Capture Map, Privacy & Access.

**Phase 2 - Common Source Format:**
- Import/save conversations from any provider into `02 Sources/Conversations/<provider>/<year>/<id>.md`, preserve originals, test duplicate handling.
- Preserve provider, title, ID, timestamps, roles, message IDs, text, attachment refs, capture completeness.

**Phase 3 - Local Search & Graph:**
- Add SQLite full-text search, then entities, events, dates, links, provenance. Keep indexes rebuildable.
- Implement Memory Schema validation, evidence labeling, status lifecycle.

**Phase 4 - Functional Interface Early (AI ASSistant Driver):**
- Build app shell with Today, Journal, Ask AI, Review, Explore, Connections & settings. WPF/XAML, dark default, light/dark switch, Windows controls visible.
- Must work without opening Obsidian or terminal. Obsidian remains available for direct inspection.
- Copy Claude chat layout exactly: left history, centered transcript, right user bubbles, plain assistant replies, bottom composer, memory side panel.
- Implement model selector, Ollama local runtime detection, stream answers, stop generation, attach local text/code files, copy/export conversation.

**Phase 5 - Journals & Follow-ups:**
- Generate dated journal drafts from captured sources, opt-in check-ins, due follow-up threads, skip/snooze/stop controls, source links.
- Implement Open Loops.md, Current Snapshot.md auto-refresh, event vs capture time.

**Phase 6 - Review Workflow:**
- Candidate approvals, uncertainty questions, conflict handling, user-triggered monthly audit (60-day scope + linked older), storage dashboard, retention choices (archive/expire/forget/delete distinct), undo.

**Phase 7 - Context Builder:**
- Retrieve relevant memories, label hypotheses, enforce per-send sensitive approval, save sharing receipts in `07 Sharing Receipts/`.
- Show exact context + destination before remote send. Sensitive excerpts blocked until approved for that specific provider and send.
- Keep current-chat context separate from long-term vault memory.

**Phase 8 - Browser Extension (Main Sensor):**
- First: capture full submitted AI conversations on enabled AI sites (ChatGPT, Claude, Gemini, DeepSeek, Grok, Other) after permission.
- Then: add broad visit metadata (URL/title/time) if you grant history permission.
- Then: optionally add readable page-content capture from allowed sites.
- Keep each site adapter tested and separate. Never collect passwords, cookies, tokens, payment fields, unsent drafts, incognito data by default. Broad site access explained, granted explicitly, revocable, pausable.
- Extension suggests contexts/prompts/files to give to new AI session.

**Phase 9 - Provider Routing:**
- Connect each AI website/client through same local context API; add future providers by adapter, with import/copy fallback where direct integration impossible.
- Local service binds to loopback, not exposed to public internet/local network by default. No provider API keys in extension unless genuinely required.
- Support model-dependent capabilities: expose every verified option for selected model, hide/disable unsupported, update controls when model changes.

**Phase 10 - Maintenance & Rollout:**
- Backups, archive/delete controls, broken-link checks, optional calendar/mobile sources, user-triggered monthly audit.
- Test in shadow mode first: capture only sources you enabled, show journal drafts/follow-ups/context, require approval before memory changes or external sends.
- Build Windows installer, model manager UI (download/select model weights after installing Ollama once, app can launch `ollama serve` automatically).

## 17. Acceptance Checklist - Are We Doing It Right?

Use this to verify, not loose approximation:

- [ ] App named AI ASSistant, native Windows desktop, title bar visible, dark default + visible persistent light/dark switch
- [ ] Claude's chat layout copied exactly, not loosely imitated
- [ ] Feature inventory exists for "all Claude features" - no parity claim without verification
- [ ] Obsidian genuinely integrated as canonical vault, SQLite only rebuildable index under `.brain/`
- [ ] App is driver of vault + extension, vault organizes, extension collects + suggests contexts/prompts/files
- [ ] Browser extension default = check everything, if inaccessible log "wasn't accessible" without asking
- [ ] Never-check blacklist exists: user can paste URL/domain pattern to never collect from ever again, editable in Privacy & Access
- [ ] Extension provides contexts like Capsule Hub: capture as Capsule, organize, drag-drop inject, version/branch, transfer attachments, prompt enhancer
- [ ] Extension provides contexts like Quillbot: real-time suggestions in any text field, highlight for suggestions, inline toolbar, works where you write
- [ ] Browser extension captures from any site you allow + all AI models you use, after one-time permission
- [ ] Visit metadata distinguished from readable content, visit not proof of reading/agreement
- [ ] Laptop file access explicitly scoped, visible, revocable, honest about actual coverage, originals stay in place
- [ ] Assistant automatically uses your template for authorized routine capture/organization, does not ask save every item
- [ ] Routine local changes inspectable and reversible with activity log + undo/version history
- [ ] Uncertainty, inferred relationships, same-time conflicts, high-impact ambiguity routed to review queue, not guessed
- [ ] Current-chat context not confused with long-term memory, no unsupported personal facts guessed, no name inferred
- [ ] Sensitive external sharing requires exact-content/destination preview + per-send approval, no blanket approval
- [ ] Original sources preserved until you choose deletion; archive, expire, forget-derived, delete-source remain distinct
- [ ] Journals dated Asia/Dhaka, event time vs capture time separated, source-linked, never invents offline events/feelings
- [ ] Today view surfaces Current Snapshot, today's journal draft, due follow-ups, one next action
- [ ] End-of-day prompts opt-in, offer answer/skip/snooze/stop, silence not resolution, user chooses cadence for sensitive topics
- [ ] Monthly cross-check user-triggered only, last 60 days + relevant linked older, dry-run, apply nothing until approved
- [ ] Cleanup never deletes original transcript because old or rarely retrieved; shows counts, sizes, reasons, links, batch decide
- [ ] Model-dependent options change when you switch models, unsupported disabled honestly, capability detection separate from model choice
- [ ] No claim local model equals Claude, quality/speed/hardware trade-offs explained plainly, qwen2.5:3b limits acknowledged
- [ ] No passwords/cookies/tokens/payment fields/unsent drafts/hidden keystrokes collected, no keylogger/screenshot recorder, incognito off unless separately configured
- [ ] Local processing/storage default, Git local commit OK, remote push is external upload with approval, backup only to trusted destination
- [ ] Guidance delivered one simple step at a time, beginner-friendly, wait for result
- [ ] Full transcript survives summaries unchanged, duplicate handling works, failed adapter never reports false success
- [ ] Index and context rebuildable after cache deletion

## 18. What NOT To Do - Common Pitfalls From Handover

- Don't claim feature implemented because it appears in plan, README, checklist, ZIP. Mark planned / in source / compiled / tested by user / not done.
- Don't ask user to repeat requirements already recorded here. Ask only genuinely missing info, one question at a time.
- Don't ask user to install/rebuild unused v7 archive unless they explicitly decide.
- Don't build complete Obsidian clone unless direct integration demonstrably blocked and user approves fallback.
- Don't leave separate SQLite store as equally authoritative memory.
- Don't claim universal access to every app/hidden state/private windows/offline life.
- Don't silently retrain model weights or silently assume behavioral preferences.
- Don't infer name from Windows account/path.
- Don't treat Arena.ai chats as automatically imported.
- Don't invent personal facts, offline events, feelings, schedules.
- Don't call third-party installer safe without verification.
- Don't promise larger model will run well on 8GB RAM / 4GB VRAM without checking.
- Don't make app require browsing raw vault files or running commands.
- Don't automatically push private vault data to remote Git host.

## 19. Original Files Consolidated

This master file consolidates:
- README.md - Second Brain for Windows native desktop preview, SQLite operational truth, honest current status
- Memory Schema.md - dynamic graph, allowed values, status/evidence meaning, structure rules
- AI ASSistant Blueprint.md - authoritative plan, 6 layers, final vault map, automatic capture, evidence/time, retrieval, browser/laptop sources, journals, audit, privacy
- AI_Brain_Build_Plan.md - provider-agnostic second brain, vault structure, memory record fields, core policies, journal/follow-up format, provider integration model, build order, acceptance tests
- REQUIREMENTS.md - product goal, Claude layout/features, Obsidian real integration, automatic assistance + template, laptop/browser collection, local AI/memory/privacy/capability limits, memory integrity/review, journals/follow-ups, beginner guidance/hardware, current gaps, approved architecture direction, acceptance checklist
- HANDOVER.md - instructions for whoever takes over, executive summary, current decisions, personal setup facts, honest status of ZIPs, manifest of starter vault (61 files)
- Untitled document.md - conversation evolution: prompt helper vs full brain, context window vs cognitive architecture tradeoff, hardware limits, Mode A vs Mode B, app as driver

**Template availability:** Original agreed vault structure, memory fields, evidence labels, lifecycle rules, journal/follow-up format, acceptance tests are in AI_Brain_Build_Plan.md and preserved in personal Obsidian ZIP as historical reference. Use as baseline, refine to honor later decisions (automatic routine capture, broad browser access, model-dependent options, Claude exact layout).

---

## 20. Default Policy & Extension UX - Latest Clarifications

**From you 2026-10-10:**
- Default check everything, if unaccessible just say wasn't accessible, no need to ask unless you give instructions to collect something
- Option where you put in URL and it won't check any data from that URL ever again (blacklist)
- Extension should provide contexts like Capsule Hub by Tilantra or Quillbot test suggestions

**Implementation:**
- Default allow, explicit deny via blacklist in `00 System/Privacy & Access.md`
- Log failures silently in Activity & Undo + Processing Errors, don't popup-ask
- Capsule Hub pattern: capture once as Capsule (goals, constraints, background, attachments), library, drag-drop inject into any AI chat, version/branch/rollback, prompt enhancer "Cook This Prompt"
- Quillbot pattern: background assistant ready when needed, works in any text field across web, highlight for instant suggestions, toolbar, real-time writing suggestions using vault, no tab switching

## 21. One-Line Verification

If someone asks "are we doing it right?", check: **Is AI ASSistant a native Windows Claude-like app that is the driver, is Obsidian the real readable vault that organizes everything per this schema, does the extension by default check everything (log "wasn't accessible" if fails, no asking) + respect never-check blacklist, does it provide contexts like Capsule Hub (drag-drop capsules) + Quillbot (inline suggestions), does it automatically capture using your template without asking save each time, does it ask you only when genuinely uncertain, and does it keep everything local by default with explicit approval for any external send?** If yes, you are doing it right. If any part is SQLite-only, manual save only, or claims universal access without honest scope, you are not.

