---
name: brain-anonymous-mode
description: "Use when the owner wants a fresh anonymous session with no memory, personalization, or prior context — like a new app on a new device. Everything before this prompt is forgotten. Re-prompting with the same command restores full memory access."
version: 1.1.0
author: Hermes Agent + Brain
license: MIT
metadata:
  hermes:
    tags: [brain, memory, anonymous, privacy, reset, session]
    related_skills: [brain, brain-memory-full-recall]
---

# Anonymous Mode

Toggles the session between anonymous (no memory, no personalization) and
normal (full Brain vault access). Like switching to a fresh install on a
new device — the session has zero knowledge of anything that happened before.

## How to Activate

The owner says any of:
- "anonymous mode" / "go anonymous" / "fresh session"
- "no memory" / "forget everything" / "clean slate"
- "incognito" / "private session"

## What Happens on Activation

When anonymous mode is activated, the agent MUST:

1. **Clear all memory context** — do not reference any vault records,
   user preferences, past conversations, or learned facts
2. **Forget user profile** — name, preferences, constraints, standing orders
3. **Forget project context** — current tasks, build state, previous decisions
4. **Forget session history** — treat this as the first ever interaction
5. **Respond as a fresh install** — "I have no prior context. How can I help?"

### Explicit Forbidden Actions in Anonymous Mode

The agent in anonymous mode MUST NOT:
- Reference any Brain vault record (03 Memory, 05 Knowledge, 10 People, etc.)
- Reference any user preference or constraint from past sessions
- Reference any project, task, or build state from before this toggle
- Reference any previous conversation in this or any other session
- Use any learned communication style or personalization
- Claim to "remember" anything from before the toggle

### Allowed Actions in Anonymous Mode

The agent in anonymous mode MAY:
- Use general knowledge (training data)
- Use current session context (messages after the toggle)
- Use Hermes's built-in tools (web search, terminal, etc.)
- Build new memory — but it lands as `raw-unconfirmed-evidence` and requires
  the owner's approval before becoming a confirmed fact

## How to Deactivate

The owner says any of:
- "restore memory" / "normal mode" / "exit anonymous"
- "full recall" / "bring back my memory"
- "undo anonymous" / "restore context"

## What Happens on Deactivation

When anonymous mode is deactivated, the agent MUST:

1. **Run full memory recall** — load all relevant vault records
2. **Restore user profile** — preferences, constraints, standing orders
3. **Restore project context** — current tasks, build state, decisions
4. **Confirm restoration** — tell the owner what context was restored

## Implementation

This skill is a toggle, not a one-time action:

- **Active flag**: stored in the session's working memory as `anonymous_mode: true/false`
- **On each new turn**: check the flag at the start of the response
- **On toggle**: immediately switch behavior, no restart needed
- **The flag is session-scoped**: does not persist across sessions unless
  the owner explicitly saves it as a vault record

### Flag Storage

The anonymous mode flag is stored in:
- `04 Working Memory/0002-anonymous-mode.md` — the current flag state
- When toggled ON: write `status: active`, body explains anonymous is on
- When toggled OFF: write `status: confirmed`, body explains normal mode restored
- The Brain backend reads this file at the start of each turn

## Edge Cases

- **Re-prompting the activate command in the same session**: re-confirms anonymous mode, no state change needed
- **Re-prompting the deactivate command**: restores full memory, runs full recall
- **Mixed signals** (e.g. "anonymous mode" then "what do you know about me?"): stay anonymous, do not leak memory
- **System prompts asking for identity**: respond as a fresh Hermes install, no prior user knowledge
- **Memory proposals during anonymous mode**: proposals may be created but are clearly labeled as from anonymous session; the owner approves/denies as usual

## Conflict Note

Anonymous mode only hides Brain vault records from the session. It does NOT
affect Hermes's built-in memory (which is already disabled in config.yaml).
If Hermes built-in memory were re-enabled, anonymous mode would not hide
those records — but that configuration is unsupported.

## Notes

- This skill does NOT delete any vault records — it only hides them from the session
- The vault is untouched; all records remain confirmed
- Anonymous mode is a view toggle, not a data operation
- The owner can toggle this as many times as they want in a session
- If the owner wants permanent deletion of specific records, use the Review tab's retract flow
