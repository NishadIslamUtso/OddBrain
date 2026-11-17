# Memory_OB update-11 — what changed (plain words)

Built on top of update-10. **46 test suites pass** (45 + a new 4-check suite
for this change), including from a fresh unpack of this zip.

## The one-time clean-up of junk already saved

Settings now has a **"Clean up old junk"** button. It finds the memories that
older versions let slip in — server log lines, pasted report text, agent
instructions, markdown tables — the things that were never your life.

- Clicking it first **shows you the count** and asks before doing anything.
- The junk goes to the **trash** — nothing is ever deleted, and you can
  **undo** every line from Review.
- It also cleans folder names that came from stray words (the folders named
  "From", "What", "Note"…): the folder goes, the memory inside it **stays**.
- Real project folders (like "Bakery") are left alone.
- Only what the not-life filter can *prove* is junk is touched. Anything
  doubtful stays where it is.

## Next on the list (see TODO.md)

- A5: stable splitting of run-on messages.
- A8: engine install to a permanent home (out of Downloads).
- Then A9–A12 (monthly summary, second-opinion coverage, update-6 recovery,
  test-kit fix).
