"""Journal & Life Story — dated entries and the chapter drafter.

Journal entries carry the *event* date from the source, never the capture
date (law 8). Life Story chapters are drafted only from confirmed owner
records, cite record ids, use exactly one hash-verified quotation, and never
cite AI chapters or capsules (no circular citation).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from . import quotes
from .records import ACTIVE, CONFIRMED_MIN, JOURNAL, PROFILE, STORY, Record


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(slots=True)
class Chapter:
    """A drafted Life Story chapter awaiting its own approval card."""

    title: str
    body: str
    cited_ids: list[str] = field(default_factory=list)
    quotation: str = ""
    quote_hash: str = ""
    source_text: str = ""
    created: str = ""

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)


def journal_entries(store: Any, *, limit: int = 100) -> list[Record]:
    """All active journal entries, newest event date first."""
    recs = store.list_records(kind=JOURNAL, status=ACTIVE, limit=limit)
    return sorted(
        recs,
        key=lambda r: r.event_time or r.created or "",
        reverse=True,
    )


def life_story_records(store: Any, *, limit: int = 200) -> list[Record]:
    """All active story records."""
    return store.list_records(kind=STORY, status=ACTIVE, limit=limit)


def eligible_for_chapter(store: Any) -> list[Record]:
    """Confirmed owner records only — never AI chapters or capsules."""
    out: list[Record] = []
    for r in store.list_records(status=ACTIVE, limit=10000):
        if r.speaker != "user":
            continue
        if r.kind not in (PROFILE, JOURNAL, STORY):
            continue
        if r.trust < CONFIRMED_MIN:
            continue
        out.append(r)
    return sorted(out, key=lambda r: r.event_time or r.created or "")


def draft_chapter(
    store: Any,
    *,
    title: str = "Untitled chapter",
    model_call: Any | None = None,
) -> Chapter | None:
    """Draft one Life Story chapter from confirmed owner records.

    When *model_call* is given it writes the prose; otherwise a deterministic
    chronology is produced. Either way the chapter cites record ids, uses at
    most one hash-verified quotation, and preserves uncertainty.
    """
    records = eligible_for_chapter(store)
    if not records:
        return None

    quotation = ""
    quote_hash = ""
    source_text = ""
    for r in records:
        q = (r.source or {}).get("quote")
        st = (r.source or {}).get("source_text")
        if q and st and quotes.verify_quote(q, st, (r.source or {}).get("quote_hash", "")):
            quotation = q
            quote_hash = r.source["quote_hash"]
            source_text = st
            break

    cited = [r.id for r in records]
    if model_call is not None:
        try:
            prompt = (
                "Write ONE detailed history-book chapter from these confirmed "
                "records. Chronological narrative paragraphs. Cite record ids "
                "in brackets. Use at most one exact quotation. Preserve "
                "uncertainty. No invented facts.\n\n"
                + "\n".join(
                    f"[{r.id}] {r.event_time or r.created} {r.title}: {r.body}"
                    for r in records
                )
            )
            body = str(model_call(prompt)).strip()
        except Exception:
            body = _chronology(records)
    else:
        body = _chronology(records)

    return Chapter(
        title=title,
        body=body,
        cited_ids=cited,
        quotation=quotation,
        quote_hash=quote_hash,
        source_text=source_text,
        created=_now(),
    )


def _chronology(records: list[Record]) -> str:
    parts: list[str] = []
    for r in records:
        when = r.event_time or r.created or "undated"
        parts.append(f"**{when}** — {r.title}\n\n{r.body}\n\n[{r.id}]")
    return "\n\n".join(parts)


def chapter_to_card(chapter: Chapter) -> dict[str, Any]:
    """Turn a drafted chapter into a proposal-card payload."""
    body = chapter.body
    if chapter.quotation:
        body += (
            f"\n\n> {chapter.quotation}\n"
            f"> quote_hash: {chapter.quote_hash}"
        )
    body += "\n\nCited records: " + ", ".join(chapter.cited_ids)
    return {
        "kind": STORY,
        "subject": "self",
        "speaker": "assistant",
        "title": chapter.title,
        "body": body,
        "trust": 0.5,
        "source": {
            "chapter": True,
            "cited_ids": chapter.cited_ids,
            "quotation": chapter.quotation,
            "quote_hash": chapter.quote_hash,
            "source_text": chapter.source_text,
        },
    }
