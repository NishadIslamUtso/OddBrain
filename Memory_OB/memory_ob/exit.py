"""The retrieval exit — where memory becomes evidence (§7, law 2, law 5).

The store takes anything; the door out obeys the law. Every record that
leaves the engine for a model, a screen, an export or a receipt passes
through here:

* **neverSend** records are dropped whole — their text, their title, and
  even the count of how many were withheld (law 2);
* **hazardous** records are dropped with them, because nothing from memory
  is ever an instruction (law 5).

The scanner runs at capture too (:mod:`memory_ob.extract`), but capture is
the way IN. This is the way OUT — the boundary the model actually crosses.
"""

from __future__ import annotations

from typing import Any, Iterable

from . import hazards

# Fields whose contents could carry an instruction.
_SCANNED_FIELDS = ("title", "body")


def keep(record: Any) -> bool:
    """False when *record* may not leave the store.

    Accepts either a :class:`~memory_ob.records.Record` or the dict that
    :meth:`Record.to_dict` produces.
    """
    data = record.to_dict() if hasattr(record, "to_dict") else record
    if not isinstance(data, dict):
        return True
    if data.get("never_send"):
        return False
    for field in _SCANNED_FIELDS:
        if hazards.is_hazardous(str(data.get(field) or "")):
            return False
    return True


def records_out(records: Iterable[Any]) -> list[Any]:
    """Filter an iterable of records through the exit gate."""
    return [r for r in records if keep(r)]


def dicts_out(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter already-serialised record dicts through the exit gate."""
    return [d for d in records if keep(d)]


def counts(total: int, shown: int) -> dict[str, int]:
    """Counts that never reveal how many records the gate withheld.

    Only what left is reported. A ``total`` that included withheld records
    would itself be a leak (law 2: never leaks counts).
    """
    return {"shown": shown}


def redact_text(text: str) -> str:
    """Replace hazardous spans so a caller can keep the surrounding record."""
    if not hazards.is_hazardous(text):
        return text
    return "[withheld: hazardous content]"


def card_out(card: dict[str, Any]) -> dict[str, Any] | None:
    """A review card ready for the screen, or ``None`` when it must not appear.

    A card whose old/new payload is a neverSend record is withheld entirely —
    quoting it would leak the very text the flag protects. Hazardous wording
    in the card's own title or body is redacted rather than dropped, so the
    owner still sees that a decision is waiting.
    """
    for side in ("old", "new"):
        rec = card.get(side)
        if isinstance(rec, dict) and not keep(rec):
            return None
    out = dict(card)
    for field in ("title", "body"):
        value = str(out.get(field) or "")
        if hazards.is_hazardous(value):
            out[field] = redact_text(value)
    return out


def cards_out(cards: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter review cards through :func:`card_out`."""
    return [c for c in (card_out(card) for card in cards) if c is not None]
