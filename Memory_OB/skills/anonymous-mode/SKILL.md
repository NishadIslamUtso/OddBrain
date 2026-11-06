---
name: anonymous-mode
description: Use when the owner wants a clean slate — no recall injected, nothing saved as personal memory. Restores on command.
---

# Anonymous mode

A session toggle with two guarantees:

1. **No recall is injected.** The model answers from the current
   conversation only.
2. **Nothing is captured.** The turn is not written into the attic as
   personal memory.

Turning it off restores normal memory immediately. The flag lives in the
vault's private `.brain/` directory — outside git, outside the export.

## Toggling

```
memory_ob_anonymous("status")   # is it on?
memory_ob_anonymous("on")       # clean slate
memory_ob_anonymous("off")      # restore memory
```

The API also exposes it:

```
GET  /api/anonymous
POST /api/anonymous   {"anonymous": true}
```

## While it is on

- Do not call `memory_ob_search`. There is nothing to search.
- Do not call `memory_ob_capture`. Nothing should be kept.
- Do not mention that a memory store exists — the owner asked for a clean
  slate, not a description of one.
- Answer normally from the conversation in front of you.

## Restoring

When the owner says to stop, turn it off and confirm in one line. From then
on, recall and capture work as before — nothing was lost, because nothing
was written.

## Notes

- The AI may offer anonymous mode; only the owner turns it on.
- Anonymous mode does not delete anything already stored. It stops new
  writes and hides existing recall.
- It is a session aid, not a privacy erase. For that, the owner retires or
  trashes records through the Review panel.
