# Memory_OB update-10 — what changed (plain words)

Built on top of update-9. **45 test suites pass** (44 + a new 6-check suite
for these changes), including from a fresh unpack of this zip.

## 1. Clearing the "Recently remembered" list (your decision D2)

- Every card in the list now has a **"Got it"** button — it clears that one
  item off the list.
- **"Clear all"** clears the whole list at once.
- Clearing only clears the *list*. The memories themselves and the full
  history are untouched — nothing is deleted anywhere.
- New things you say still show up on the list again after clearing.

## 2. The 4th answer on conflict questions (your decision D2)

When what you say does not match what I already had, the question now has
**four** answers:

1. Use the new one
2. Keep the old one
3. Both are true
4. **Neither / none of these** ← new

Choosing "Neither / none of these" makes both versions go away (the old one
goes to the trash where you can bring it back with Undo — nothing is lost).

## Also

- 6 new checks for the above; 2 old checks updated to the new four-answer
  contract.

## Next on the list (see TODO.md)

- A5: stable splitting of run-on messages.
- A6: the one-time vault clean-up button for junk already saved (waiting for
  your go-ahead).
- A8: engine install to a permanent home (out of Downloads).
