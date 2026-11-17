# Memory_OB update-12 — what changed (plain words)

Built on top of update-11. **48 test suites pass** (46 + 2 new suites for
these changes), including from a fresh unpack of this zip.

## 1. The same words always become the same memories

Before: one long message could be saved as 1 memory on Monday and 4 on
Tuesday — it depended on how the AI helper happened to cut it that day.

Now there is **one canonical way** to cut text into memories, and every path
uses it. A sentence that only continues the one before it ("It started last
week.") stays attached to it — it is never a memory of its own. Separate
statements ("I live in Dhaka and I study CSE") still become separate
memories. Whether the helper hands the text over in one piece, in four, or
in any other shape — the result is identical, every time. (6 new checks.)

## 2. The engine moves out of Downloads — automatically

Your app used to run from wherever the update zip was unzipped (for you:
`Downloads\Memory_OB-update-7`). A clean-up of Downloads could have deleted
the running app.

Now, whenever install.ps1 finds the engine in **Downloads or a temp folder**,
it:

- copies it to its permanent home: **`Documents\Hermes\Memory_OB-engine`**;
- points the Hermes plugin at that permanent home;
- **retires** the old copy into `_retired/` inside the permanent home —
  moved aside, **never deleted**.

A home that is already fine (like a Workspace folder) is left exactly where
it is. (3 new end-to-end checks that run the real installer.)

## Next on the list (see TODO.md)

- A9: monthly check-up summary. A10: second-opinion coverage.
- A11: update-6 recovery. A12: test-kit fresh-install fix.
