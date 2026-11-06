---
name: memory-full-recall
description: Use when the owner says "check everything" or a answer depends on the whole past — loads every relevant record, not just the top matches.
---

# Memory full recall

The per-turn recall is bounded by design: a few records, chosen by relevance,
to keep the prompt small. Sometimes that is not enough. This skill is the
deliberate, bounded, "check everything before answering" path.

## When to use it

- The owner asks you to check everything, or to be sure.
- The answer depends on history that a top-k search might miss.
- A contradiction is suspected and needs the full picture.

## How

1. Search broadly, then widen:

   ```
   memory_ob_search("the topic in the owner's words")
   memory_ob_search("a synonym or related term")
   memory_ob_search("the people or places involved")
   ```

2. Read what comes back and keep the trust tier and speaker attached to
   every point. Confirmed is fact; candidate is `UNVERIFIED`.
3. If a record id matters, fetch it directly through the vault screen —
   never quote an id you have not read.
4. Say what you checked and what you could not find. "No record" is a real
   answer, not a failure.

## Bounds

- Stay bounded: a handful of searches, not an unbounded crawl.
- NeverSend records are withheld by the exit gate. If nothing comes back,
  that is the law working, not a broken search.
- Hazardous text is withheld too. Do not try to work around it.
- Quote only hash-verified truth; a broken quote must be reported as
  broken.

## Output

Answer the question, then state:

- which records you used (ids + trust tier),
- anything that was `UNVERIFIED`,
- anything that was withheld and why.
