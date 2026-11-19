"""Journal entries — dated notes about the owner's own life.

An entry carries the date of the *event* it describes, never the date it was
captured. The biography itself is written by :mod:`memory_ob.biography`.
"""

from __future__ import annotations

from typing import Any

from .records import ACTIVE, JOURNAL, STORY, Record


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
