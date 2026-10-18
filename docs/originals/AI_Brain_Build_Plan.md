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
