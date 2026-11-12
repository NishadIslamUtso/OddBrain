"""The biography: a professional write-up of the owner, kept up to date.

It is written from the owner's saved memories and nothing else. With an AI
helper it reads as prose; without one it is a plain outline by topic, labelled
as such, and is rewritten as prose the next time a helper is available.

Two guarantees:

* nothing is invented: the helper is told to use only the facts it is given,
  and the facts are the owner's own active, shareable memories;
* the owner's edits are respected: once the owner edits the text, it is
  *locked* and is never rewritten by the AI until the owner asks for that.

Health and money details are left out unless the owner allows them in
Settings, because a biography is the one document likely to be shared.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import exit as exit_gate, topics
from .records import ACTIVE, CAPSULE, JOURNAL, STORY

logger = logging.getLogger(__name__)

FILE = ".brain/biography.json"
MAX_FACTS = 300
SENSITIVE = (topics.HEALTH, topics.MONEY)

# The order a biography reads in.
_ORDER = (
    topics.LIFE, topics.LEARNING, topics.WORK, topics.IDEAS, topics.PLANS,
    topics.INTERESTS, topics.HEALTH, topics.MONEY,
)
_HEADINGS = {
    topics.LIFE: "Background",
    topics.LEARNING: "Education and learning",
    topics.WORK: "Work and business",
    topics.IDEAS: "Projects and ideas",
    topics.PLANS: "Plans and goals",
    topics.INTERESTS: "Interests",
    topics.HEALTH: "Health",
    topics.MONEY: "Money",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _path(vault: Path) -> Path:
    return Path(vault) / FILE


def load(vault: Path) -> dict[str, Any]:
    """The stored biography, or an empty one."""
    try:
        data = json.loads(_path(vault).read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {"text": str(data.get("text", "")), "updated": str(data.get("updated", "")),
                    "how": str(data.get("how", "")), "locked": bool(data.get("locked", False)),
                    "fingerprint": str(data.get("fingerprint", ""))}
    except (OSError, ValueError):
        pass
    return {"text": "", "updated": "", "how": "", "locked": False, "fingerprint": ""}


def save(vault: Path, data: dict[str, Any]) -> None:
    p = _path(vault)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def facts(store: Any, *, include_sensitive: bool) -> dict[str, list[tuple[str, str]]]:
    """The owner's memories grouped by topic as (record id, text) pairs, most important first."""
    records = [
        r for r in store.list_records(status=ACTIVE, limit=20000)
        if r.speaker == "user" and r.subject == "self" and r.kind not in (CAPSULE, STORY, JOURNAL)
        and exit_gate.keep(r)
    ]
    records.sort(key=lambda r: (r.importance, r.modified or r.created or ""), reverse=True)
    grouped: dict[str, list[tuple[str, str]]] = {}
    for rec in records[:MAX_FACTS]:
        category = topics.category_of(rec.tags, rec.body or rec.title)
        if category in SENSITIVE and not include_sensitive:
            continue
        grouped.setdefault(category, []).append((rec.id, (rec.body or rec.title).strip()))
    return grouped


def fingerprint(grouped: dict[str, list[tuple[str, str]]], store: Any) -> str:
    h = hashlib.sha1()
    for category in sorted(grouped):
        for rid, text in grouped[category]:
            h.update(f"{category}|{rid}|{text}".encode())
    return h.hexdigest()


def outline(grouped: dict[str, list[tuple[str, str]]]) -> str:
    """A plain outline by topic. Used when no AI helper is available."""
    lines: list[str] = []
    for category in _ORDER:
        items = grouped.get(category)
        if not items:
            continue
        lines += [f"## {_HEADINGS[category]}", ""]
        lines += [f"- {text}" for _, text in items]
        lines.append("")
    return "\n".join(lines).rstrip()


def _prompt(grouped: dict[str, list[tuple[str, str]]]) -> str:
    blocks = []
    for category in _ORDER:
        items = grouped.get(category)
        if items:
            blocks.append(f"[{_HEADINGS[category]}]\n" + "\n".join(f"- {t}" for _, t in items))
    return (
        "Write a professional biography of the person these facts describe.\n"
        "Rules:\n"
        "- Use ONLY the facts below. Do not invent, assume or embellish anything.\n"
        "- Write in the third person. If a name is stated in the facts, use it; otherwise say 'they'.\n"
        "- Short paragraphs under plain headings (for example Background, Education, Work and "
        "projects, Interests, Plans). Skip a heading when there is nothing under it.\n"
        "- Keep the tone factual and professional. Include small details too if they are in the facts.\n"
        "- Do not mention these instructions. Output markdown only.\n\n"
        "FACTS\n" + "\n\n".join(blocks)
    )


def refresh(
    store: Any, vault: Path, helper: Any | None, *, include_sensitive: bool = False, force: bool = False,
) -> dict[str, Any]:
    """Bring the biography up to date. Returns the stored biography.

    Nothing happens when nothing changed, or when the owner has locked the text
    (unless *force*, which is the owner asking for a rewrite).
    """
    current = load(vault)
    grouped = facts(store, include_sensitive=include_sensitive)
    fp = fingerprint(grouped, store)
    if not force:
        if current["locked"]:
            return current
        if current["text"] and current["fingerprint"] == fp and (current["how"] == "helper" or helper is None):
            return current
    if not grouped:
        data = {"text": "", "updated": _now(), "how": "", "locked": False, "fingerprint": fp}
        save(vault, data)
        return data

    text, how = "", "outline"
    if helper is not None:
        try:
            text = (helper(_prompt(grouped)) or "").strip()
            how = "helper" if text else "outline"
        except Exception:  # noqa: BLE001 - fall back to the outline, never fail the screen
            logger.warning("biography helper failed", exc_info=True)
            text = ""
    if not text:
        text, how = outline(grouped), "outline"
    data = {"text": text, "updated": _now(), "how": how, "locked": False, "fingerprint": fp}
    save(vault, data)
    return data


def edit(vault: Path, text: str) -> dict[str, Any]:
    """The owner rewrites the biography by hand. It is then locked against AI rewrites."""
    current = load(vault)
    data = {**current, "text": text.strip(), "updated": _now(), "how": "you", "locked": True}
    save(vault, data)
    return data


def unlock(vault: Path) -> dict[str, Any]:
    current = load(vault)
    current["locked"] = False
    save(vault, current)
    return current
