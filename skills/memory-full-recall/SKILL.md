---
name: memory-full-recall
description: Use when the owner says "check everything" or an answer depends on the whole past — search widely instead of trusting the top few matches.
---

# Memory full recall

Per-turn recall is deliberately small: a few memories, chosen by relevance.
Sometimes that is not enough. This is the deliberate "check everything before
answering" path.

## When to use it

- The owner asks you to check everything, or to be sure.
- The answer depends on history a short search might miss.
- Something looks contradictory and needs the full picture.

## How

1. Search broadly, then widen:

   ```
   memory_ob_search("the topic in the owner's words")
   memory_ob_search("a related word or a synonym")
   memory_ob_search("the people or places involved")
   ```

2. Keep what each result says about itself — who said it and whether it is
   saved or `UNVERIFIED`.
3. Say what you checked and what you could not find. "Nothing saved" is a real
   answer, not a failure.

## Bounds

- A handful of searches, not an endless crawl.
- Private ("never send") memories are withheld on purpose. If nothing comes
  back, that is the rule working, not a broken search.
- Do not try to work around anything that is withheld.

## Output

Answer the question, then state:

- which memories you used,
- anything that was `UNVERIFIED`,
- anything you could not find.
