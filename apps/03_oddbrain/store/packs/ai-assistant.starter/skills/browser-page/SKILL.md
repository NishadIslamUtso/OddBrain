---
name: browser-page
description: See the page the user has open in their browser (as last captured by the AI ASSistant extension). Use before asking the user to paste what they see.
---

# browser-page

The AI ASSistant desktop app keeps a local, private door for reading what
its browser extension captured. When a task needs the page the user is
looking at, ask the door instead of the user.

## What is on the user's screen right now

    curl -s -H 'Origin: http://127.0.0.1:8765' http://127.0.0.1:8765/onui

The `Origin` header is the door's own rule, not a trick: this port answers
only callers that say where they are from, and a caller on the user's own
machine naming the door itself is answered. Without the header the door
refuses, and that refusal is correct.

The answer is JSON. `page` is null when nothing was ever captured — say
so, and ask the user normally. Otherwise:

- `url`, `title`, `captured_at` — what was captured, and when
  (Asia/Dhaka clock). Trust `captured_at`: an old capture is not "now".
- `content` — the page's readable text as the extension extracted it.
  `content_truncated: true` means it was cut at 12,000 characters; say so
  if your answer depends on the missing rest.
- `capture_status: "visit-only"` — only the visit was recorded. The page's
  content was never captured. Never guess what such a page says, and never
  treat a visit as proof the user read or agreed with anything.

## Other read doors on the same port (no keys, local only)

- `/grep?q=TEXT` — search the whole vault (same `Origin` header).
- `/capsules` — the user's capsules (goals, decisions, sources).

Rules: read-only. Never write through these doors. If the door does not
answer, the app is not running — say that plainly instead of retrying in a
loop.
