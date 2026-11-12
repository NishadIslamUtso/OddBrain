"""Everything Memory_OB wants the owner to decide, as one plain list.

There are only a few kinds of question, and each one comes from something the
owner just said or brought in:

* **changed**  – a new statement does not match what is saved ("I moved to
  Chittagong" next to "I live in Dhaka"). Answers: use the new one, keep the
  old one, or keep both.
* **same_person** – two profiles might be one person. Answers: yes or no.
* **other**    – a question left by an older version, shown so it is not lost.

Each doubt carries the exact buttons it offers, so the screen never has to
guess and never shows a button that does nothing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import exit as exit_gate, manager, topics
from .review import APPROVE, ASK, DENY, DIFF, DISMISS, CONFIRM, MERGE, MERGE_IT, PROPOSAL, CardStore


def _text(fields: dict[str, Any] | None) -> str:
    f = fields or {}
    return str(f.get("body") or f.get("title") or f.get("text") or "").strip()


def _card_doubt(store: Any, card: Any) -> dict[str, Any]:
    if card.type == DIFF:
        old_rec = store.get_record(card.record_id) if card.record_id else None
        new_text = _text(card.new)
        return {
            "id": card.id, "source": "card", "kind": "changed", "at": card.created,
            "title": "Your answer changed?",
            "question": "What you just said does not match something you said before. Which is right?",
            "before": _text(card.old), "before_when": (old_rec.modified or old_rec.created) if old_rec else "",
            "after": new_text, "after_when": card.created,
            "category": topics.category_of((card.new or {}).get("tags"), new_text),
            "options": [
                {"key": "new", "label": "Use the new one"},
                {"key": "old", "label": "Keep the old one"},
                {"key": "both", "label": "Both are true"},
            ],
        }
    if card.type == MERGE:
        return {
            "id": card.id, "source": "card", "kind": "other", "at": card.created,
            "title": card.title or "These may be the same", "question": card.body or "",
            "before": "", "after": "", "options": [
                {"key": "merge", "label": "Same thing, join them"},
                {"key": "dismiss", "label": "Keep them separate"},
            ],
        }
    if card.type == PROPOSAL:
        return {
            "id": card.id, "source": "card", "kind": "other", "at": card.created,
            "title": card.title or "A suggestion", "question": card.body or "",
            "before": "", "after": "", "options": [
                {"key": "approve", "label": "Add it"}, {"key": "deny", "label": "Skip"},
            ],
        }
    return {
        "id": card.id, "source": "card", "kind": "other", "at": card.created,
        "title": card.title or "A question", "question": card.body or "",
        "before": "", "after": "", "options": [
            {"key": "ok", "label": "OK"}, {"key": "dismiss", "label": "Dismiss"},
        ],
    }


def _confirmation_doubt(store: Any, conf: dict[str, Any]) -> dict[str, Any]:
    try:
        ctx = json.loads(conf.get("context") or "{}")
    except ValueError:
        ctx = {}
    if isinstance(ctx, dict) and ctx.get("kind") == "same_person" and len(ctx.get("ids", [])) == 2:
        people = [store.get_person(i) for i in ctx["ids"]]
        if all(people):
            return {
                "id": conf["id"], "source": "confirmation", "kind": "same_person", "at": conf["at"],
                "title": "Same person?", "question": conf["question"],
                "people": [{"id": p["id"], "name": p["name"], "relation": p["relation"]} for p in people],
                "before": "", "after": "",
                "options": [
                    {"key": "yes", "label": "Yes, the same person"},
                    {"key": "no", "label": "No, two different people"},
                ],
            }
    return {
        "id": conf["id"], "source": "confirmation", "kind": "other", "at": conf["at"],
        "title": "A question", "question": conf["question"], "before": "", "after": "",
        "options": [{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}],
    }


def list_doubts(store: Any, *, limit: int = 100) -> list[dict[str, Any]]:
    """Every pending question, newest first."""
    out = []
    for card in CardStore(store).list(status="pending", limit=limit):
        if exit_gate.card_out(card.to_dict()) is None:     # quotes a neverSend record: never shown
            continue
        out.append(_card_doubt(store, card))
    for conf in store.list_confirmations(status="pending", limit=limit):
        out.append(_confirmation_doubt(store, conf))
    for d in out:
        for key in ("title", "question", "before", "after"):
            if d.get(key):
                d[key] = exit_gate.redact_text(str(d[key]))
    out.sort(key=lambda d: d["at"] or "", reverse=True)
    return out[:limit]


def answer(store: Any, doubt_id: str, choice: str, *, vault: Path | None = None) -> dict[str, Any]:
    """Apply the owner's answer to one doubt. Raises ``LookupError`` / ``ValueError``."""
    cards = CardStore(store)
    card = cards.get(doubt_id)
    if card is not None:
        if card.status != "pending":
            return {"result": "gone"}
        if card.type == DIFF:
            return manager.answer_conflict(store, doubt_id, choice, vault=vault)
        mapping = {
            MERGE: {"merge": MERGE_IT, "dismiss": DISMISS},
            PROPOSAL: {"approve": APPROVE, "deny": DENY},
            ASK: {"ok": CONFIRM, "dismiss": DISMISS},
        }.get(card.type, {"ok": CONFIRM, "dismiss": DISMISS})
        if choice not in mapping:
            raise ValueError("that is not one of the choices")
        cards.resolve(doubt_id, mapping[choice], by=manager.OWNER)
        return {"result": "ok"}

    conf = store.get_confirmation(doubt_id)
    if conf is None:
        raise LookupError("no such question")
    if conf["status"] != "pending":
        return {"result": "gone"}
    if choice not in ("yes", "no"):
        raise ValueError("answer yes or no")
    done = manager.answer_confirmation(store, doubt_id, choice, vault=vault)
    return {"result": "ok", "merged": bool(done and done["merged"])}
