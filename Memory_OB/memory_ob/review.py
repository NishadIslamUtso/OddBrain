"""The Review panel — one decision surface, four card types.

Cards are how truth is created, changed, or retired. The AI proposes; the
owner signs. Every resolution is logged to the activity log, and nothing is
ever deleted (law 3) — denial is a resolution, not a removal.

Card types:
    diff      — old vs new, side by side
    proposal  — a new record drafted from evidence
    ask       — a doubt or conflict, speakers named
    merge     — a proposed duplicate merge (owner-driven, undoable)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from . import ids
from .records import ACTIVE, Record

DIFF = "diff"
PROPOSAL = "proposal"
ASK = "ask"
MERGE = "merge"
# A fact that lost a duplicate contest. Kept, out of the pool.
MERGED = "merged"

CARD_TYPES: tuple[str, ...] = (DIFF, PROPOSAL, ASK, MERGE)

PENDING = "pending"
RESOLVED = "resolved"

# Actions
APPROVE = "approve"
DENY = "deny"
KEEP_BOTH = "keep_both"
TAKE_NEW = "take_new"
TAKE_OLD = "take_old"
EDIT = "edit"
LATER = "later"
CONFIRM = "confirm"
DISMISS = "dismiss"
MERGE_IT = "merge"
UNDO = "undo"

ACTIONS: tuple[str, ...] = (
    APPROVE,
    DENY,
    KEEP_BOTH,
    TAKE_NEW,
    TAKE_OLD,
    EDIT,
    LATER,
    CONFIRM,
    DISMISS,
    MERGE_IT,
    UNDO,
)

_CARD_SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    old TEXT,
    new TEXT,
    record_id TEXT,
    speakers TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    resolution TEXT,
    created TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
"""


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(slots=True)
class Card:
    """One review card."""

    id: str
    type: str
    title: str = ""
    body: str = ""
    old: dict[str, Any] | None = None
    new: dict[str, Any] | None = None
    record_id: str | None = None
    speakers: list[str] = field(default_factory=list)
    status: str = PENDING
    resolution: str | None = None
    created: str = ""
    resolved_at: str | None = None
    resolved_by: str | None = None
    note: str | None = None

    def __post_init__(self) -> None:
        if self.type not in CARD_TYPES:
            raise ValueError(f"unknown card type: {self.type!r}")
        if self.status not in (PENDING, RESOLVED):
            raise ValueError(f"unknown card status: {self.status!r}")

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)


def _edit_fields(edit: dict[str, Any] | None) -> dict[str, Any]:
    """Turn the editor's payload into record fields.

    The editor names the field it is editing (title, body, ...) rather than
    always writing ``text``, so the owner's wording lands where it belongs.
    """
    if not edit:
        return {}
    out = dict(edit)
    field = str(out.pop("field", "") or "")
    if field and "text" in out:
        out[field] = out.pop("text")
    return out


def _record_from_payload(data: dict[str, Any], *, fallback_speaker: str = "user") -> Record:
    """Build a Record from a card payload, filling safe defaults.

    A proposal or diff payload may carry only a few fields; the rest get
    defaults so the record is always valid.
    """
    d = dict(data)
    if fallback_speaker != "user":
        d.setdefault("speaker", fallback_speaker)
    return Record.from_payload(d)


class CardStore:
    """Creates and resolves review cards against a :class:`Store`."""

    def __init__(self, store: Any) -> None:
        self.store = store
        self.store.conn.executescript(_CARD_SCHEMA)
        self.store.conn.commit()

    # -- creation ----------------------------------------------------------

    def propose_diff(
        self,
        *,
        record_id: str,
        old: dict[str, Any],
        new: dict[str, Any],
        title: str = "",
        body: str = "",
    ) -> Card:
        """Propose a change to an existing (confirmed) record."""
        card = Card(
            id=ids.new_id(),
            type=DIFF,
            title=title or "Proposed change",
            body=body,
            old=old,
            new=new,
            record_id=record_id,
            created=_now(),
        )
        return self._save(card)

    def propose_record(
        self,
        *,
        new: dict[str, Any],
        title: str = "",
        body: str = "",
        speakers: list[str] | None = None,
    ) -> Card:
        """Propose creating a brand-new record."""
        card = Card(
            id=ids.new_id(),
            type=PROPOSAL,
            title=title or "Proposed record",
            body=body,
            new=new,
            speakers=speakers or [],
            created=_now(),
        )
        return self._save(card)

    def propose_ask(
        self,
        *,
        title: str,
        body: str,
        speakers: list[str] | None = None,
    ) -> Card:
        """Raise a doubt or conflict, with the speakers named."""
        card = Card(
            id=ids.new_id(),
            type=ASK,
            title=title,
            body=body,
            speakers=speakers or [],
            created=_now(),
        )
        return self._save(card)

    def propose_merge(
        self,
        *,
        record_id: str,
        other_id: str,
        title: str = "",
        body: str = "",
    ) -> Card:
        """Propose merging two records (owner-driven, undoable)."""
        card = Card(
            id=ids.new_id(),
            type=MERGE,
            title=title or "Proposed merge",
            body=body,
            record_id=record_id,
            old={"record_id": record_id},
            new={"record_id": other_id},
            created=_now(),
        )
        return self._save(card)

    def _save(self, card: Card) -> Card:
        import json

        self.store.conn.execute(
            "INSERT OR REPLACE INTO cards"
            "(id, type, title, body, old, new, record_id, speakers, status,"
            " resolution, created, resolved_at, resolved_by, note)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                card.id, card.type, card.title, card.body,
                json.dumps(card.old) if card.old else None,
                json.dumps(card.new) if card.new else None,
                card.record_id, json.dumps(card.speakers), card.status,
                card.resolution, card.created, card.resolved_at,
                card.resolved_by, card.note,
            ),
        )
        self.store.conn.commit()
        return card

    # -- reading -----------------------------------------------------------

    def get(self, card_id: str) -> Card | None:
        import json

        row = self.store.conn.execute(
            "SELECT * FROM cards WHERE id = ?", (card_id,)
        ).fetchone()
        if not row:
            return None
        return Card(
            id=row["id"],
            type=row["type"],
            title=row["title"],
            body=row["body"],
            old=json.loads(row["old"]) if row["old"] else None,
            new=json.loads(row["new"]) if row["new"] else None,
            record_id=row["record_id"],
            speakers=json.loads(row["speakers"]),
            status=row["status"],
            resolution=row["resolution"],
            created=row["created"],
            resolved_at=row["resolved_at"],
            resolved_by=row["resolved_by"],
            note=row["note"],
        )

    def list(
        self, *, type: str | None = None, status: str = PENDING, limit: int = 200
    ) -> list[Card]:
        sql = "SELECT id FROM cards WHERE status = ?"
        params: list[Any] = [status]
        if type is not None:
            sql += " AND type = ?"
            params.append(type)
        sql += " ORDER BY created DESC LIMIT ?"
        params.append(limit)
        rows = self.store.conn.execute(sql, params).fetchall()
        return [c for c in (self.get(r["id"]) for r in rows) if c is not None]

    # -- resolution --------------------------------------------------------

    def resolve(
        self,
        card_id: str,
        action: str,
        *,
        by: str | None = None,
        note: str | None = None,
        edit: dict[str, Any] | None = None,
    ) -> Card | None:
        """Apply *action* to a card. Returns the resolved card.

        ``later`` leaves the card pending (it never nags; it just waits).
        """
        if action not in ACTIONS:
            raise ValueError(f"unknown action: {action!r}")
        card = self.get(card_id)
        if card is None:
            return None
        if action == UNDO:
            return self._undo(card, by=by)
        if card.status == RESOLVED:
            return card
        if action == LATER:
            return card

        if card.type == DIFF:
            self._resolve_diff(card, action, edit=edit)
        elif card.type == PROPOSAL:
            self._resolve_proposal(card, action, edit=edit)
        elif card.type == ASK:
            self._resolve_ask(card, action)
        elif card.type == MERGE:
            self._resolve_merge(card, action)

        card.status = RESOLVED
        card.resolution = action
        card.resolved_at = _now()
        card.resolved_by = by
        card.note = note
        self._save(card)
        self.store.log_activity(
            f"card:{action}",
            f"{card.type} {card.id}" + (f" — {note}" if note else ""),
            actor=by,
        )
        return card

    def _undo(self, card: Card, *, by: str | None = None) -> Card:
        """Put back what a truth-changing resolution replaced.

        The card keeps the record as it was before the change, so a mistaken
        'take new' is reversible rather than a silent overwrite. The card goes
        back to pending so the owner decides again.
        """
        if card.type != DIFF or not card.old or not card.record_id:
            return card
        rec = self.store.get_record(card.record_id)
        if rec is None:
            return card
        restored = Record.from_dict({**rec.to_dict(), **card.old})
        self.store.sign_record(
            restored, card_id=card.id, changed_by=by, reason="card:undo"
        )
        card.status = PENDING
        card.resolution = None
        card.resolved_at = None
        self._save(card)
        self.store.log_activity(
            f"card:{UNDO}",
            f"restored {card.record_id} from {card.id}",
            actor=by,
        )
        return card

    def _resolve_diff(
        self, card: Card, action: str, *, edit: dict[str, Any] | None = None
    ) -> None:
        assert card.record_id is not None
        rec = self.store.get_record(card.record_id)
        if rec is None:
            return
        if action == TAKE_NEW and card.new:
            # The owner's edit wins over the proposal's wording.
            updated = Record.from_dict(
                {**rec.to_dict(), **card.new, **_edit_fields(edit)}
            )
            # Taking the new side CHANGES truth, so it is signed again.
            self.store.sign_record(
                updated, card_id=card.id, changed_by=card.resolved_by,
                reason="card:take_new",
            )
        elif action == KEEP_BOTH and card.new:
            new_rec = _record_from_payload(card.new, fallback_speaker=rec.speaker)
            self.store.sign_record(
                new_rec, card_id=card.id, changed_by=card.resolved_by,
                reason="card:keep_both",
            )
        elif action == EDIT and edit:
            updated = Record.from_dict({**rec.to_dict(), **_edit_fields(edit)})
            self.store.sign_record(
                updated, card_id=card.id, changed_by=card.resolved_by,
                reason="card:edit",
            )
        elif action == APPROVE and card.new:
            updated = Record.from_dict(
                {**rec.to_dict(), **card.new, **_edit_fields(edit)}
            )
            self.store.sign_record(
                updated, card_id=card.id, changed_by=card.resolved_by,
                reason="card:approve",
            )
        # TAKE_OLD / DENY leave the record untouched.

    def _resolve_proposal(
        self, card: Card, action: str, *, edit: dict[str, Any] | None = None
    ) -> None:
        if action != APPROVE:
            return
        data = {**(card.new or {}), **_edit_fields(edit)}
        if not data:
            return
        rec = _record_from_payload(data)
        rec.status = ACTIVE
        # This is the signature: the card that approved it, and when.
        self.store.sign_record(
            rec, card_id=card.id, changed_by=card.resolved_by,
            reason="card:approve",
        )

    def _resolve_ask(self, card: Card, action: str) -> None:
        # Confirm/dismiss both just resolve the question. A confirmed ask may
        # optionally create a record through a follow-up proposal card.
        return

    def _resolve_merge(self, card: Card, action: str) -> None:
        if action != MERGE_IT:
            return
        assert card.record_id is not None
        other_id = (card.new or {}).get("record_id")
        if not other_id:
            return
        primary = self.store.get_record(card.record_id)
        secondary = self.store.get_record(other_id)
        if primary is None or secondary is None:
            # The dream's dedup scan works on candidate FACTS, not records, so a
            # card it opens carries fact ids. Without this branch the card
            # resolved, logged "done", and changed nothing.
            a = self.store.get_fact(card.record_id)
            b = self.store.get_fact(other_id)
            if a is not None and b is not None:
                self.store.set_fact_status(other_id, MERGED)
                self.store.log_activity(
                    "merge", f"{other_id} → {card.record_id}", actor=card.resolved_by
                )
            return
        # Law 10: people are never merged by the AI. This path is only
        # reachable through an explicit owner action on a merge card.
        primary.links.setdefault("merged", []).append(other_id)
        self.store.update_record(
            primary, changed_by=card.resolved_by, reason=f"merge: {other_id}"
        )
        self.store.supersede(other_id, reason=f"merged into {primary.id}")

    # -- stats -------------------------------------------------------------

    def counts(self) -> dict[str, int]:
        rows = self.store.conn.execute(
            "SELECT type, COUNT(*) AS n FROM cards WHERE status = 'pending'"
            " GROUP BY type"
        ).fetchall()
        out = {t: 0 for t in CARD_TYPES}
        for r in rows:
            out[r["type"]] = int(r["n"])
        return out
