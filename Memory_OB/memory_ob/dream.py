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


def dream_with_model(
    facts: list[dict[str, Any]],
    confirmed: list[Any],
    model_call: Any,
) -> dict[str, Any]:
    """Ask the configured dream model to review the candidate pool.

    The model only *proposes* groupings; nothing here signs anything. Its
    output is parsed defensively — a malformed answer simply contributes
    nothing, and the heuristic pass still ran.
    """
    import json

    out: dict[str, Any] = {"themes": [], "conflicts": [], "note": ""}
    if not facts or model_call is None:
        return out
    try:
        listing = "\n".join(f"- {f['text']}" for f in facts[:200])
        prompt = (
            "You are reviewing a personal memory candidate pool. Propose "
            "groupings only — never decide what is true.\n\n"
            "Candidates:\n" + listing + "\n\n"
            'Reply as JSON: {"themes": ["theme", ...], '
            '"conflicts": [{"a": "candidate", "b": "candidate"}]}'
        )
        raw = model_call(prompt)
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            out["note"] = "model unavailable"
            return out
        data = json.loads(raw[start : end + 1])
        out["themes"] = [str(t) for t in data.get("themes", [])][:10]
        out["conflicts"] = [
            {"a": str(c.get("a", "")), "b": str(c.get("b", ""))}
            for c in data.get("conflicts", [])
            if isinstance(c, dict)
        ][:10]
        out["note"] = "model"
    except Exception:
        out["note"] = "model unavailable"
    return out


def dream(
    store: Any,
    *,
    open_cards: bool = True,
    model_call: Any = None,
) -> dict[str, Any]:
    """Run the nightly consolidation and return what it found.

    ``model_call`` is the configured ``dream`` slot. When present it reviews
    the pool for themes and conflicts; the heuristic pass always runs too,
    and neither can sign anything.
    """
    cards = CardStore(store) if open_cards else None
    facts = store.list_facts(status="candidate", limit=5000)
    records = store.list_records(include_private=False, limit=10000)
    confirmed = [r for r in records if r.trust >= 0.8 and r.status == "active"]

    model_pass = dream_with_model(facts, confirmed, model_call)

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
        # The model's own suggestions, when it made any.
        for theme in model_pass.get("themes", [])[:5]:
            cards.propose_ask(
                title=f"Recurring theme (model): {theme}",
                body=f"The dream model flagged {theme!r} as a recurring theme.",
                speakers=["memory_ob"],
            )
        for c in model_pass.get("conflicts", [])[:5]:
            cards.propose_ask(
                title="Model-flagged conflict",
                body=f"These may disagree: {c.get('a')!r} vs {c.get('b')!r}",
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
        "model": model_pass,
    }
