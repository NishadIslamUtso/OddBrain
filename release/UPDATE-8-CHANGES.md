# Memory_OB update-8 — what changed (plain words)

Built on top of update-7. **43 test suites pass** (40 existing + 3 new),
including from a fresh unpack of this zip.

## 1. The "not-life" filter (the vault-junk killer)

Your vault dump showed the app saving things that are NOT your life: server
log lines, system notices marked "do not treat as user input", pasted reports
and review text, documentation paragraphs, agent instructions, markdown
tables, and work chatter ("Let me fetch chunks…"). None of those ever become
memories now. The raw conversations in Sources are untouched — nothing is
lost, only the wrong *memories* stop appearing.

Real life lines are proven safe by tests: "My knee hurts when I run.", "My
bakery budget is 5 lakh.", "I like \"tea\" with breakfast.", "My student ID
is … and my wifi password is …" (the secret still gets blanked) — all kept.

## 2. Junk-project guard

A project folder only appears for a real project name ("Bakery", "Study
Buddy"). Report words can never become projects: From, What, With, Note,
Notes, Windows, Macos, Application, Imports, Independent — all rejected,
whether the AI filed them or the word-matcher suggested them.

## 3. Settings honesty (and a hidden bug fixed)

- The "Where your AI server is running" box no longer shows a fake default
  address (`http://127.0.0.1:11434`) when Memory_OB is in automatic mode.
  Automatic now reads as automatic.
- The meaning-search model's screen now shows the address it actually runs
  at (your llama.cpp `127.0.0.1:18435`).
- **Hidden bug found and fixed while doing this:** saving Settings in
  automatic mode used to *erase* the meaning model's server address (which is
  how the wrong address appeared in the first place). Saving now keeps it.

## Known limits (being worked on next — see TODO.md)

- Filing still waits for the "wait-for-AI" change: if the helper fails, the
  old fallback can still file with simple rules (this update filters what
  gets filed; the next one stops the fallback entirely).
- Some AI-report *prose* (sentences with no markers) can still slip past the
  filter — the AI-first filing pass will judge those.
- The vault clean-up button for the junk already saved is next (A6).
