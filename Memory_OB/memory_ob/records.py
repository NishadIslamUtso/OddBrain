"""The record model — kinds, speakers, trust ladder, statuses.

A record is the atomic unit of memory. Everything the system keeps is a
record. The vocabulary is the app's proven one: six kinds, four statuses, and
a trust ladder where ``confirmed`` is reachable only through a Review card.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

# --- Kinds -----------------------------------------------------------------

PROFILE = "profile"
JOURNAL = "journal"
STORY = "story"
CAPSULE = "capsule"
LEARNING = "learning"
NOTE = "note"

KINDS: tuple[str, ...] = (PROFILE, JOURNAL, STORY, CAPSULE, LEARNING, NOTE)

# Kinds a journal/story/note may be about — the owner only.
SELF_SUBJECTS: frozenset[str] = frozenset({JOURNAL, STORY, NOTE})

# The only kind an AI's words may become (law 9).
AI_ALLOWED_KINDS: frozenset[str] = frozenset({CAPSULE})

# --- Statuses --------------------------------------------------------------

ACTIVE = "active"
SUPERSEDED = "superseded"
RETRACTED = "retracted"
TRASH = "trash"

STATUSES: tuple[str, ...] = (ACTIVE, SUPERSEDED, RETRACTED, TRASH)

# --- Speakers --------------------------------------------------------------

SPEAKER_USER = "user"
SPEAKER_ASSISTANT = "assistant"

# --- Trust ladder ----------------------------------------------------------

RAW_MAX = 0.2
CANDIDATE_MIN = 0.3
CANDIDATE_MAX = 0.6
CONFIRMED_MIN = 0.8


def trust_tier(trust: float) -> str:
    """Map a trust score to its ladder tier name."""
    if trust < CANDIDATE_MIN:
        return "raw"
    if trust < CONFIRMED_MIN:
        return "candidate"
    return "confirmed"


def is_raw(trust: float) -> bool:
    return trust < CANDIDATE_MIN


def is_candidate(trust: float) -> bool:
    return CANDIDATE_MIN <= trust < CONFIRMED_MIN


def is_confirmed(trust: float) -> bool:
    return trust >= CONFIRMED_MIN


def ai_may_become(kind: str) -> bool:
    """Law 9: AI words may only become capsules, never personal facts."""
    return kind in AI_ALLOWED_KINDS


def is_self_only_kind(kind: str) -> bool:
    """Journal, story and note are about the owner only."""
    return kind in SELF_SUBJECTS


# --- Record ----------------------------------------------------------------


@dataclass(slots=True)
class Record:
    """One memory record."""

    id: str
    kind: str
    subject: str
    speaker: str
    status: str = ACTIVE
    trust: float = 0.1
    title: str = ""
    body: str = ""
    tags: list[str] = field(default_factory=list)
    source: dict[str, Any] = field(default_factory=dict)
    event_time: str | None = None
    capture_time: str | None = None
    confirmed_by: str | None = None
    never_send: bool = False
    demo: bool = False
    links: dict[str, list[str]] = field(default_factory=dict)
    created: str = ""
    modified: str = ""

    def __post_init__(self) -> None:
        if self.kind not in KINDS:
            raise ValueError(f"unknown kind: {self.kind!r}")
        if self.status not in STATUSES:
            raise ValueError(f"unknown status: {self.status!r}")
        if not 0.0 <= self.trust <= 1.0:
            raise ValueError(f"trust out of range: {self.trust!r}")
        if is_self_only_kind(self.kind) and self.subject != "self":
            raise ValueError(f"{self.kind} records are about the owner only")

    @property
    def tier(self) -> str:
        return trust_tier(self.trust)

    @property
    def is_truth(self) -> bool:
        """True when this record sits above the truth line."""
        return is_confirmed(self.trust) and self.status == ACTIVE

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Record":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})

    @classmethod
    def from_payload(cls, data: dict[str, Any]) -> "Record":
        """Build a record from a partial payload, filling safe defaults.

        Used by the API and the review pipeline, where a proposal may carry
        only a few fields.
        """
        from . import ids

        d = dict(data or {})
        d.setdefault("id", ids.new_id())
        d.setdefault("kind", NOTE)
        d.setdefault("subject", "self")
        d.setdefault("speaker", "user")
        d.setdefault("status", ACTIVE)
        d.setdefault("trust", 0.5)
        d.setdefault("title", "")
        d.setdefault("body", "")
        d.setdefault("tags", [])
        d.setdefault("source", {})
        d.setdefault("links", {})
        d.setdefault("never_send", False)
        d.setdefault("demo", False)
        return cls.from_dict(d)
