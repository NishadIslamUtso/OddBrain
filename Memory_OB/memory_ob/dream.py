"""The nightly dream — consolidation while the owner sleeps.

Runs over the candidate pool and the ledger and produces tomorrow's queue:

* dedup scan         — near-duplicate candidates become merge cards
* supersession       — a candidate that contradicts confirmed truth becomes a
                       diff card (never a silent overwrite)
* conflict detection — candidates that disagree become ask cards with the
                       speakers named
* theme drift        — a recurring theme becomes an ask card ("make this a
                       category?")
* missing records    — a person with no profile becomes an ask card

The dream proposes. It never signs.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .review import CardStore

_WORD_RE = re.compile(r"[a-z0-9]+")


def _stem(token: str) -> str:
    """Very light suffix stripping, just enough for dedup.

    Not a lemmatiser — it exists so "machine"/"machines" and "report"/"reports"
    compare equal when looking for duplicate facts.
    """
    if len(token) > 5 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _tokens(text: str) -> set[str]:
    return {
        _stem(t)
        for t in _WORD_RE.findall((text or "").lower())
        if len(t) > 3
    }


def _similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


_CONTRADICTION_RE = re.compile(
    r"\b(?:not|never|no longer|instead of|rather than|unlike)\b", re.IGNORECASE
)


def dream(store: Any, *, open_cards: bool = True) -> dict[str, Any]:
    """Run the nightly consolidation and return what it found."""
    cards = CardStore(store) if open_cards else None
    facts = store.list_facts(status="candidate", limit=5000)
    records = store.list_records(include_private=False, limit=10000)
    confirmed = [r for r in records if r.trust >= 0.8 and r.status == "active"]

    merges: list[dict[str, str]] = []
    conflicts: list[dict[str, Any]] = []
    themes: Counter[str] = Counter()
    missing_people: list[str] = []

    # --- dedup scan -------------------------------------------------------
    for i, a in enumerate(facts):
        ta = _tokens(a["text"])
        if not ta:
            continue
        for b in facts[i + 1 :]:
            tb = _tokens(b["text"])
            if _similarity(ta, tb) >= 0.6:
                merges.append({"a": a["id"], "b": b["id"], "text": a["text"]})

    # --- supersession + conflict detection --------------------------------
    for f in facts:
        ft = _tokens(f["text"])
        if not ft:
            continue
        for r in confirmed:
            rt = _tokens(r.title + " " + r.body)
            sim = _similarity(ft, rt)
            if sim < 0.5:
                continue
            if _CONTRADICTION_RE.search(f["text"]) or _CONTRADICTION_RE.search(r.body):
                conflicts.append(
                    {
                        "fact_id": f["id"],
                        "record_id": r.id,
                        "fact": f["text"],
                        "record_title": r.title,
                    }
                )

    # --- theme drift ------------------------------------------------------
    stop = {
        "that", "this", "with", "from", "have", "been", "were", "was", "are",
        "will", "would", "could", "should", "about", "which", "when", "where",
        "what", "they", "their", "there", "then", "than", "also", "just",
        "like", "because", "into", "over", "under", "after", "before",
    }
    for f in facts:
        for t in _tokens(f["text"]):
            if t not in stop:
                themes[t] += 1

    # --- missing people ---------------------------------------------------
    known_people = {
        r.subject for r in records if r.kind == "profile" and r.subject != "self"
    }
    for r in records:
        for who in (r.links or {}).get("mentions", []):
            if who not in known_people:
                missing_people.append(who)

    # --- open cards -------------------------------------------------------
    if cards is not None:
        for m in merges[:20]:
            cards.propose_merge(
                record_id=m["a"],
                other_id=m["b"],
                title="Possible duplicate fact",
                body=m["text"],
            )
        for c in conflicts[:20]:
            cards.propose_diff(
                record_id=c["record_id"],
                old={"body": c["record_title"]},
                new={"body": c["fact"]},
                title="Candidate contradicts confirmed record",
                body=f"Candidate: {c['fact']}",
            )
        for theme, n in themes.most_common(5):
            if n >= 3:
                cards.propose_ask(
                    title=f"Recurring theme: {theme}",
                    body=f"The theme {theme!r} appeared {n} times. Make it a category?",
                    speakers=["memory_ob"],
                )
        for who in sorted(set(missing_people))[:5]:
            cards.propose_ask(
                title=f"Person with no record: {who}",
                body=f"{who} was mentioned but has no profile. Create one?",
                speakers=["memory_ob"],
            )

    return {
        "candidates": len(facts),
        "confirmed": len(confirmed),
        "merges": len(merges),
        "conflicts": len(conflicts),
        "top_themes": themes.most_common(5),
        "missing_people": sorted(set(missing_people)),
        "cards_opened": bool(cards),
    }
