"""What the Vault screen shows: notes, filters, tags, links and the graph.

The files in the vault folder are a rendering of what Memory_OB knows, so this
module works from the database and the vault's index rather than crawling the
disk. It follows Obsidian's own behaviour where it can:

* a search box that understands ``tag:``, ``path:``, ``file:``, ``-word`` and
  quoted phrases (the filter chips on the screen simply write these);
* nested tags (``topic/health`` is found by ``tag:topic``);
* backlinks, orphan notes, and a graph of notes, people, sources and tags.

Nothing here changes anything; edits go through :mod:`memory_ob.manager`.
"""

from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import Any

from . import exit as exit_gate
from . import me as me_mod
from . import topics, vault as vault_mod
from .records import ACTIVE

SENSITIVE = (topics.HEALTH, topics.MONEY)

TYPE_MEMORY, TYPE_PERSON, TYPE_SOURCE, TYPE_SUMMARY = "memory", "person", "source", "summary"


# -- every note --------------------------------------------------------------


PLATFORMS = {
    "chatgpt": "ChatGPT", "claude": "Claude", "whatsapp": "WhatsApp", "hermes": "Hermes",
    "browser": "Browser", "api": "Typed in", "tell": "Typed in", "": "Other",
}


def platform_name(origin: str | None) -> str:
    """Where a conversation came from, in words an owner would use."""
    key = (origin or "").strip().lower()
    return PLATFORMS.get(key, key[:1].upper() + key[1:] if key else "Other")


def conversation_title(conv: dict[str, Any]) -> str:
    """A readable name for a saved conversation, instead of its file name."""
    day = str(conv.get("created") or "")[:10]
    session = str(conv.get("session") or "").strip()
    platform = platform_name(conv.get("origin"))
    if session and len(session) <= 80 and not re.fullmatch(r"[0-9a-fA-F-]{8,}", session):
        return f"{session} ({platform})"
    if platform == "Typed in":
        return f"Something you told me, {day}"
    return f"{platform} chat, {day}"


def _by(rec: Any) -> str:
    return "AI" if str(rec.confirmed_by or "").startswith("ai@") else "you"


def list_notes(store: Any, vault: Path) -> list[dict[str, Any]]:
    """Every note the vault holds, as plain data."""
    vault = Path(vault)
    idx = vault_mod._load_index(vault)  # noqa: SLF001
    notes: list[dict[str, Any]] = []

    for rec in store.list_records(status=ACTIVE, limit=100000):
        rel = idx.get(rec.id)
        if not rel or not (vault / rel).is_file() or not exit_gate.keep(rec):
            continue
        category = topics.category_of(rec.tags, rec.body or rec.title)
        free = [t for t in rec.tags if not str(t).startswith(topics.TAG_PREFIX)]
        notes.append({
            "path": rel, "name": Path(rel).stem, "type": TYPE_MEMORY, "id": rec.id,
            "title": rec.title or Path(rel).stem, "category": category, "kind": rec.kind,
            "tags": [topics.tag_for(category), *free],
            "created": rec.created, "updated": rec.modified or rec.created,
            "by": _by(rec), "people": list((rec.source or {}).get("people", [])),
            "revisit": topics.revisit_of(rec.source) or "",
            "snippet": (rec.body or "")[:200], "sensitive": category in SENSITIVE,
            "conversation_id": (rec.source or {}).get("conversation_id", ""),
        })

    for person in store.list_people(limit=100000):
        rel = idx.get(f"person:{person['id']}")
        if not rel or not (vault / rel).is_file():
            continue
        notes.append({
            "path": rel, "name": Path(rel).stem, "type": TYPE_PERSON, "id": person["id"],
            "title": person["name"], "category": "People", "kind": "person",
            "tags": ["people"], "created": person.get("created", ""),
            "updated": person.get("modified", "") or person.get("created", ""), "by": "you",
            "people": [person["name"]], "revisit": "",
            "snippet": (person.get("notes") or person.get("relation") or "")[:200],
            "sensitive": False, "conversation_id": "",
        })

    for conv in store.list_conversations(limit=100000):
        path = Path("Sources") / "Conversations" / f"{vault_mod.conversation_note_stem(conv)}.md"
        if not (vault / path).is_file():
            continue
        notes.append({
            "path": path.as_posix(), "name": path.stem, "type": TYPE_SOURCE, "id": conv["id"],
            "title": conversation_title(conv), "category": "Sources", "kind": "conversation",
            "tags": ["source"], "created": conv.get("created", ""), "updated": conv.get("created", ""),
            "by": "you", "people": list(conv.get("people") or []), "revisit": "",
            "snippet": (conv.get("text") or "")[:200], "sensitive": False, "conversation_id": conv["id"],
        })

    for rel, title in ((vault_mod.ME_NOTE, "Me"), (vault_mod.BIOGRAPHY_NOTE, "Biography")):
        if (vault / rel).is_file():
            notes.append({
                "path": rel, "name": Path(rel).stem, "type": TYPE_SUMMARY, "id": "", "title": title,
                "category": "Summary", "kind": "summary", "tags": [], "created": "", "updated": "",
                "by": "AI", "people": [], "revisit": "", "snippet": "", "sensitive": False,
                "conversation_id": "",
            })
    return notes


# -- the search box ----------------------------------------------------------------


def parse_query(q: str) -> dict[str, Any]:
    """Split a search box entry into operators and plain words."""
    out: dict[str, Any] = {
        "words": [], "not_words": [], "tags": [], "paths": [], "files": [], "by": [], "people": [],
        "types": [], "after": "", "before": "", "has_revisit": False, "orphans": False,
        "categories": [],
    }
    try:
        tokens = shlex.split(q or "")
    except ValueError:
        tokens = (q or "").split()
    for tok in tokens:
        neg = tok.startswith("-") and len(tok) > 1
        body = tok[1:] if neg else tok
        key, sep, val = body.partition(":")
        key = key.lower()
        if sep and val:
            if key == "tag":
                out["tags"].append(val.lstrip("#").lower())
            elif key == "path":
                out["paths"].append(val.lower())
            elif key == "file":
                out["files"].append(val.lower())
            elif key == "by":
                out["by"].append(val.lower())
            elif key == "person":
                out["people"].append(val.lower())
            elif key == "type":
                out["types"].append(val.lower())
            elif key == "category":
                out["categories"].append(val.lower())
            elif key == "after":
                out["after"] = val
            elif key == "before":
                out["before"] = val
            elif key == "has" and val.lower() == "revisit":
                out["has_revisit"] = True
            elif key == "is" and val.lower() == "orphan":
                out["orphans"] = True
            else:
                (out["not_words"] if neg else out["words"]).append(body.lower())
        else:
            (out["not_words"] if neg else out["words"]).append(body.lower())
    return out


def _has_tag(note: dict[str, Any], wanted: str) -> bool:
    for tag in note["tags"]:
        t = str(tag).lower()
        if t == wanted or t.startswith(wanted + "/"):
            return True
    return False


def matches(note: dict[str, Any], f: dict[str, Any], *, linked: set[str] | None = None) -> bool:
    """Whether *note* passes every part of a parsed query."""
    hay = f"{note['title']} {note['snippet']} {' '.join(note['tags'])} {' '.join(note['people'])}".lower()
    if any(w not in hay for w in f["words"]):
        return False
    if any(w in hay for w in f["not_words"]):
        return False
    if any(not _has_tag(note, t) for t in f["tags"]):
        return False
    if f["paths"] and not all(p in note["path"].lower() for p in f["paths"]):
        return False
    if f["files"] and not all(p in note["name"].lower() for p in f["files"]):
        return False
    if f["by"] and note["by"].lower() not in f["by"]:
        return False
    if f["types"] and note["type"] not in f["types"]:
        return False
    if f["categories"] and note["category"].lower() not in f["categories"]:
        return False
    if f["people"] and not all(any(p in n.lower() for n in note["people"]) for p in f["people"]):
        return False
    day = (note["updated"] or note["created"] or "")[:10]
    if f["after"] and (not day or day < f["after"]):
        return False
    if f["before"] and (not day or day > f["before"]):
        return False
    if f["has_revisit"] and not note["revisit"]:
        return False
    if f["orphans"] and linked is not None and note["path"] in linked:
        return False
    return True


def filter_notes(notes: list[dict[str, Any]], q: str, *, linked: set[str] | None = None) -> list[dict[str, Any]]:
    f = parse_query(q)
    return [n for n in notes if matches(n, f, linked=linked)]


# -- tags and folders ----------------------------------------------------------------


def tag_counts(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every tag with how many notes carry it, counting nested parents like Obsidian."""
    counts: dict[str, int] = {}
    for note in notes:
        seen: set[str] = set()
        for tag in note["tags"]:
            parts = str(tag).split("/")
            for i in range(1, len(parts) + 1):
                seen.add("/".join(parts[:i]))
        for tag in seen:
            counts[tag] = counts.get(tag, 0) + 1
    return [{"tag": t, "count": c} for t, c in sorted(counts.items())]


def folder_counts(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for note in notes:
        parts = Path(note["path"]).parts[:-1]
        for i in range(1, len(parts) + 1):
            key = "/".join(parts[:i])
            counts[key] = counts.get(key, 0) + 1
    return [{"path": p, "count": c} for p, c in sorted(counts.items())]


# -- links and the graph -----------------------------------------------------------------


def links(store: Any, notes: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Every link between notes: person mentions, curated links, and sources."""
    by_id = {n["id"]: n for n in notes if n["id"]}
    by_person = {n["title"].lower(): n for n in notes if n["type"] == TYPE_PERSON}
    for person in store.list_people(limit=100000):
        node = by_id.get(person["id"])
        for alias in person.get("aliases", []):
            if node:
                by_person.setdefault(alias.lower(), node)
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, str]] = []

    def add(a: str, b: str, kind: str) -> None:
        if a == b or (a, b, kind) in seen or (b, a, kind) in seen:
            return
        seen.add((a, b, kind))
        out.append({"source": a, "target": b, "kind": kind})

    for note in notes:
        if note["type"] in (TYPE_MEMORY, TYPE_SOURCE):
            for name in note["people"]:
                person = by_person.get(str(name).lower())
                if person:
                    add(note["path"], person["path"], "person")
        if note["type"] == TYPE_MEMORY and note["conversation_id"]:
            conv = by_id.get(note["conversation_id"])
            if conv:
                add(note["path"], conv["path"], "source")
    try:
        data = store.graph()
        for edge in data.get("edges", []):
            if edge.get("label") == "shares_tag":
                continue
            a, b = by_id.get(edge["src"]), by_id.get(edge["dst"])
            if a and b:
                add(a["path"], b["path"], "related")
    except Exception:  # noqa: BLE001 - links are a bonus; the screen works without them
        pass
    return out


def graph(
    store: Any, vault: Path, *, q: str = "", show_tags: bool = False, show_people: bool = True,
    show_sources: bool = True, show_orphans: bool = True,
) -> dict[str, Any]:
    """Nodes and edges for the graph view, after the filters."""
    notes = list_notes(store, vault)
    all_links = links(store, notes)
    linked = {e["source"] for e in all_links} | {e["target"] for e in all_links}

    def allowed(n: dict[str, Any]) -> bool:
        if n["type"] == TYPE_PERSON and not show_people:
            return False
        if n["type"] == TYPE_SOURCE and not show_sources:
            return False
        if n["type"] == TYPE_SUMMARY:
            return False
        return True

    kept = [n for n in filter_notes([n for n in notes if allowed(n)], q, linked=linked)]
    keep_paths = {n["path"] for n in kept}
    edges = [e for e in all_links if e["source"] in keep_paths and e["target"] in keep_paths]
    nodes: list[dict[str, Any]] = [
        {"id": n["path"], "label": n["title"][:48], "type": n["type"], "category": n["category"],
         "sensitive": n["sensitive"]}
        for n in kept
    ]
    if show_tags:
        for n in kept:
            for tag in n["tags"]:
                if tag in ("source", "people"):
                    continue
                tid = f"#{tag}"
                if not any(x["id"] == tid for x in nodes):
                    nodes.append({"id": tid, "label": f"#{tag}", "type": "tag", "category": "", "sensitive": False})
                edges.append({"source": n["path"], "target": tid, "kind": "tag"})
    degree: dict[str, int] = {}
    for e in edges:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    if not show_orphans:
        nodes = [n for n in nodes if degree.get(n["id"], 0) > 0]
    for n in nodes:
        n["degree"] = degree.get(n["id"], 0)
    return {"nodes": nodes, "edges": edges}


# -- one note ---------------------------------------------------------------------


class NoteError(ValueError):
    """A note that cannot be opened. The message is plain."""


def _safe_path(vault: Path, rel: str) -> Path:
    if not rel or rel.startswith(("/", "\\")) or ".." in Path(rel).parts or Path(rel).parts[0].startswith("."):
        raise NoteError("That note is not part of the vault.")
    target = (Path(vault) / rel).resolve()
    if Path(vault).resolve() not in target.parents:
        raise NoteError("That note is not part of the vault.")
    return target


def read_note(store: Any, vault: Path, rel: str) -> dict[str, Any]:
    """One note: its text, its details, what links to it, and whether it can be edited."""
    target = _safe_path(vault, rel)
    if not target.is_file():
        raise NoteError("That note no longer exists.")
    notes = list_notes(store, vault)
    note = next((n for n in notes if n["path"] == rel), None)
    meta, body = vault_mod.parse_frontmatter(target.read_text(encoding="utf-8"))
    all_links = links(store, notes)
    by_path = {n["path"]: n for n in notes}
    outgoing = [by_path[e["target"]] for e in all_links if e["source"] == rel and e["target"] in by_path]
    incoming = [by_path[e["source"]] for e in all_links if e["target"] == rel and e["source"] in by_path]

    def brief(n: dict[str, Any]) -> dict[str, str]:
        return {"path": n["path"], "title": n["title"], "type": n["type"]}

    kind = note["type"] if note else TYPE_SUMMARY
    return {
        "path": rel, "type": kind, "id": note["id"] if note else "",
        "title": note["title"] if note else Path(rel).stem,
        "category": note["category"] if note else "",
        "tags": note["tags"] if note else [],
        "created": note["created"] if note else "", "updated": note["updated"] if note else "",
        "by": note["by"] if note else "AI", "people": note["people"] if note else [],
        "revisit": note["revisit"] if note else "",
        "sensitive": bool(note and note["sensitive"]),
        "body": body.strip(), "meta": meta,
        "editable": kind in (TYPE_MEMORY, TYPE_PERSON),
        "links": [brief(n) for n in outgoing], "backlinks": [brief(n) for n in incoming],
        "categories": list(topics.CATEGORIES),
    }


def summary_for_status(store: Any, vault: Path) -> dict[str, int]:
    notes = list_notes(store, vault)
    return {"notes": sum(1 for n in notes if n["type"] == TYPE_MEMORY),
            "people": sum(1 for n in notes if n["type"] == TYPE_PERSON),
            "sources": sum(1 for n in notes if n["type"] == TYPE_SOURCE)}


def now_view(store: Any) -> dict[str, Any]:
    """The Me screen's data."""
    return me_mod.build(store)


_ = re  # kept for callers that import the module's regex helpers
