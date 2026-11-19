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

import re
from collections.abc import Iterable
from typing import Any

from . import hazards

MASK = "[kept private]"
_MIN_PHRASE = 8                       # shorter text would blank ordinary words everywhere

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


def mask(text: str, phrases: Iterable[str]) -> str:
    """*text* with every private sentence replaced by "[kept private]".

    A conversation is the owner's own raw words, so it can still hold a sentence
    the owner later made private. Wherever a conversation is shown, that sentence
    is blanked (matching ignores case and line breaks).
    """
    out = text or ""
    for phrase in phrases:
        phrase = " ".join(str(phrase or "").split())
        if len(phrase) < _MIN_PHRASE:
            continue
        pattern = r"\s+".join(re.escape(word) for word in phrase.split(" "))
        out = re.sub(pattern, MASK, out, flags=re.I)
    return out


def mask_conversation(conv: dict[str, Any], phrases: Iterable[str]) -> dict[str, Any]:
    """A copy of a conversation (as the store returns it) with private sentences blanked."""
    phrases = list(phrases)
    if not phrases:
        return conv
    masked = dict(conv)
    if "text" in masked:
        masked["text"] = mask(str(masked.get("text") or ""), phrases)
    if isinstance(masked.get("parts"), list):
        masked["parts"] = [
            {**p, "content": mask(str(p.get("content") or ""), phrases)} if isinstance(p, dict) else p
            for p in masked["parts"]
        ]
    return masked
