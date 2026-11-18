---
name: anonymous-mode
description: Use when the owner wants a clean slate — no recall injected and nothing saved. This is the same as "Pause memory" in Memory_OB; it restores on command.
---

# Anonymous mode (Pause memory)

A switch with two guarantees:

1. **No recall is injected.** The model answers from the current conversation
   only.
2. **Nothing is saved.** What is said while it is on is not kept as memory.

Turning it off restores normal memory immediately. The switch lives in the
vault's private `.brain/` folder and shows in Memory_OB as **Pause memory**
(Settings).

## Toggling

```
memory_ob_anonymous("status")   # is it on?
memory_ob_anonymous("on")       # clean slate
memory_ob_anonymous("off")      # back to normal
```

## While it is on

- Do not call `memory_ob_search` or `memory_ob_capture`.
- Do not mention that a memory store exists — the owner asked for a clean
  slate, not a description of one.
- Answer normally from the conversation in front of you.

## Restoring

When the owner says to stop, turn it off and confirm in one line. Nothing was
lost, because nothing was written.

## Notes

- You may offer it; only the owner decides.
- It does not delete anything already saved. For that the owner uses Forget on
  a memory in Memory_OB.
