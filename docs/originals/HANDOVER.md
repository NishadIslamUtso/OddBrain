# AI ASSistant — Complete Project Handover

**Prepared:** 2026-10-10 (Asia/Dhaka)  
**Purpose:** Give a future assistant/developer enough context to continue this project without relying on the current assistant's memory.  
**Important:** This is a handover record, not proof that the app is finished. It intentionally separates requirements, written plans, prototypes, and actually tested behavior.

---

## 0. Instructions for whoever takes over

Read this file before changing code or asking the user to repeat information. The user has repeatedly had to correct the assistant for treating a loose approximation as completion. Do not do that again.

- Treat the newest user decisions in this file as authoritative. The detailed original memory plan is preserved in Appendix A; it supplies the agreed structure and policies, but older wording that conflicts with later user choices is superseded by the **Current Decisions** below.
- Do not claim a feature is implemented because it appears in a plan, README, checklist, or ZIP. Mark it **planned**, **in source**, **compiled**, **tested by the user**, or **not done** accurately.
- Do not ask the user to repeat project requirements already recorded here. Ask only for genuinely missing information, one question at a time.
- Give computer instructions in beginner-friendly language, **one simple step at a time**, then wait for the user's result.
- Do not ask the user to install/rebuild the unused v7 archive unless they explicitly decide to test it.
- The user wants an app and memory system personalized to them, not a generic scaffold. Do not invent personal facts or assume the user's name.

## 1. Executive summary

The user wants a native Windows app named **AI ASSistant**. Its chat page must copy Claude's layout exactly and target all Claude features the user expects. It should connect to the **real Obsidian vault** as its canonical, local memory store—not rebuild Obsidian and not maintain a competing authoritative SQLite memory database. The assistant should automatically collect and organize information from sources the user authorizes, using the agreed template, without requiring a “save this” action for every memory. Model capabilities should change dynamically when the user selects a different model.

The user's privacy preference is local-first. They are willing to grant broad browser/laptop access, but the system must honestly show what it can access, be pausable/revocable, log/undo routine changes, protect credentials, and require approval for destructive or external actions. Sensitive context must not be sent to a remote model without showing exact text/destination and getting approval for that send.

**This target system is not built yet.** The user's Windows PC has the v6 WPF prototype running with Ollama and `qwen2.5:3b`. The app is still named Second Brain, stores its own data in SQLite, has manual memory saving, and is not connected to Obsidian. Its local model gave weak answers. A v7 source ZIP and a personal Obsidian starter vault exist, but neither is the completed app.

## 2. Current decisions and requirements

### Product and app name

- Exact requested product name: **AI ASSistant** (preserve the user's unusual capitalization).
- Deliver a real Windows desktop app, not a browser page presented as the final product.
- Keep the window fully on-screen with Windows title bar and close controls visible.
- Dark appearance by default; visible light/dark switch; remember the choice.
- Make the everyday app polished, proactive, and simple. The user should not have to manage databases, folders, or backend settings.

### Claude layout and feature target

- Copy Claude's chat layout **exactly**, not merely use a custom design “inspired by” Claude.
- The user said “with all the features and everything.” Create a concrete feature-by-feature inventory against the Claude experience they mean; do not silently narrow that request to the message layout, and do not claim parity while important rows are untested.
- UI parity and model intelligence are separate. A local model can use a Claude-like screen, but a small local model cannot be promised to equal Claude.
- The latest Obsidian vault includes `00 System/Claude Feature Audit.md` as a tracker only. It is **not** implementation of those features.

### Model-dependent capabilities

- Different models have different capabilities. AI ASSistant should expose every verified option available to the selected model and its authorized connectors; when the model changes, update the available controls.
- Track exact model ID/version, local/remote destination, tool calls, vision, files, audio, structured output, search, context limits, and tested limitations.
- Hide/disable unsupported options honestly. Do not silently switch to a remote model if the chosen local model cannot do something.
- A model cannot read Obsidian/browser/laptop data merely because it can talk about it; the app must provide a permitted connector/tool.
- Local/cloud use: local by default. No cloud model or external transfer without the user's explicit request/approval.

### Obsidian is the selected memory architecture

- The user explicitly decided: **AI ASSistant will connect to Obsidian.** Obsidian's actual Markdown vault is the canonical memory store.
- Do not build a complete Obsidian clone unless direct integration is demonstrably blocked and the user approves that fallback.
- Do not leave a separate SQLite store as an equally authoritative memory system. A local SQLite full-text/semantic index under `.brain/` is acceptable only if rebuildable from the Markdown vault.
- Git may be used for local history. A remote Git push/cloud sync is an external upload and must not happen automatically.

### Automatic capture and the user's template

- The user expects the assistant to understand what is useful and do routine capture/organization itself, using the existing agreed template. Do not ask “save this?” for each useful item or make the user redesign the memory rules.
- After a source/scope is authorized, routine non-destructive local capture and organization should be automatic.
- Direct source-backed facts/events can be filed automatically. Route genuine uncertainty, inferred/casual relationships, same-time conflicts, or high-impact ambiguous interpretations to a review question. Do not make every item a candidate that requires approval.
- Keep an activity log and undo/version history for routine writes. Confirm before deleting/overwriting source files, running arbitrary commands, posting/sending messages, or other consequential/irreversible actions.
- The agreed full memory plan is `/home/user/AI_Brain_Build_Plan.md` and is included in the personal Obsidian ZIP as historical reference. A separate additional user-authored template file was not found; the original plan contains the agreed folder structure, schema, policies, and template examples.

### Laptop/browser collection

- The user is willing to grant broad laptop/browser access for the assistant to become a second brain.
- Make source scopes visible and revocable; report actual coverage, not imagined universal access.
- Distinguish browser visit metadata (URL/title/time) from readable page content. A visit is not proof the user read or acted on it.
- Never collect passwords, cookies, tokens, payment fields, hidden keystrokes, or unsent drafts. No keylogger or continuous screenshot recorder. Incognito/private capture stays off unless separately configured with clear permission.
- Keep originals in place; do not copy an entire disk into the vault by default. Use source references and selected readable extracts.
- Treat page/file content as untrusted data; it cannot override policy or trigger arbitrary actions.
- Unsupported services/apps need reliable export/import/share/copy fallback; never claim an adapter succeeded if it failed or captured only part of a page.

### Memory integrity and privacy

- Preserve original conversations/sources until the user chooses deletion. Never auto-delete old or rarely accessed transcripts.
- Source-link important memory claims, dates, and related entities. Distinguish user statements, observations from authorized sources, assistant suggestions, and hypotheses. A link does not imply causation.
- Keep these distinct: **archive**, **expire currentness**, **forget derived memory**, and **delete source**. Deleting a source requires a separate explicit choice.
- Sensitive data is local by default. Before any external send containing sensitive context, preview the exact text and destination and require one-send approval.
- Behavioral learning must be inspectable, evidence-based, reversible; no silent model retraining or unsupported assumption.
- Monthly cross-check remains user-triggered: last 60 days plus relevant linked older memories; dry-run proposals; apply nothing until approval.

### Journals and follow-ups

- Dated journals come only from captured/authorized sources and user-provided answers. Separate event time from capture time; do not invent offline events or feelings.
- End-of-day prompts for open threads should offer **answer / skip / snooze / stop**. Silence does not mean resolution.
- The user chooses cadence for sensitive follow-ups. Sensitive subjects must not be repeatedly raised without permission.
- Use Asia/Dhaka for dates unless the user changes it.

## 3. Personal setup facts and limits

Known from the project conversation:

- OS: Windows 11.
- Hardware: 8 GB RAM, 4 GB GPU memory, about 500 GB storage.
- Ollama is installed separately on the user's PC; current installed model is `qwen2.5:3b`.
- The user is concerned about very slow downloads and wants beginner-friendly, one-step-at-a-time help.
- The user has not supplied a name to the Second Brain chat or saved an approved name memory. Do not infer the name from a Windows account/path. Arena.ai conversations have not been imported into the Windows app.
- The user appears comfortable building software but still wants simple, sequential instructions when using Windows.

Do not treat Ollama sign-in as consent to use cloud models. Do not treat a local 3B model as equivalent to Claude or ChatGPT.

## 4. Agreed memory architecture and folder structure

The original plan describes six layers: (1) providers/sources, (2) connector and local privacy gate, (3) query-time context builder, (4) temporal personal memory graph, (5) review and maintenance, and (6) local source archive/Obsidian Markdown with rebuildable indexes. Obsidian is now selected as canonical storage; the app is expected to connect to it.

```text
AI-Brain/
├── 00 System/
│   ├── START HERE.md
│   ├── AI ASSistant Blueprint.md       # active, merged design
│   ├── User Setup Defaults.md          # only known user-provided setup facts
│   ├── Memory Schema.md                # fields, status/evidence meanings
│   ├── Privacy & Access.md             # source scope and action boundaries
│   ├── Source Capture Map.md            # source types and destinations
│   ├── Model Registry.md                # per-model tested capabilities
│   ├── Claude Feature Audit.md           # tracker, not implementation
│   ├── Git, Backup & Recovery.md
│   └── Templates/
├── 01 Inbox/
│   ├── New Imports/
│   └── Processing Errors/
├── 02 Sources/
│   ├── Conversations/<provider>/<year>/<source-id>.md
│   ├── Browser Activity/<year>/<month>.jsonl
│   ├── Web Pages/<year>/<source-id>.md
│   ├── Laptop Files/<source-id>.md       # pointer/metadata; original remains in place
│   ├── Imports/
│   └── Attachments/
├── 03 Memory/
│   ├── Entities/<stable-id>.md           # dynamic entity types, no rigid life taxonomy
│   ├── Events/<date>-<stable-id>.md
│   └── Connections/                      # explicit, evidenced relations
├── 04 Working Memory/
│   ├── Current Snapshot.md               # short-lived, timestamped view
│   ├── Open Loops.md
│   └── Active/<entity-id>.md
├── 05 Knowledge/                          # derived, source-linked synthesis
├── 06 Review/
│   ├── Questions.md
│   ├── Conflicts.md
│   ├── Keep-or-Forget.md
│   ├── Cleanup.md
│   ├── Monthly Audits/
│   └── AI ASSistant Acceptance Tests.md
├── 07 Sharing Receipts/                   # exact one-send approvals
├── 08 Journal/<year>/<Asia-Dhaka-date>.md
├── 09 Activity & Undo/<year>/<month>.md
├── 90 Archive/                            # inactive derived notes, not source deletion
│   └── Design History/                    # older plan, reference only
└── .brain/                                # rebuildable local index/cache, never source of truth
```

Core record fields: stable ID, entity link, type (`fact`, `preference`, `event`, `decision`, `goal`, `routine`, `task`, `observation`, `hypothesis`), status, evidence label, source/source passage, capture time, occurrence/validity dates, importance, sensitivity, retention, confidence, and related entities. Full details are in the active `Memory Schema.md` in the ZIP.

## 5. Journal, audits, review, and retrieval rules

### Journal

- One daily Markdown note per date, Asia/Dhaka.
- Include only captured/authorized material and user answers; link sources and indicate statement/observation/hypothesis.
- Keep plans, decisions, outcomes, routine changes, open follow-ups, and source links. Never invent offline activity.
- A daily check-in is opt-in and user-triggered by opening/accepting it; sensitive-topic cadence is chosen by the user.

### Follow-ups

A follow-up record contains topic, last update, next check, cadence, sensitivity, status, and source. If skipped, leave it unresolved. “Stop asking” must be respected. Do not invent dates or schedules for medication/exams/results.

### Monthly audit

User starts it. Scope is last 60 days plus relevant older linked memories. Check newer evidence, apparent conflicts against dates, duplicate/unsupported memories, stale snapshots, and temporary facts no longer current. Produce a dry-run proposal with source links; no changes until the user approves specific proposals or a batch.

### Retrieval

Search exact terms and semantic meaning; follow only relevant entity/event links; rank by relevance, current validity, importance, and recency; show source-linked facts/observations/hypotheses; exclude unrelated/expired material. Never load/send the entire archive by default. Sensitive external context requires exact-text/destination preview and per-send approval.

## 6. Current technical state — do not confuse target with prototype

### Installed on the user's PC

- The user has installed and run **v6** of the native WPF app. Screenshots showed a local model-ready status.
- The app still identifies itself as Second Brain, not AI ASSistant.
- Ollama was installed from the user-selected Uptodown download `ollama-0-40-2.exe` (reported size 1.46 GB). Windows Digital Signatures showed **“This digital signature is OK”**, signer **Ollama Inc.**, issuer DigiCert. This is a valid signature shown by Windows, not an independent audit of the third-party download source.
- The user signed in to Ollama and installed `qwen2.5:3b`.
- The user has not asked for cloud models; do not recommend them by default.

### Existing WPF source tree

Path: `/home/user/second-brain/desktop-windows/`

- `SecondBrain.Windows/MainWindow.xaml` — current WPF layout. It was modified for a cleaner transcript (user right-aligned, assistant plain text, fewer permanent labels/actions), but it is not established as an exact Claude clone.
- `SecondBrain.Windows/MainWindow.xaml.cs` — local chat/UI behavior and prompt. A v7 edit instructs the model to use current chat context and not make generic same-chat amnesia claims; a small model may still fail.
- `SecondBrain.Windows/Services/LocalStore.cs` — current app's authoritative SQLite store in `%LOCALAPPDATA%\SecondBrain\brain.sqlite3`. This conflicts with the new decision to make Obsidian canonical and must be architecturally addressed before claiming integration.
- `SecondBrain.Windows/Services/OllamaService.cs` — local Ollama adapter.
- `App.xaml`, `Themes/Dark.xaml`, `Themes/Light.xaml`, `Services/ThemeManager.cs` — v6 theme switching.
- `build-windows.bat` — .NET 8 Windows build script.
- `README.md` in this directory contains older claims that Obsidian is optional and SQLite is primary. Those are prototype status, not the latest requirement.

### Existing browser prototype

Path: `/home/user/second-brain/extension/` and `/home/user/second-brain/static/`.

- A legacy browser MVP and Chrome Manifest V3 bridge exist.
- The extension has optional `history` and optional host permissions; it is not a universal observer and Chrome runtime behavior remains unverified.
- The legacy dashboard stores SQLite and generated Markdown; its README says it does not watch Obsidian or perform bidirectional sync.
- Do not present the old extension/dashboard as the requested automatic full-laptop assistant.

### Build/validation limits

- Assistant workspace is Linux; `dotnet`, `msbuild`, and `csc` are unavailable. An earlier temporary .NET SDK attempt failed with “No space left on device.”
- The user built/ran v6 on Windows, but v7 has **not** been compiled or tested on Windows.
- Static XML/XAML parsing and some handler/resource checks were performed, but this is not a WPF compile/runtime test.

## 7. Key observed model failures

Screenshots from local tests showed `qwen2.5:3b`:

- misread “slow” as “Solow”;
- gave generic answers;
- said it could not remember earlier messages in the same chat.

Ollama was running; these results are consistent with a small-model capability limit and weak prompting, not proof the runtime failed. The app should have sent recent same-chat history; its generic amnesia response was still poor. The assistant should distinguish: **current chat**, **approved local memory**, and **other Arena.ai conversations not imported**. If asked for a name absent from the local chat/vault, say it is unknown; do not invent one.

## 8. Project history and artifacts

- Browser MVP and WPF v2–v5 were built earlier. User rejected v3/v4 appearance, requested dark mode and on-screen controls. v5 lacked a theme switch.
- v6 added persistent dark/light themes and was built/run by the user. Archive: `/home/user/SecondBrain-Windows-Desktop-Preview-v6.zip`; SHA-256 `041281fe8441c4cabbf8328c88e37fdb448f4438591396087285c37a8388b45c`.
- After the user complained the UI was not a direct Claude/ChatGPT clone, v7 source changes were made to the WPF transcript and prompt. Archive: `/home/user/SecondBrain-Windows-Chat-Preview-v7.zip`; SHA-256 `5987b2a8234325b2ac3b142853402286f0661a110949ccee75cbad07007f7b12`. **User rejected proceeding to rebuild at that moment; do not ask them to install it unless they choose to.**
- `/home/user/AI_Brain_Build_Plan.md` — original full, detailed provider-agnostic memory plan (310 lines), including six-layer design, exact `AI-Brain` structure, record schema, policies, retrieval, monthly audit, journal/follow-ups, connectors, build order, and tests.
- `/home/user/second-brain/REQUIREMENTS.md` — consolidated user requirements, updated with app name/model capability/Obsidian decisions. Treat it and this handover as current over older README claims.
- Latest personal Obsidian starter archive: `/home/user/AI_ASSistant_Personal_Obsidian_Vault.zip`; SHA-256 `650e5ffc13ea546333c49bbaa7346aa256205ba8c4e0d756eba31e65efc1f272`. At the time checked: 61 ZIP entries (60 Markdown files plus `.gitignore`); required paths present; 12 Markdown frontmatter blocks parsed successfully; original full plan preserved under `90 Archive/Design History/`.
- The personal Obsidian ZIP creates folders/templates only. It does not connect the WPF app or implement browser/laptop capture, model routing, or Claude feature parity.
- Earlier setup archives exist: `/home/user/AI_ASSistant_Obsidian_Setup.zip` and `/home/user/AI_ASSistant_Obsidian_Setup_v2.zip`. They are superseded by the personal vault ZIP; do not confuse them.

## 9. Where the authoritative files are

| File/path | Purpose / authority |
|---|---|
| `/home/user/second-brain/HANDOVER.md` | This durable handover; current state and all key decisions. |
| `/home/user/second-brain/REQUIREMENTS.md` | User-specific product requirements; current. |
| `/home/user/AI_Brain_Build_Plan.md` | Full original memory design; source baseline, older than the newest decisions. |
| `/home/user/AI_ASSistant_Personal_Obsidian_Vault/AI-Brain/00 System/AI ASSistant Blueprint.md` | Active merged vault blueprint used to create the latest starter. |
| `/home/user/AI_ASSistant_Personal_Obsidian_Vault/AI-Brain/00 System/Memory Schema.md` | Active schema/template rules. |
| `/home/user/AI_ASSistant_Personal_Obsidian_Vault.zip` | Latest Obsidian starter ZIP. |
| `/home/user/second-brain/desktop-windows/README.md` | Build info, but contains older architecture claims; do not treat as up-to-date requirements. |
| `/home/user/second-brain/desktop-windows/SecondBrain.Windows/MainWindow.xaml` | Current modified WPF UI source, not exact Claude parity. |
| `/home/user/second-brain/desktop-windows/SecondBrain.Windows/Services/LocalStore.cs` | Confirms SQLite remains current app store. |

## 10. Required next work (priority order)

1. **Freeze the requirement baseline.** Read this handover and `REQUIREMENTS.md`; do not ask the user to repeat them. Be clear what is planned vs built.
2. **Resolve the Obsidian integration architecture.** The app must connect to the real vault and Markdown must be canonical. Plan migration/export from current SQLite without deleting user data; the index may be rebuildable. Do not make destructive changes to the user's Windows database.
3. **Audit Claude's current interface/features.** Use the user's actual target/reference. Build a requirement-by-requirement comparison and identify local vs connector vs remote features. Do not claim exact/full parity until tested.
4. **Design the capability-aware model layer.** Per-model tested manifest; UI options update when switching; no silent cloud fallback; keep local default. Account for 8 GB RAM/4 GB VRAM and the `qwen2.5:3b` baseline.
5. **Implement automatic memory pipeline.** Authorized source → preserve original → parse/normalize → apply user template → auto-file routine supported claims/events → review truly uncertain/high-impact items → log/undo. No per-item “save memory” prompts.
6. **Add Obsidian connector and safe file handling.** Watch/read/write only configured vault; preserve user edits; resolve conflicts visibly; maintain source links and versions; rebuild index from Markdown.
7. **Implement authorized browser/laptop connectors.** Start with clear scopes, visible pause/revoke, exact collection logging, excluded secrets/drafts, and fallback imports. Never pretend broad permission yields access to every app.
8. **Implement working memory, journal, open loops, and reviews.** Asia/Dhaka dates; optional EOD prompts; answer/skip/snooze/stop; user-triggered 60-day audit; distinct retention actions.
9. **Validate on Windows.** Build with .NET 8 on the user's PC or a suitable Windows environment; test WPF behavior, Obsidian sync/conflicts, local Ollama, model switching, capture, and all safety controls with synthetic data first.
10. **Guide the user one step at a time.** Do not ask them to download multiple archives or reinstall Ollama/models without a reason. Protect their existing chats/memories.

## 11. Non-negotiable honesty checklist

Before telling the user something is “done,” identify the exact evidence:

- **Written:** requirement/template/docs exist.
- **Implemented:** code path exists.
- **Compiled:** actual Windows build succeeded.
- **Tested:** behavior was exercised with a clear result.
- **User-confirmed:** the user saw it running and accepts it.

A ZIP with Markdown templates only is **written/prepared**, not an integrated app. A button is not feature parity. A static XAML parse is not a Windows compile. A model capability entry is not capability detection until tested on that model. Do not overstate.

---

## Appendix A — Original full memory plan

The following is preserved verbatim from `/home/user/AI_Brain_Build_Plan.md` for continuity. Later decisions above supersede conflicting wording.

# Provider-Agnostic Local AI Second Brain

## Assignment understood

Build one private, local-first memory system that works across the AI services you use now and later. It should collect conversations, retain the originals until you delete them, turn useful information into source-linked memories, connect people/events/projects/routines across life, track what is current versus historical, ask you when uncertain, create a dated journal, follow up on open events when you opt in, and prepare only the relevant context for whichever AI you choose.

This is not merely an Obsidian folder template or a replacement chatbot. Obsidian is the readable local vault; the brain is the memory pipeline, graph, journal, search, review rules, user-facing app, and provider adapters around it. During development the backend can be rough; the finished system must have a polished interface so you do not have to browse raw folders, run commands, or hunt through settings.

## 1. The brain has six layers

```text
AI websites/apps and future providers
  ↕ per-provider connector, browser adapter, API/MCP adapter, or import/share fallback
Local privacy and consent gate
  ↕ previews every exact context bundle sent outside the laptop
Context builder and retriever
  ↕ selects relevant memories for the question; never loads the whole archive
Temporal personal memory graph
  ↕ claims, events, people, projects, routines, relationships, evidence and time
Review and memory-maintenance queue
  ↕ asks about contradictions, uncertainty, retention, and deletion
Local source archive + Obsidian Markdown + rebuildable search index
```

### What “all AIs” means in practice

The memory core and stored format are provider-independent. A new AI can be added without redesigning the vault. To capture or insert context automatically, each AI interface still needs a connector: a site-specific browser adapter, a supported API/MCP integration, or an explicit share/import/copy flow. There is no single universal interface that gives one extension automatic access to every current or future website and native app. Unsupported tools must still have a reliable manual fallback.

## 2. Recommended Obsidian vault structure

The folders are broad **layers**, not a list of life categories you must predefine. Football, drawing, a new person, a course, a health issue, or a hobby can be created as an entity when it becomes meaningful. The connections between notes—not a rigid category tree—make it a second brain.

```text
AI-Brain/
├── 00 System/
│   ├── Brain Policy.md             # privacy, retention, ask-before-assuming rules
│   ├── Memory Schema.md            # allowed record types and fields
│   ├── Providers.md                # enabled adapters and permission scopes
│   └── Prompts.md                  # extraction/retrieval instructions
├── 01 Inbox/
│   ├── New Imports/
│   └── Processing Errors/
├── 02 Sources/                     # originals; never silently rewritten
│   ├── Conversations/
│   │   ├── ChatGPT/<year>/<id>.md
│   │   ├── Claude/<year>/<id>.md
│   │   ├── Gemini/<year>/<id>.md
│   │   ├── DeepSeek/<year>/<id>.md
│   │   ├── Grok/<year>/<id>.md
│   │   └── Other/<provider>/<year>/<id>.md
│   ├── Browser Activity/<year>/<month>.jsonl # opted-in URL/title/visit events
│   ├── Imports/
│   └── Attachments/                # optional local images/files
├── 03 Memory/
│   ├── Entities/<stable-id>.md      # person, topic, project, course, routine, idea...
│   ├── Events/<date>-<stable-id>.md # dated experiences and life changes
│   └── Connections/                # optional explicit relationship notes
├── 04 Working Memory/
│   ├── Current Snapshot.md          # generated, time-stamped, short-lived overview
│   ├── Open Loops.md                # unresolved questions, commitments, next actions
│   └── Active/<entity-id>.md        # current state for active entities/projects/routines
├── 05 Knowledge/                    # reusable synthesis, always linked to sources
├── 06 Review/
│   ├── Questions.md                 # ask the user rather than guess
│   ├── Conflicts.md                 # possible contradictions with dates and sources
│   ├── Keep-or-Forget.md            # uncertain/possibly temporary memories
│   ├── Cleanup.md                   # duplicates, stale summaries, orphaned links
│   └── Monthly Audits/               # user-triggered reports and approved changes
├── 07 Sharing Receipts/             # what was approved and sent, to which provider, when
├── 08 Journal/<year>/<date>.md       # dated daily entries, drafts, check-ins, sources
├── 90 Archive/                      # inactive derived notes; not automatic source deletion
└── .brain/
    ├── index.sqlite                 # full-text/semantic index; rebuildable from files
    └── cache/                       # rebuildable local processing cache
```

### The finished interface is a core requirement

The vault is a storage format, not the interface you should have to use every day. The finished app should be a polished, local-first desktop app (with a browser side panel/extension for capture and context) that works without opening Obsidian or remembering commands. Obsidian remains available for direct inspection and portability.

Keep the main navigation simple and stable:

- **Today:** current snapshot, today's journal draft, due follow-ups, and one clear next action.
- **Journal:** a calendar/timeline of daily entries with source links and easy correction.
- **Ask AI:** select/use the current provider, see the context that will be included, and approve sensitive excerpts.
- **Review:** questions, contradictions, monthly cross-check, and cleanup candidates in one queue.
- **Explore:** one global search/ask box for people, topics, projects, events, and past conversations.
- **Connections & settings:** manage enabled data sources, check-in time, privacy, backup, and retention; do not make the user configure every future category.

The home screen should surface relevant work automatically; new features should appear in the right workflow rather than becoming another settings hunt. Keep advanced controls available but out of the everyday path.

### Why this structure

- **Sources are separate from memories:** the raw conversation remains the evidence; summaries and extracted claims can be corrected or rebuilt.
- **Entities are dynamic:** each entity has a type and links, rather than requiring folders for every possible subject. You do not need to predeclare “relationships,” “football,” “mental health,” or every person's name as a separate taxonomy.
- **Events preserve time:** a change in gym routine or sleep during exams is not automatically a contradiction with a different period.
- **Working memory is a short-lived view:** it contains what seems current now, not the entire life archive. It is refreshed from dated, source-linked memories and can expire without deleting history.
- **Knowledge pages are derived:** they may synthesize recurring information about a topic, but every important statement points back to evidence.
- **Sharing receipts make privacy inspectable:** retain the exact approved context bundle and destination locally so you can see what left the vault.
- **SQLite is only an index:** Markdown and original sources remain the portable, inspectable data. Obsidian stores notes as local Markdown files. [Obsidian data storage](https://obsidian.md/help/data-storage)

## 3. What a memory record must contain

Each memory statement should be small enough to correct independently and should carry provenance. It can live as a dated entry on an entity/event note; the system does not need to create thousands of tiny files.

```yaml
id: stable-unique-id
entity: "[[entity-id]]"
type: fact | preference | event | decision | goal | routine | task | observation | hypothesis
status: candidate | confirmed | disputed | superseded | expired | archived
evidence: user-stated | user-confirmed | assistant-suggestion | observed-pattern | hypothesis
source: "[[provider-conversation-id]]"
source_message: provider-message-id-or-passage
captured_at: date-time
occurred_at: optional-date
time_valid_from: optional-date
time_valid_to: optional-date
importance: low | normal | high | pinned
sensitivity: ordinary | sensitive | local-only
retention: current | time-limited | keep-until-user-deletes
confidence: calibrated-label-or-score
related: ["[[other-entity]]"]
```

Do not treat an AI's advice or speculation as a fact about you. It only becomes a personal fact if you explicitly say it is true or adopt it. Keep the distinction visible between:

- **You said:** “Exam stress affected my sleep.”
- **The system observed:** sleep was reported as lower around exam dates.
- **The system hypothesizes:** exams may be affecting sleep.
- **You confirmed:** the connection is accurate.

A relationship between two topics should have its own evidence, time, and status; an Obsidian link alone must not imply causation.

## 4. Core policies the system must enforce

1. **Capture first:** save the source conversation before extraction. Keep the transcript until you explicitly delete it.
2. **Never silently overwrite:** append a correction or time-bounded update and retain the previous state as history.
3. **Distinguish change from contradiction:** if two statements refer to different dates, preserve a timeline. If they appear to conflict for the same time and it matters, ask you.
4. **Ask instead of guessing:** uncertain facts, important relationships, and uncertain long-term relevance go into a question/review queue. Do not invent certainty.
5. **Create new entities when meaningful:** repeated, emphasized, consequential, personally important, or action-bearing topics can be created automatically. Keep trivial one-off mentions in the transcript; if the system is unsure whether to promote one, ask.
6. **Treat importance as a retrieval aid, not truth:** explicit “remember this,” repeated attention, time investment, consequences, corrections, and stated future plans can affect priority. Emotional intensity alone is not a diagnosis or proof of importance.
7. **Expire currentness, not history:** a temporary mood/routine may stop appearing as current after a set period; the source and dated event remain unless you delete them.
8. **Sensitive information is local by default:** health, mental health, relationships, trauma, sexuality, finances, and identifying details are marked sensitive/local-only.
9. **Ask on every external send:** before any provider receives sensitive context, show the provider and exact excerpts and require a one-send approval. No approval means omit it. Do not make a permanent blanket approval.
10. **Separate “forget” from “erase”:** forgetting a derived memory removes it from active retrieval and indexes; erasing the original transcript requires a separate confirmation.
11. **Make every operation inspectable:** show source links, why a memory was created, why it was retrieved, and provide undo.
12. **Never claim unavailable knowledge:** schedule, calendar, location, or health data are included only if you supplied or explicitly connected them.
13. **Monthly audits are user-triggered:** the system may show a reminder, but does not scan or process older memories in the background. You start the audit, choose its scope, preview proposed work, then approve specific changes. No changes are committed without your approval.
14. **Learning from behavior is evidence-based:** use chats, corrections, accepted/rejected suggestions, and outcomes you report. Do not infer behavior from unconnected apps, sensors, or device activity. Repeated patterns remain proposals until confirmed when their meaning is uncertain.
15. **Journal entries are dated and sourced:** distinguish event time from capture time, user-reported details from AI-generated summaries, and confirmed facts from hypotheses. Never fill gaps with invented events or feelings.
16. **Daily check-ins require opt-in:** ask once during setup whether to enable an end-of-day reminder and at what time. A reminder is not permission to inspect unconnected activity. Generate the check-in when you open/accept it; answers, skips, snoozes, and “stop asking” must be respected.
17. **Sensitive follow-ups need a cadence you choose:** when a sensitive event is mentioned, ask whether you want follow-up and when. Do not repeatedly bring up trauma, heartbreak, or medication without your permission; let you pause or stop a thread.

## 5. How it should work, end to end

### A. Conversation collection from any AI

Each provider connector maps its chat into one common format: provider, conversation ID/URL, title, timestamps, roles, message IDs, text, and attachment references. It saves the raw conversation locally, deduplicates repeated captures, and records edits/regenerations as versions rather than silently corrupting old evidence.

The local memory service then creates **proposals**: entities, dated events, factual claims, preferences, decisions, routines, open loops, and possible connections. It checks for duplicates and conflicting timelines, links proposals to source passages, and routes uncertain/high-impact/sensitive items to you for review.

If a website changes or cannot be read, the connector must report failure and offer import/share/copy—not claim a successful save. Historical chats may need a provider export or explicit import; an extension should not be assumed to have access to an account's hidden archive.

### B. Shared memory across providers

The memory is not stored separately inside ChatGPT, Gemini, DeepSeek, Claude, Grok, etc. All provider interfaces ask the same local retriever for a context bundle. That bundle is tailored to the current question and has citations/links back to local sources. A newly added provider uses the same memory API and policy layer.

### C. Working memory and current state

`Current Snapshot.md` is a compact generated view of relevant current facts, current constraints, open loops, and active goals. It is not an infinite prompt and not a replacement for the source archive. Each active entity can also have a current-state summary and a dated change history. The snapshot is refreshed from the graph and expires/updates as circumstances change.

### D. Query-time retrieval

When you ask an AI something, the bridge:

1. searches exact terms and semantic meaning in the local index;
2. follows a small number of relevant typed links (person, project, event, routine, health, etc.);
3. ranks by relevance, current validity, importance, and recency;
4. includes evidence and clearly labels facts, observations, and hypotheses;
5. excludes expired/unrelated material;
6. identifies sensitive matches and pauses for your per-send approval;
7. shows the exact context and destination before inserting it.

For a question like “What should I do today?”, it may combine deadlines, commitments, active projects, time constraints, routines, and wellbeing memories—but only what is actually known and relevant. Sensitive excerpts are withheld unless you approve them for that send.

### E. User-triggered monthly cross-check and cleanup

Once a month, show a reminder such as **“Run the 2-month memory review?”** The reminder is not permission to run it. Nothing analyzes or changes old memories in the background. When you explicitly start the review, the local system:

1. examines the last 60 days of new/changed memories, plus only older memories linked to those items;
2. checks for newer information that may correct or supersede old claims;
3. checks apparent conflicts against dates, and separates real conflicts from normal changes over time;
4. revisits proposed connections and interpretations using later evidence, without turning correlation into causation;
5. flags duplicates, unsupported interpretations, stale current-state summaries, and temporary items no longer current;
6. produces a concise, source-linked report with suggested actions and open questions.

The audit is a **dry run**. It can propose `correct`, `supersede`, `merge`, `confirm connection`, `keep as hypothesis`, `archive`, `keep temporarily`, `forget derived memory`, or `delete source too`. Nothing is applied until you approve the individual proposals or explicitly approve a selected batch. Sensitive memories stay local during this review; the audit does not send them to an online model.

The system should not make you read every file to manage growth. It should show a dashboard grouped by **what is using space** (transcripts, media, index/cache, derived notes) and rank review candidates by likely value/risk: exact duplicates, large attachments, redundant derived summaries, superseded current notes, weakly supported claims, stale temporary state, or orphaned records. It should show counts, sizes, reasons, and links, then let you decide in batches. Low access frequency alone is not a reason to delete—something rarely used may still matter later.

Use these distinct actions:

- **Archive:** remove a derived note from the active view, keep it locally and searchable on request.
- **Expire currentness:** stop treating a temporary state as current; preserve its dated history and source.
- **Forget derived memory:** remove the extracted item from active retrieval and indexes, but retain the original transcript.
- **Delete source too:** after a separate confirmation, remove the transcript and associated attachments/index entries under the chosen backup-retention policy.

Store each conversation as its own source note, partitioned by provider and year; do not append everything into one enormous file. Search indexes operate on chunks and return selected passages, so a larger archive does not mean sending or loading the whole archive into an AI context. With roughly 500 GB of storage, text is unlikely to be the first pressure point; images, audio, repeated exports, and backups are more likely.

### F. Learning from your behavior

“Learning” should mean **updating an external, inspectable memory**, not secretly retraining the model's weights after every chat. The system can learn from:

- things you explicitly say about yourself, your goals, preferences, and experiences;
- corrections you make to its assumptions;
- which suggestions or context you accept, reject, edit, or repeatedly ask it not to include;
- outcomes you later report, such as whether a routine or plan worked.

A single click or choice is weak evidence. Repeated behavior can create a **candidate preference or pattern**, with dates and examples. For example: “You have asked for a shorter explanation several times; should I remember that as a preference?” If the pattern is uncertain or sensitive, ask before promoting it. Your corrections should update future behavior only after the memory is accepted or clearly confirmed.

The local system cannot know unshared offline behavior or activity inside an unconnected app. Calendar, fitness, phone, or other activity data require a separate, explicit opt-in connection. Fine-tuning is not needed for this memory-based learning and would be less transparent and harder to undo than source-linked notes.

### G. Journal and end-of-day follow-up

Create one daily journal page at `08 Journal/<year>/<Asia-Dhaka-date>.md`. Populate it from conversations captured from enabled AI providers, answers you give during check-ins, and only other activity sources you explicitly connect. Each item includes its event date/time when known, capture timestamp, source link, and whether it is your statement, a factual summary, or a hypothesis. The journal must not invent what you did or felt offline. A daily page can contain:

- a chronological list of meaningful conversations/events;
- plans, decisions, deadlines, outcomes, and changes in routines;
- wellbeing details only when you actually reported them;
- open follow-ups and unanswered questions;
- links to the source conversations and related entity pages.

During setup, ask whether to enable a local end-of-day reminder and what time suits you. If enabled, the reminder can say **“Would you like to do today's journal check-in?”** The review itself starts when you open/accept it; it is not silent background processing. The check-in looks at today's captured material plus due, user-approved follow-up threads, then asks only a few high-value questions. It can also ask one general question such as “Anything important from today that I didn't capture?” for offline events.

A follow-up is a dated, controllable record with `topic`, `last_update`, `next_check`, `cadence`, `sensitivity`, and `status`. Example: if you told an AI yesterday that you had a fever, a check-in might ask, **“Yesterday you mentioned a fever. Would you like to update how you are today?”** Options: `better`, `same`, `worse`, `add detail`, `skip`, `snooze`, or `don't ask about this`. If skipped, the system leaves it unresolved instead of deciding you recovered. For medication, exams, results, or plans, follow up on dates and details you supplied; do not invent a schedule.

For heartbreak or trauma, never assume daily follow-up is welcome. Ask once whether you want a check-in, how often, or not at all; obey pause/stop requests. A check-in is for journaling and continuity, not diagnosis or treatment advice. The saved daily page can begin as a clearly marked draft and be edited; answered follow-ups are appended with their actual timestamp.

## 6. Provider integration model

Build one stable core and multiple thin connectors. For browser collection, keep these two streams separate:

1. **Browser trail (broad, low-content):** if you grant browser-history permission, record visit URL, page title, and visit timestamp across the sites you choose. This is evidence that a page was visited—not that you read it, agreed with it, or did the activity it discusses. Chrome's History API exposes visit/history metadata and requires the `history` permission. [History API](https://developer.chrome.com/docs/extensions/reference/api/history)
2. **Page/chat content (higher-content):** use a site adapter to capture submitted conversation turns from AI pages and, if you explicitly enable broad page capture, readable page text from other pages. Content scripts can read accessible page DOM, but they need host access and can break when site layouts change. [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

The setup wizard should explain the difference simply and let you authorize broad browsing capture if you want it. Chrome supports optional host permissions granted at runtime, so the extension can request broad access after explaining what it enables instead of silently taking every permission at install. [Optional permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

Even in broad mode, apply firm safety boundaries: never read passwords, cookies, authentication tokens, payment fields, or unsent form/composer contents; capture only submitted chat turns; keep incognito capture off unless separately enabled; allow pause/ignore controls; and store collected content locally. Treat health or other sensitive pages as local-only unless you choose otherwise. Do not build a keylogger or continuous screenshot recorder. If page content is too large/noisy, retain browser metadata and let you save that page's readable text explicitly.

- **AI clients that support MCP:** use an MCP adapter for read/search/write actions the client explicitly supports. MCP is a supported route, not a universal browser-web integration. [Open Second Brain MCP guide](https://github.com/itechmeat/open-second-brain/blob/main/docs/mcp.md)
- **APIs or local clients:** use the same local memory service through a documented API/tool interface.
- **Unsupported websites/mobile apps:** explicit share, export, import, or copy/paste fallback.

The local service should bind to the laptop's loopback interface, not be exposed to the public internet or local network by default. Store no provider API keys in the browser extension unless genuinely required.

## 7. Practical build order

1. **Foundation:** create the local vault, memory policy, backup, and sample data.
2. **Common source format:** import/save conversations from any provider; preserve originals; test duplicate handling.
3. **Local search and graph:** add SQLite full-text search, then entities, events, dates, links, and provenance. Keep indexes rebuildable.
4. **Functional interface early:** build the app shell with Today, Journal, Ask AI, Review, and Explore. It can be plain during development, but the final setup must not require CLI commands or browsing raw vault files.
5. **Journal and follow-ups:** generate dated journal drafts from captured sources; add opt-in check-ins, due follow-up threads, skip/snooze/stop controls, and source links.
6. **Review workflow:** candidate approvals, uncertainty questions, conflict handling, user-triggered monthly audit, storage dashboard, retention choices, and undo.
7. **Context builder:** retrieve relevant memories; label hypotheses; enforce per-send sensitive approval; save sharing receipts.
8. **Browser extension:** first capture full submitted AI conversations on enabled AI sites; then add broad visit metadata (URL/title/time) if you grant history permission; then optionally add readable page-content capture. Keep each site adapter tested and separate. Never collect passwords, cookies, auth/payment fields, unsent drafts, or incognito data by default.
9. **Provider routing:** connect each AI website/client through the same local context API; add future providers by adapter, with import/copy fallback where direct integration is impossible.
10. **Maintenance and rollout:** backups, archive/delete controls, broken-link checks, optional calendar/mobile sources, and a user-triggered monthly audit. Test in shadow mode first: capture only sources you enabled, show journal drafts/follow-ups/context, and require approval before memory changes or external sends.

## 8. Hardware and local model

The archive, Obsidian vault, SQLite search, and provider bridge do not require a powerful local model. With 8 GB RAM and 4 GB VRAM, start without a large local model; add a small quantized model only for extraction/classification after the rest works. Keep the LLM's role limited to proposing structured memories and links. Search, dates, access controls, deletion, and sensitive-send approval should be deterministic software rules. If the small model misses nuance, the review queue is where you correct it; no model should be trusted to infer your life perfectly.

## 9. Minimum acceptance tests

Before using real sensitive history, test with synthetic conversations and require:

- full transcript survives summaries unchanged;
- the finished app exposes Today, Journal, Ask AI, Review, and Explore without requiring Obsidian file browsing or terminal commands;
- daily journal entries use event/capture timestamps correctly, link their sources, and do not invent offline events or feelings;
- daily reminders are opt-in; a skipped follow-up remains unresolved and can be snoozed or stopped;
- sensitive topics such as trauma are not repeatedly raised without an explicitly chosen follow-up cadence;
- same conversation is not duplicated;
- changed facts form a timeline rather than a false conflict;
- same-time contradictions trigger a question;
- assistant-generated suggestions are not stored as user facts;
- new recurring/notable entities can be created without predefined categories;
- every cross-domain relationship is labelled and sourced;
- unrelated context is not added to prompts;
- every sensitive excerpt is blocked until approved for that specific provider and send;
- a failed provider adapter never reports a false success;
- browser visit metadata is labelled as a visit, never proof that you read or did something;
- extension never captures passwords, cookies, tokens, payment fields, or unsent drafts; incognito capture is off unless separately enabled;
- broad site access is explained, granted explicitly, revocable, and capture can be paused;
- forgetting a derived memory does not erase the source without explicit confirmation;
- a monthly audit does not run until explicitly started, reads the configured 60-day scope plus relevant linked history, and writes nothing until you approve a proposed diff;
- cleanup never deletes an original transcript simply because it is old or rarely retrieved;
- repeated corrections may create a preference proposal, but uncertain behavior patterns are not silently promoted to facts;
- index and context can be rebuilt after cache deletion.

## 10. GitHub components checked

- [Open Second Brain](https://github.com/itechmeat/open-second-brain): a local Obsidian-backed agent memory/MCP project with Windows instructions; useful as a component or design reference, not a universal cross-website capture solution. [Windows guide](https://github.com/itechmeat/open-second-brain/blob/main/install/windows.md)
- [Obsidian AI Exporter](https://github.com/Adam-s-tech/obsidian-AI-exporter): a narrower one-click exporter for some AI websites, not the full memory graph or consent system.
- [Obsidian data storage](https://obsidian.md/help/data-storage): describes the vault's local Markdown files.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): browser-page access basis for site-specific adapters.
- [Chrome History API](https://developer.chrome.com/docs/extensions/reference/api/history): visit history metadata and its required permission.
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions): request host access with user consent at runtime.

**Bottom line:** one provider-independent local memory core; raw conversations at the bottom; a source-linked, time-aware personal graph in the middle; a short working-state view above it; and a consent-controlled context router at the top. All AI providers are replaceable clients of that same brain.


---

## Appendix B — Current consolidated requirements file (verbatim)

# Second Brain — Requirements and Architecture Direction

**Updated:** 2026-10-10, incorporating the user's latest corrections. The latest user statement takes precedence where older wording conflicts. This document is the durable source of truth; do not quietly narrow a requirement or describe a loose approximation as completion.

## 1. Product goal

Create a private, proactive local-AI second brain/assistant for the user's Windows laptop named **AI ASSistant** (preserve the user's requested casing). It should understand context, collect and organize authorized information using the user's template, and help without requiring the user to micromanage every note or memory.

The user wants to use it as an assistant, not as a backend project that requires routine database or folder management.

## 2. Chat experience: Claude's layout and features

- The user specifically wants the app to **copy Claude's chat layout exactly**, with the features and behavior of that chat experience—not merely a custom screen described as “Claude-inspired.”
- Treat exact Claude-like chat layout and feature parity as a first-class requirement. Do not substitute a merely similar layout or silently limit “all the features” to message bubbles.
- Before implementation, make a feature inventory of the Claude experience the user means, then distinguish what can be reproduced locally, what needs another local component, and what would require an external service. Do not claim full parity until checked against that inventory.
- Deliver a real native Windows desktop experience, not a browser page presented as the final product.
- Keep the window fully on-screen, including its title bar and Windows close controls.
- Default to dark appearance and provide a visible light/dark switch that remembers the user's choice.
- Keep the app polished, legible, and simple to use.

## 3. Obsidian: connect to the real app; do not rebuild it unnecessarily

The user has decided that **AI ASSistant will connect to the real Obsidian app/vault**. Obsidian is the canonical memory store. Do not build a competing Obsidian clone or treat an export-only folder as integration.

- Use the user's Obsidian vault as the canonical, local memory/knowledge store, with Markdown notes and attachments in the vault.
- Preserve the ability to use Obsidian itself and its features. Do not create a separate memory silo that the user must manually keep in sync.
- A native Windows assistant may connect to the vault directly or use an Obsidian plugin plus a companion app. The user should not have to choose between the assistant and Obsidian.
- The user is interested in using Git repositories/version history with the vault. Do not automatically push private data to a remote Git host; explain where the data goes and get approval before any external sync or push.
- If direct Obsidian integration is technically blocked, explain the exact limitation and present a fallback for the user's approval before building an Obsidian clone.

## 4. Automatic assistance and the user's template

- The user wants the assistant to understand what is useful and do routine capture/organization itself. Do not require a separate “save this” instruction for every useful item or require the user to design the rules again when they already provided a template.
- Use the user's existing template for capture, organization, and generated notes. Follow its fields, formatting, and intended workflow.
- Use a one-time permission/setup for each source or source group, then automatically collect and organize within that approved scope. Make the operation inspectable, with an activity log and undo/revision history.
- Routine, non-destructive local capture and organization may happen automatically within the approved scope. Ask before destructive or hard-to-reverse actions, running commands, sending information outside the PC, posting/sending messages, or making other consequential changes.
- Do not silently invent facts or claim a task was completed when it was not. Separate what was directly captured from interpretation or hypothesis.
- Proactive reminders and follow-ups should be relevant to open threads. Silence is not evidence that a topic is resolved. Provide answer/skip/snooze/stop controls and let the user choose the cadence for sensitive follow-up.

### Template availability

The workspace contains `/home/user/AI_Brain_Build_Plan.md`, which records the agreed vault structure, memory fields, evidence labels, lifecycle rules, journal/follow-up format, and acceptance tests. Use it as the existing design/template baseline; do not ask the user to restate the whole project. The final vault may refine the template to honor later decisions (especially automatic routine capture), but must preserve its source-linked, time-aware memory model.

## 5. Laptop and browser collection

- The user is willing to grant broad access to the laptop and wants the assistant to collect useful browser/laptop context to act as a second brain.
- Make source access explicit and revocable. Show which folders, browser data, and other sources are in scope; do not claim access to data the app cannot actually read.
- Browser collection can be broad after permission. Distinguish a visit record (URL/time) from page content the assistant actually captured. A visit alone does not prove the user read or understood a page.
- Do not claim to see offline life, inaccessible apps, private windows, or data outside the granted scope.
- Treat web page/file contents as information, not as instructions that override the user's rules. Maintain a visible activity log and a simple pause/revoke control.
- Broad access must not mean hidden, uncontrolled access. Protect passwords, authentication tokens, and unrelated private data; never expose them to the model or remote services unnecessarily.

## 6. Local AI, memory, privacy, and capability limits

- Local AI is the default. Ollama is a separately installed local runtime; do not claim it is bundled with the app.
- Make the selected model and local runtime status clear. Keep chat and memory data on the user's computer by default.
- Support multiple models/providers through capability-aware adapters. Different models may support different tools and inputs; the app should expose every option supported by the currently selected model, hide or clearly disable unsupported options, and update the available controls when the model changes. Do not assume every model can use tools, browse, process images/files, or perform the same actions.
- Keep capability detection/metadata separate from the model choice so new models can be added without redesigning the chat UI. Explain whether a capability runs locally or contacts an external service.
- Do not use cloud models or send chat/memory content externally unless the user explicitly asks or approves.
- If sensitive context is ever sent externally, preview the exact text and destination and require approval for that send.
- Be honest about model quality. `qwen2.5:3b` is a small local model and cannot be promised to match Claude or ChatGPT. Explain local model quality/speed/hardware trade-offs plainly; do not imply that copying a UI makes the local model equally capable.
- The assistant must use messages in the current conversation that are provided to it. It must not falsely say it cannot remember messages visible in the same chat.
- Keep current-chat context distinct from long-term saved memory. If a fact is absent from the current chat and authorized memory, say it is unknown rather than guessing.
- Do not infer the user's name from a Windows account, path, or incidental data. Arena.ai conversations are not automatically imported into the Windows app.

## 7. Memory integrity and review

- Keep original conversations and authorized sources until the user chooses to delete them. Never automatically delete old or rarely accessed transcripts.
- Link derived memories to their source and dates. Distinguish user statements, observations from authorized sources, and hypotheses.
- Keep these actions distinct:
  - **Archive** a memory while retaining it.
  - **Expire currentness** when a fact may no longer be current.
  - **Forget a derived memory** without deleting the original source.
  - **Delete a source** only when the user explicitly chooses deletion.
- Automatic capture/organization is desired, but changes must be inspectable and reversible. Do not silently retrain a model or silently assume behavioral preferences.
- Monthly cross-check remains user-triggered unless the user later changes this: review the last 60 days plus relevant older linked memories, show a dry run, and get approval before applying proposed changes.

## 8. Journals and follow-up prompts

- Generate dated journals from captured or otherwise authorized sources, following the user's template.
- Offer relevant end-of-day prompts about open threads, with answer/skip/snooze/stop controls.
- Never infer resolution from silence. Let the user choose the follow-up cadence for sensitive topics.

## 9. Beginner-friendly guidance and hardware

- The user has Windows 11 and wants instructions suitable for someone who has never used a computer.
- Explain what is being done, what the user should do, what it will do, and what comes next.
- Give **one simple step at a time**, then wait for the user's result before giving the next step.
- User hardware: 8 GB RAM, 4 GB GPU memory, and approximately 500 GB storage. Account for these limits when recommending local models; do not promise a larger model will run well without checking.
- Respect the user's concern about very slow downloads. Do not call a third-party installer safe without verification.

## 10. Current known state and gaps

These are current facts, not completed requirements:

- The user has Ollama installed and `qwen2.5:3b` downloaded.
- The existing WPF app stores its own data in SQLite and is **not currently connected to Obsidian**.
- The current app does not provide the requested full Claude feature parity or broad automatic laptop/browser collection. Memory capture has required manual user actions.
- Recent tests showed `qwen2.5:3b` misreading “slow” as “Solow,” giving generic responses, and incorrectly claiming it could not remember messages in the same chat. Prompt improvements may reduce avoidable mistakes, but they cannot turn a small model into Claude.

## 11. Approved architecture direction

AI ASSistant connects to the real Obsidian vault as the canonical memory store. Use Git for local version history if the user wants it, and build the local AI companion/plugin and authorized browser/laptop connectors around that vault. Keep the chat window's visual target as Claude's chat experience. Follow the agreed template to perform routine capture and organization automatically, with logs, versioning, and undo; confirm destructive or external actions.

This avoids a competing memory silo. Full Claude feature parity still needs a concrete feature inventory and must be reconciled with the user's local-first requirement and PC limits; a local model cannot be represented as Claude itself.

## 12. Acceptance checklist

- [ ] Claude's chat layout is copied to the user's stated target, not merely loosely imitated.
- [ ] A feature inventory exists for what “all Claude features” means; no parity claim is made without verification.
- [ ] It is a native Windows desktop experience with visible Windows controls, a dark default, and a visible persistent theme switch.
- [ ] Obsidian is genuinely integrated as the canonical memory vault, or a fallback is approved by the user.
- [ ] The assistant automatically uses the user's template for authorized routine capture/organization; it does not ask the user to save every useful item.
- [ ] Laptop/browser source access is explicitly scoped, visible, revocable, and honest about what was actually captured.
- [ ] Routine local changes are inspectable and reversible; destructive, consequential, and external actions require approval.
- [ ] Current-chat context is not confused with long-term memory; no unsupported personal facts are guessed.
- [ ] Sensitive external sharing requires exact-content/destination preview and per-send approval.
- [ ] Original sources are preserved until the user chooses deletion; archive, expire, forget-derived-memory, and delete-source remain distinct.
- [ ] Cross-checks, journals, and follow-ups follow the authorization and approval rules above.
- [ ] Guidance is delivered one simple step at a time, with local model limits explained honestly.


---

## Appendix C — Active personal vault blueprint (verbatim)

# AI ASSistant — Personal Brain Blueprint

**Status:** authoritative project plan. This file consolidates the agreed memory design, later Obsidian decision, app name, model-capability requirement, and automatic-capture correction. Use it instead of older conflicting prototypes/plans.

## 1. What this is for

One private, provider-independent second brain for this user's Windows laptop. **Obsidian is the real, readable memory vault; AI ASSistant is the local desktop assistant connected to that vault.** The user should not have to manage a separate database or manually save every useful thought.

The interface should copy Claude's chat layout exactly, with the Claude features the user expects. The chat application remains AI ASSistant and uses models/tools according to what is actually available. A local model's quality must not be presented as equal to Claude.

## 2. Personal constraints that shape the design

- Windows 11 native desktop app; title bar and Windows controls stay visible.
- Dark by default, visible persistent light/dark switch.
- Hardware: 8 GB system RAM, 4 GB GPU memory, approximately 500 GB storage. Start with a compact local setup; do not assume large models fit comfortably.
- Ollama is already installed separately; current model is `qwen2.5:3b`. That model is a small baseline and has shown comprehension limits.
- Local-first: no remote inference or external transfer by default. A remote model may only be used after the destination and data flow are explicit and approved.
- Obsidian vault is canonical memory; Git is optional local version history. A remote Git push is an external upload.
- Dates and daily routines use Asia/Dhaka unless the user changes the setting.
- Explain Windows tasks simply, one step at a time, and wait for the user's result.

## 3. One system, six layers

```text
Authorized AI websites, browser pages, laptop folders/apps, imports, and user input
  ↕ source-specific connectors, folder access, browser extension, API/MCP, or share/import fallback
Visible permission, privacy, action-log, and undo layer
  ↕ separates local capture from external sending and risky actions
Context builder and retriever
  ↕ finds only relevant, current, source-linked passages for the selected model
Temporal personal memory graph
  ↕ claims, events, people, projects, routines, preferences, evidence, and time
Review, follow-up, and maintenance layer
  ↕ questions only when needed; dry-run audits; archive/forget/delete controls
Obsidian Markdown source vault + rebuildable local search index
  ↕ original evidence remains readable, portable, and under the user's control
```

## 4. Final vault map

```text
AI-Brain/
├── 00 System/
│   ├── START HERE.md
│   ├── AI ASSistant Blueprint.md
│   ├── User Setup Defaults.md
│   ├── Memory Schema.md
│   ├── Privacy & Access.md
│   ├── Source Capture Map.md
│   ├── Model Registry.md
│   ├── Claude Feature Audit.md
│   ├── Git, Backup & Recovery.md
│   ├── Templates/
│   └── Connectors/                 # provider/source setup notes
├── 01 Inbox/
│   ├── New Imports/
│   └── Processing Errors/
├── 02 Sources/                     # originals; do not silently rewrite
│   ├── Conversations/<provider>/<year>/<source-id>.md
│   ├── Browser Activity/<year>/<month>.jsonl
│   ├── Web Pages/<year>/<source-id>.md
│   ├── Laptop Files/<source-id>.md # source metadata/pointer; original stays in place
│   ├── Imports/
│   └── Attachments/
├── 03 Memory/
│   ├── Entities/<stable-id>.md     # dynamic: person, project, topic, routine, etc.
│   ├── Events/<date>-<stable-id>.md
│   └── Connections/                # explicit, evidenced relationships
├── 04 Working Memory/
│   ├── Current Snapshot.md         # short-lived, timestamped overview
│   ├── Open Loops.md
│   └── Active/<entity-id>.md
├── 05 Knowledge/                   # reusable synthesis linked to evidence
├── 06 Review/
│   ├── Questions.md
│   ├── Conflicts.md
│   ├── Keep-or-Forget.md
│   ├── Cleanup.md
│   └── Monthly Audits/             # only after the user starts an audit
├── 07 Sharing Receipts/            # exact one-send approvals, kept local
├── 08 Journal/<year>/<date>.md     # event and capture dates, Asia/Dhaka
├── 09 Activity & Undo/<year>/<month>.md
├── 90 Archive/                     # inactive derived notes; not source deletion
│   └── Design History/             # old plan retained for traceability only
└── .brain/                          # rebuildable index.sqlite and cache, not source of truth
```

Folders are broad layers, not a rigid life taxonomy. Create a new entity when it becomes meaningful; do not predefine a folder for every possible topic. Keep claim/event history dated and link connections rather than forcing categories.

## 5. Automatic capture: do the useful routine work

The user explicitly wants the assistant to understand and organize information using the supplied template rather than asking “save this?” each time.

- After a source is authorized once, automatically preserve its original and process ordinary, directly supported material using the templates in this vault.
- Automatically create/update source-linked entities, dated events, claims, decisions, goals, tasks, preferences, routines, open loops, and journal drafts when evidence supports them.
- Do not interrupt for every note. Use the review queue for real uncertainty: unclear meaning, an important inferred relationship, same-time conflict, high-impact ambiguity, or a decision that changes the user's data or commitments.
- Sensitive information may be retained locally from an authorized source, clearly marked sensitive. It must not be sent externally without the exact-content/destination preview and a one-send approval.
- Routine vault writes must be logged, source-linked, non-destructive, versioned, and undoable. Never silently rewrite originals, delete source material, run arbitrary commands, post/send messages, or make irreversible changes.
- An automatic capture failure must be shown as a failure, not as a saved note. Provide retry/import/share fallback.

## 6. Evidence, time, and memory records

Each claim must be small enough to correct independently. It may live as a section on an entity/event note; do not create thousands of tiny notes by default. Required fields are in `Memory Schema.md`.

- **You said** is a user statement; it is not necessarily independently verified, but is evidence that the user said it.
- **Observed** is a fact captured from an authorized source (for example, a visit timestamp); do not inflate its meaning.
- **Hypothesis** is an interpretation, never a fact until confirmed.
- **User-confirmed** means the user explicitly adopted or corrected the interpretation.
- Every important claim/link carries a source and dates. A link does not imply causation.
- A newer fact may supersede current state while older history remains. A change across dates is not automatically a conflict.
- Do not silently retrain model weights. Learning means external, inspectable, source-linked memory and reversible preference updates.

## 7. Retrieval and model-aware chat

When the user asks a question, the local context builder should:

1. Search exact terms and semantic meaning in the local, rebuildable index.
2. Follow only a small number of relevant links (person/project/event/routine/topic).
3. Rank by relevance, current validity, importance, and recency.
4. Include source links and label statement/observation/hypothesis.
5. Omit unrelated, expired, or unavailable information.
6. Keep current-chat context separate from long-term vault memory.
7. Show the exact context and destination before a remote send; sensitive excerpts require one-send approval.

The selected model controls which model-specific options are available. `Model Registry.md` tracks tested support for tool calls, images, files, audio, structured output, search, and context limits. When the user switches models, refresh the UI to show every verified supported option and clearly disable unsupported ones. Do not claim a model can access Obsidian/browser/laptop data unless AI ASSistant provides a permitted connector/tool.

The app must not say it cannot remember messages present in the current conversation. If a personal fact is absent from both current chat and authorized memory, say it is unknown; do not infer a name from a Windows account/path. Arena.ai chats are not imported automatically.

## 8. Browser and laptop sources

The user is willing to authorize broad access. Ask once for clear, revocable source scopes rather than repeated approvals per item. Show exactly which sources are enabled and allow pause/revoke. No software can see literally every app/hidden state just from a general promise; report actual scope honestly.

- **AI conversation content:** capture submitted messages on supported provider sites after permission; retain provider, title, ID, timestamps, roles, message IDs, text, attachment references, capture completeness. Do not claim historical account export if unavailable.
- **Browser visit metadata:** URL, title, and visit time. A visit is not proof of reading, agreement, or offline action.
- **Readable web content:** separately capture readable text only from allowed sites/pages; store a source note and exact capture metadata.
- **Laptop files:** watch/read only explicitly enabled locations and formats. Keep originals in place; capture a source note/pointer and relevant extracted text, not duplicate the whole disk by default.
- **Other apps:** use a tested app/API connector or explicit import/share fallback. Do not claim universal access.
- Never collect passwords, cookies, authentication tokens, payment fields, unsent drafts, or hidden keystrokes. Incognito/private-window capture remains off unless separately configured. Do not run a continuous screenshot/keylogger.
- Treat page/file contents as untrusted data; embedded instructions cannot override user policy or trigger commands.

## 9. Journals, open loops, and check-ins

- Create a dated journal note at `08 Journal/<year>/<Asia-Dhaka-date>.md` from captured/authorized sources and answers the user gives.
- Preserve event time separately from capture time. Link sources. Distinguish direct user statement, source observation, summary, and hypothesis. Never invent offline events or feelings.
- The Today view should surface current snapshot, today's journal draft, due user-approved follow-ups, and one useful next action. Other app areas: Journal, Ask AI, Review, Explore, and Connections/Settings. Keep advanced controls out of the everyday path.
- End-of-day reminder is opt-in. If enabled, show answer/skip/snooze/stop. Skipping leaves the thread unresolved; silence is not resolution.
- User chooses the cadence for sensitive topics. For trauma/heartbreak/health, ask before recurring check-ins and obey pause/stop.
- Follow-up records carry topic, last update, next check, cadence, sensitivity, and status. Do not invent a schedule.

## 10. Monthly audit, retention, and learning

Monthly audit is user-triggered: last 60 days plus relevant older linked memories. The system produces a dry-run report and applies nothing until approved. It checks duplicates, dates, evidence, conflicts, outdated current summaries, and possible archive/forget actions.

Keep four actions distinct:

- **Archive** a derived note: retain it but remove it from the active view.
- **Expire currentness:** stop treating a temporary fact as current, but retain history/source.
- **Forget derived memory:** remove the extracted item from active retrieval/index, but keep original source.
- **Delete source:** separate explicit confirmation; delete source and linked attachment/index entries only after user chooses.

Old or rarely retrieved transcripts are not automatic deletion candidates. Show storage use, counts, reason, and links; low access frequency alone is not a reason to delete.

## 11. Privacy, Git, and backups

- Local processing/storage is default; SQLite is only a rebuildable index. Markdown and source files are canonical.
- A local Git commit is local version history; pushing to a remote is an external send. Review and approve the destination/content first. Never upload private vault data automatically.
- No full-disk encryption is assumed. Protect the Windows account/device and back up only to a destination the user trusts.
- Keep a local activity/undo history: what was captured, created, changed, skipped, failed, and externally sent.

## 12. Honesty and staged delivery

The Obsidian setup ZIP only creates a vault structure/templates. It does not connect the current SQLite WPF app, provide Claude's model, automatically monitor the laptop, or implement full feature parity. The current app and Ollama/model are separate components. A small local model cannot be promised to match Claude; feature/UI similarity does not change intelligence.

Before saying the app is ready: test vault read/write, conflict safety, model capabilities, Claude UI and feature inventory, authorized capture, journal/provenance, all retention controls, model switch, and external-send approval with synthetic data first.


---

## Appendix D — Manifest of the latest Obsidian starter vault

Archive: `/home/user/AI_ASSistant_Personal_Obsidian_Vault.zip`

Files: 61. The list below is the extracted vault content.

- `.brain/README.md`
- `.gitignore`
- `00 System/AI ASSistant Blueprint.md`
- `00 System/Claude Feature Audit.md`
- `00 System/Git, Backup & Recovery.md`
- `00 System/Memory Schema.md`
- `00 System/Model Registry.md`
- `00 System/Privacy & Access.md`
- `00 System/START HERE.md`
- `00 System/Source Capture Map.md`
- `00 System/Templates/Browser Visit.json.md`
- `00 System/Templates/Conversation Source.md`
- `00 System/Templates/Daily Journal.md`
- `00 System/Templates/Entity.md`
- `00 System/Templates/Event.md`
- `00 System/Templates/Follow-up.md`
- `00 System/Templates/Laptop File Reference.md`
- `00 System/Templates/Memory Claim.md`
- `00 System/Templates/Monthly Audit.md`
- `00 System/Templates/README.md`
- `00 System/Templates/Sharing Receipt.md`
- `00 System/Templates/Source Scope.md`
- `00 System/User Setup Defaults.md`
- `01 Inbox/New Imports/README.md`
- `01 Inbox/Processing Errors/README.md`
- `01 Inbox/README.md`
- `02 Sources/Attachments/README.md`
- `02 Sources/Browser Activity/README.md`
- `02 Sources/Conversations/ChatGPT/README.md`
- `02 Sources/Conversations/Claude/README.md`
- `02 Sources/Conversations/DeepSeek/README.md`
- `02 Sources/Conversations/Gemini/README.md`
- `02 Sources/Conversations/Grok/README.md`
- `02 Sources/Conversations/Other/README.md`
- `02 Sources/Conversations/README.md`
- `02 Sources/Imports/README.md`
- `02 Sources/Laptop Files/README.md`
- `02 Sources/README.md`
- `02 Sources/Web Pages/README.md`
- `03 Memory/Connections/README.md`
- `03 Memory/Entities/README.md`
- `03 Memory/Events/README.md`
- `03 Memory/README.md`
- `04 Working Memory/Active/README.md`
- `04 Working Memory/Current Snapshot.md`
- `04 Working Memory/Open Loops.md`
- `05 Knowledge/README.md`
- `06 Review/AI ASSistant Acceptance Tests.md`
- `06 Review/Cleanup.md`
- `06 Review/Conflicts.md`
- `06 Review/Keep-or-Forget.md`
- `06 Review/Monthly Audits/README.md`
- `06 Review/Questions.md`
- `07 Sharing Receipts/README.md`
- `08 Journal/2026/README.md`
- `08 Journal/README.md`
- `09 Activity & Undo/README.md`
- `90 Archive/Design History/Original Agreed Build Plan - historical.md`
- `90 Archive/Design History/README.md`
- `90 Archive/README.md`
- `README.md`
