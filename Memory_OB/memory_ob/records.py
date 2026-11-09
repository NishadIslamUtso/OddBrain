"""The record model — kinds, speakers, trust ladder, statuses.

A record is the atomic unit of memory. Everything the system keeps is a
record. The vocabulary is the app's proven one: six kinds, four statuses, and
a trust ladder where ``confirmed`` is reachable only through a Review card.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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
# §2: confirmed is 0.9. Only a Review card gets a record here.
CONFIRMED_MIN = 0.9


def _timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sign_truth(rec: Record, *, card_id: str, at: str | None = None) -> Record:
    """The ONLY way a record becomes truth (§2, law 4).

    Trust is a score; truth is a signature. This raises the trust to the
    confirmed tier and stamps ``confirmed_by`` with the card that signed it
    and when. Nothing outside the Review panel may call it — every other
    write path strips ``confirmed_by`` and caps trust below this line.
    """
    rec.trust = CONFIRMED_MIN
    rec.status = ACTIVE
    rec.confirmed_by = f"{card_id}@{(at or _timestamp())}"
    return rec


def unsigned(rec: Record) -> Record:
    """Strip a claimed signature and pull the trust back below the line.

    Used by every write path that is NOT the Review panel, so a caller
    cannot mint truth by putting ``confirmed_by`` in a payload.
    """
    rec.confirmed_by = None
    if rec.trust >= CONFIRMED_MIN:
        rec.trust = CANDIDATE_MAX
    return rec


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
    valid_from: str | None = None
    valid_until: str | None = None

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
        """True only for SIGNED truth (§2): confirmed tier, active, signed.

        Trust is a score; truth is a signature. A record can sit at the
        confirmed tier without a card — the store refuses to write one there
        through any ordinary path — but it is not *truth* until the Review
        panel signs it.
        """
        return (
            is_confirmed(self.trust)
            and self.status == ACTIVE
            and bool(self.confirmed_by)
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Record:
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})

    @classmethod
    def from_payload(cls, data: dict[str, Any]) -> Record:
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
        rec = cls.from_dict(d)
        # A payload is not a signature. Only the Review panel signs truth
        # (§2); anything arriving this way has its claim stripped and its
        # trust pulled back below the line.
        return unsigned(rec)
