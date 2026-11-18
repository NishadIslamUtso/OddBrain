"""The "recently remembered" feed: what the AI did lately, in plain words.

Everything comes from the change log, so the feed can never show something that
did not happen. Each item says what changed, who did it, and whether it can be
put back with one tap.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import exit as exit_gate, topics

# -- clearing the "recently remembered" list (owner decision D2) --------------------
# Clearing only hides items from that list. Nothing is deleted: the memories
# and the full history stay exactly as they were.

DISMISSED_FILE = "feed-dismissed.json"


def _dismissed_path(vault: Path) -> Path:
    return Path(vault) / ".brain" / DISMISSED_FILE


def dismissed(vault: Path | None) -> set[int]:
    """Change numbers the owner has cleared from the feed ('Got it')."""
    if vault is None:
        return set()
    try:
        raw = json.loads(_dismissed_path(vault).read_text(encoding="utf-8"))
        return {int(s) for s in raw.get("seqs", [])}
    except Exception:  # noqa: BLE001 - a missing or damaged file just means "nothing cleared"
        return set()


def dismiss(vault: Path | None, seqs: list[int]) -> int:
    """Hide these changes from the feed. Returns how many were newly hidden."""
    if vault is None:
        return 0
    have = dismissed(vault)
    want = {int(s) for s in seqs}
    new = want - have
    all_seq = have | want
    if new:
        path = _dismissed_path(vault)
        path.parent.mkdir(parents=True, exist_ok=True)
        keep = sorted(s for s in all_seq if s > max(all_seq) - 500)   # bounded file
        path.write_text(json.dumps({"seqs": keep}), encoding="utf-8")
    return len(new)

_CATEGORY_FALLBACK = topics.LIFE


def _text_of(snapshot: dict[str, Any] | None) -> str:
    snap = snapshot or {}
    return str(snap.get("body") or snap.get("title") or snap.get("text") or snap.get("name") or "").strip()


def _category_of(snapshot: dict[str, Any] | None) -> str:
    snap = snapshot or {}
    if snap.get("category") in topics.CATEGORIES:
        return str(snap["category"])
    return topics.category_of(snap.get("tags"), _text_of(snap)) if snap else _CATEGORY_FALLBACK


def _by(actor: str) -> str:
    return "you" if actor in ("owner", "you") or actor.startswith("owner") else "AI"


def _owner_flag(person: dict[str, Any] | None) -> bool:
    return "this-is-me" in ((person or {}).get("tags") or [])


def describe(change: dict[str, Any]) -> dict[str, Any]:
    """One change as a plain-language feed item (without the undo flags)."""
    entity, action = change["entity"], change["action"]
    before, after = change.get("before") or {}, change.get("after") or {}
    item: dict[str, Any] = {
        "seq": change["seq"], "at": change["at"], "by": _by(change.get("actor") or ""),
        "entity": entity, "entity_id": change["entity_id"],
        "verb": "", "text": "", "was": "", "category": "", "note": "",
    }

    if entity == "record":
        item["category"] = _category_of(after or before)
        if action == "create":
            item.update(verb="Remembered", text=_text_of(after))
        elif action == "update":
            was_tags, now_tags = before.get("tags") or [], after.get("tags") or []
            if _text_of(before) == _text_of(after) and topics.DONE_TAG in now_tags and topics.DONE_TAG not in was_tags:
                item.update(verb="Ticked off", text=_text_of(after))
            elif _text_of(before) == _text_of(after) and topics.TODO_TAG in now_tags and topics.DONE_TAG in was_tags:
                item.update(verb="Put back on your list", text=_text_of(after))
            else:
                item.update(verb="Updated", text=_text_of(after), was=_text_of(before))
        elif action in ("remove", "retire", "retract"):
            item.update(verb="Removed", text=_text_of(before or after))
        else:
            item.update(verb=action.capitalize(), text=_text_of(after or before))
    elif entity == "person":
        if action == "merge":
            keep = (change.get("before") or {}).get("keep_before", {}).get("name", "")
            other = (change.get("before") or {}).get("other_before", {}).get("name", "")
            item.update(verb="Joined two profiles", text=f"{other} is now part of {keep}",
                        category="People")
        elif action == "create":
            item.update(verb="Added a person", text=str(after.get("name", "")), category="People")
        elif action == "remove":
            item.update(verb="Removed a profile", text=str(before.get("name", "")), category="People")
        elif _owner_flag(after) != _owner_flag(before):
            item.update(verb="Marked as you" if _owner_flag(after) else "Taken off as you",
                        text=str(after.get("name", "")), category="People")
        else:
            item.update(verb="Edited a profile", text=str(after.get("name", "")), category="People")
    elif entity == "import":
        n = int(after.get("count", 0))
        chats = after.get("unit") == "conversations"
        unit = ("conversation" if n == 1 else "conversations") if chats else ("memory" if n == 1 else "memories")
        item.update(verb="Brought in", text=f"{n} {unit} from {after.get('source', 'a file')}",
                    category="Import")
    elif entity == "doubt":
        item.update(verb="Discarded both" if action == "neither" else "Kept your earlier answer",
                    text=str(after.get("text", "")), category="")
    else:
        item.update(verb=action.capitalize(), text=_text_of(after or before))
    if change.get("reason") and item["by"] == "AI":
        item["note"] = str(change["reason"])
    return item


def _message_of(change: dict[str, Any]) -> str:
    """The message a change came from, for the AI's new memories ("" for anything else)."""
    if change["entity"] != "record" or change["action"] != "create" or not str(change.get("actor") or "").startswith("memory_ob"):
        return ""
    after = change.get("after") or {}
    source = after.get("source") if isinstance(after, dict) else None
    return str(source.get("conversation_id") or "") if isinstance(source, dict) else ""


def _group(run: list[dict[str, Any]]) -> dict[str, Any]:
    """Several memories the AI took from one message, as one card. *run* is newest first."""
    n = len(run)
    cats: dict[str, int] = {}
    for item in run:
        if item["category"]:
            cats[item["category"]] = cats.get(item["category"], 0) + 1
    return {
        "group": True, "entity": "group", "entity_id": "", "seq": run[0]["seq"], "at": run[0]["at"],
        "by": "AI", "category": "", "text": "", "was": "", "note": "",
        "verb": f"Saved {n} things from your message",
        "count": n,
        "categories": [{"name": k, "count": v} for k, v in sorted(cats.items(), key=lambda kv: -kv[1])],
        "items": run,
        "seqs": [i["seq"] for i in run],
        "undone": all(i["undone"] for i in run),
        "can_undo": any(i["can_undo"] for i in run),
        "undo_seqs": [i["seq"] for i in run if i["can_undo"]],
    }


def build(store: Any, *, limit: int = 60, hide_undone: bool = False,
          dismissed: set[int] | None = None) -> list[dict[str, Any]]:
    """The most recent changes, newest first, each marked undoable or not.

    Memories the AI took from one message are shown as one card (with the list inside).
    With *hide_undone* a change you have already put back is left out, so the screen clears as
    you undo; the history (the command line, tests) keeps them.
    """
    items: list[dict[str, Any]] = []
    keys: list[str] = []
    private = store.private_ids()          # made private after the change was logged
    for change in store.list_changes(limit=limit * 4):
        if change["entity"] == "record" and change["entity_id"] in private:
            continue
        if change["entity"] == "record" and change.get("reason") == "you said neither answer is right":
            continue          # the "Discarded both" line carries this one, with its own Undo
        if change["entity"] == "record" and not all(
            exit_gate.keep(snap) for snap in (change.get("before"), change.get("after")) if isinstance(snap, dict)
        ):
            continue          # law 2: a withheld record never shows up in the feed either
        undone = bool(change.get("undone_at"))
        if undone and hide_undone:
            continue
        if dismissed and change["seq"] in dismissed:
            continue          # the owner cleared this one from the list ("Got it")
        item = describe(change)
        item["undone"] = undone
        item["can_undo"] = (
            not undone
            and (change["entity"] in ("record", "person", "import")
                 or (change["entity"] == "doubt" and change["action"] in ("keep_old", "neither")))
            and not (change["entity"] == "person" and change["action"] not in ("merge", "update", "remove", "create"))
            and not store.has_later_change(change["entity_id"], change["seq"])
        )
        items.append(item)
        keys.append(_message_of(change))
    out: list[dict[str, Any]] = []
    i = 0
    while i < len(items):
        j = i + 1
        if keys[i]:
            while j < len(items) and keys[j] == keys[i]:
                j += 1
        out.append(_group(items[i:j]) if j - i >= 2 else items[i])
        i = j
    return out[:limit]
