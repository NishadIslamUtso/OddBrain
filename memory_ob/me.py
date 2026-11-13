"""The "Me" view: what is true about the owner's life right now.

One place that answers "what do you know about me, and what am I in the middle
of?". It is built from the same signed records as everything else; nothing is
stored twice.

Rules that keep it from becoming a junk drawer:

* plans and projects that have been quiet for 90 days move to "Earlier";
* anything the owner said they would come back to is listed with its date;
* health and money are shown apart, never mixed into the general lists;
* things to do are listed apart, and a project (a business idea, say) is one
  entry that opens its own note instead of a dozen loose lines.
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
        "thread": topics.thread_of_tags(rec.tags),
        "todo": topics.TODO_TAG in rec.tags,
        "done": topics.DONE_TAG in rec.tags,
    }


def build(store: Any, *, now: datetime | None = None, vault: Any = None) -> dict[str, Any]:
    """The Me view as plain data. *vault* lets a project entry say which note it opens."""
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

    todo = [i for i in items if i["todo"] and not i["done"]]
    finished = [i for i in items if i["done"]]
    in_todo = {i["id"] for i in todo} | {i["id"] for i in finished}

    projects: dict[str, list[dict[str, Any]]] = {}
    for i in items:
        if i["thread"] and i["id"] not in in_todo:
            projects.setdefault(i["thread"], []).append(i)
    project_entries = []
    index: dict[str, str] = {}
    if vault is not None:
        from . import vault as vault_mod

        index = vault_mod._load_index(vault)  # noqa: SLF001
    for name, members in projects.items():
        members.sort(key=lambda i: i["updated"] or "", reverse=True)
        slug = topics.thread_slug(name)
        due = sorted(m["revisit_at"] for m in members if m["revisit_at"])
        project_entries.append({
            "id": f"project:{slug}", "title": name, "thread": name, "category": topics.IDEAS,
            "text": f"{len(members)} note{'s' if len(members) != 1 else ''}. Latest: {members[0]['text']}",
            "updated": members[0]["updated"], "revisit_at": due[0] if due else None, "by": "AI",
            "readonly": True, "count": len(members), "path": index.get(f"project:{slug}", ""),
            "due": bool(due and due[0] <= now.strftime("%Y-%m-%d")),
        })
    project_entries.sort(key=lambda e: e["updated"] or "", reverse=True)
    in_project = {m["id"] for ms in projects.values() for m in ms}
    # A project already shows its "come back" date, so it is not listed a second time.
    coming = [i for i in coming if i["id"] not in in_project]
    coming_ids = {i["id"] for i in coming}

    candidates = [i for i in items if i["id"] not in coming_ids and i["id"] not in in_todo
                  and i["id"] not in in_project]

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
        {"key": "todo", "title": "To do", "items": todo},
        {"key": "projects", "title": "Projects and ideas", "items": project_entries},
        {"key": "now", "title": "What you're doing right now", "items": now_items},
        {"key": "coming", "title": "Coming back to", "items": coming},
        {"key": "work", "title": "Work and study", "items": pick(topics.WORK, topics.LEARNING)},
        {"key": "life", "title": "About you", "items": pick(topics.LIFE, topics.INTERESTS)},
        {"key": "health", "title": "Health", "items": pick(topics.HEALTH), "sensitive": True},
        {"key": "money", "title": "Money", "items": pick(topics.MONEY), "sensitive": True},
        {"key": "earlier", "title": "Earlier", "items": earlier + finished},
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
            if section["key"] == "todo":
                lines.append(f"- [ ] {item['text']}{extra}")
            elif item.get("readonly"):
                lines.append(f"- [[{item['title']}]]: {item['text']}{extra}")
            elif item.get("done"):
                lines.append(f"- [x] {item['text']}")
            else:
                lines.append(f"- {item['text']}{extra}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
