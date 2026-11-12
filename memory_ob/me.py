"""The "Me" view: what is true about the owner's life right now.

One place that answers "what do you know about me, and what am I in the middle
of?". It is built from the same signed records as everything else; nothing is
stored twice.

Rules that keep it from becoming a junk drawer:

* plans and projects that have been quiet for 90 days move to "Earlier";
* anything the owner said they would come back to is listed with its date;
* health and money are shown apart, never mixed into the general lists.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from . import exit as exit_gate, topics
from .records import ACTIVE, CAPSULE, JOURNAL, STORY, Record

QUIET_DAYS = 90

_SKIP_KINDS = {CAPSULE, STORY, JOURNAL}


def _parse(stamp: str | None) -> datetime | None:
    if not stamp:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(stamp, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _item(rec: Record) -> dict[str, Any]:
    return {
        "id": rec.id,
        "text": rec.body or rec.title,
        "category": topics.category_of(rec.tags, rec.body or rec.title),
        "updated": rec.modified or rec.created,
        "revisit_at": topics.revisit_of(rec.source),
        "by": "AI" if str(rec.confirmed_by or "").startswith("ai@") else "you",
    }


def build(store: Any, *, now: datetime | None = None) -> dict[str, Any]:
    """The Me view as plain data."""
    now = now or datetime.now(timezone.utc)
    quiet_before = now - timedelta(days=QUIET_DAYS)

    items: list[dict[str, Any]] = []
    for rec in store.list_records(status=ACTIVE, limit=10000):
        if rec.speaker != "user" or rec.kind in _SKIP_KINDS or rec.subject != "self":
            continue
        if not exit_gate.keep(rec):      # law 2: withheld records never appear on a screen
            continue
        items.append(_item(rec))
    items.sort(key=lambda i: i["updated"] or "", reverse=True)

    today = now.strftime("%Y-%m-%d")
    coming = sorted(
        (dict(i, due=bool(i["revisit_at"] and i["revisit_at"] <= today))
         for i in items if i["revisit_at"]),
        key=lambda i: i["revisit_at"],
    )
    coming_ids = {i["id"] for i in coming}

    candidates = [i for i in items if i["id"] not in coming_ids]

    def is_current(i: dict[str, Any]) -> bool:
        """Plans and ideas, plus anything said with intent ("I want to start a business").

        Health and money stay in their own private sections.
        """
        if i["category"] in (topics.PLANS, topics.IDEAS):
            return True
        return i["category"] in (topics.WORK, topics.LEARNING, topics.INTERESTS, topics.LIFE) and topics.has_intent(i["text"])

    def is_quiet(i: dict[str, Any]) -> bool:
        when = _parse(i["updated"])
        return bool(when and when < quiet_before)

    now_items = [i for i in candidates if is_current(i) and not is_quiet(i)]
    earlier = [i for i in candidates if is_current(i) and is_quiet(i)]
    rest = [i for i in candidates if not is_current(i)]

    def pick(*cats: str) -> list[dict[str, Any]]:
        return [i for i in rest if i["category"] in cats]

    sections = [
        {"key": "now", "title": "What you're doing right now", "items": now_items},
        {"key": "coming", "title": "Coming back to", "items": coming},
        {"key": "work", "title": "Work and study", "items": pick(topics.WORK, topics.LEARNING)},
        {"key": "life", "title": "About you", "items": pick(topics.LIFE, topics.INTERESTS)},
        {"key": "health", "title": "Health", "items": pick(topics.HEALTH), "sensitive": True},
        {"key": "money", "title": "Money", "items": pick(topics.MONEY), "sensitive": True},
        {"key": "earlier", "title": "Earlier", "items": earlier},
    ]
    return {
        "sections": [s for s in sections if s["items"]],
        "total": len(items),
    }


def render_markdown(data: dict[str, Any]) -> str:
    """The Me view as a markdown note for the vault."""
    lines = ["# Me", "", "_Kept up to date automatically. Edit anything in Memory_OB._", ""]
    if not data["sections"]:
        lines.append("Nothing yet.")
    for section in data["sections"]:
        lines += [f"## {section['title']}", ""]
        for item in section["items"]:
            extra = f" _(come back on {item['revisit_at']})_" if item.get("revisit_at") else ""
            lines.append(f"- {item['text']}{extra}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
