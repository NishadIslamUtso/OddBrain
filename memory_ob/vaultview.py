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

TYPE_TOPIC, TYPE_PERSON, TYPE_SOURCE, TYPE_SUMMARY = "topic", "person", "source", "summary"
TYPE_PROJECT = "project"
TYPE_MEMORY = TYPE_TOPIC            # older name for a note made of memories


# -- every note --------------------------------------------------------------


PLATFORMS = {
    "chatgpt": "ChatGPT", "claude": "Claude", "whatsapp": "WhatsApp", "hermes": "Hermes",
    "telegram": "Telegram", "messenger": "Messenger", "instagram": "Instagram",
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


def _note_kind(rel: str) -> str:
    return {"Journal": "journal"}.get(rel.split("/")[0], "topic")


def list_notes(store: Any, vault: Path) -> list[dict[str, Any]]:
    """Every note the vault holds, as plain data.

    A subject note stands for the memories filed in it, so it carries their
    ids (``record_ids``) and, for searching, all their words (``_text``, which
    is never sent to the screen).
    """
    vault = Path(vault)
    idx = vault_mod._load_index(vault)  # noqa: SLF001
    notes: list[dict[str, Any]] = []
    by_rel: dict[str, list[str]] = {}
    for key, rel in idx.items():
        if vault_mod._is_record_key(key):  # noqa: SLF001
            by_rel.setdefault(rel, []).append(key)
    project_rels = {rel: key for key, rel in idx.items() if key.startswith("project:")}
    records = {r.id: r for r in store.list_records(status=ACTIVE, limit=100000)}

    for rel, ids in sorted(by_rel.items()):
        if not (vault / rel).is_file():
            continue
        members = [records[i] for i in ids if i in records and exit_gate.keep(records[i])]
        if not members:
            continue
        members.sort(key=lambda r: (r.event_time or r.created or "", r.id))
        top = rel.split("/")[0]
        category = topics.IDEAS if top == topics.IDEAS else top if top in topics.CATEGORIES else "Journal"
        tags = [topics.tag_for(category)] if category in topics.CATEGORIES else ["journal"]
        project_key = project_rels.get(rel, "")
        if project_key:
            tags.append(topics.THREAD_PREFIX + project_key[len("project:"):])
        people = sorted({p for r in members for p in (r.source or {}).get("people", []) if str(p).strip()})
        ai = sum(1 for r in members if _by(r) == "AI")
        newest = members[-1]
        title = Path(rel).stem
        notes.append({
            "path": rel, "name": title, "title": title,
            "type": TYPE_PROJECT if project_key else TYPE_TOPIC, "id": project_key,
            "category": category, "kind": "project" if project_key else _note_kind(rel),
            "tags": tags, "created": min(r.created or "" for r in members),
            "updated": max(r.modified or r.created or "" for r in members),
            "by": "AI" if ai * 2 >= len(members) else "you", "people": people,
            "revisit": min((topics.revisit_of(r.source) or "9999" for r in members), default="") if any(
                topics.revisit_of(r.source) for r in members) else "",
            "snippet": f"{len(members)} {'memory' if len(members) == 1 else 'memories'} · latest: "
                       f"{(newest.body or newest.title or '')[:150]}",
            "sensitive": category in SENSITIVE, "conversation_id": "", "count": len(members),
            "record_ids": [r.id for r in members],
            "_text": " ".join((r.body or r.title or "") for r in members)[:20000],
            "_lines": [(r.body or r.title or "") for r in members][:400],
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
            "sensitive": False, "conversation_id": "", "count": 0, "record_ids": [],
        })

    private = store.private_phrases()
    for conv in store.list_conversations(limit=100000):
        path = Path("Sources") / "Conversations" / f"{vault_mod.conversation_note_stem(conv)}.md"
        if not (vault / path).is_file():
            continue
        notes.append({
            "path": path.as_posix(), "name": path.stem, "type": TYPE_SOURCE, "id": conv["id"],
            "title": conversation_title(conv), "category": "Sources", "kind": "conversation",
            "tags": ["source"], "created": conv.get("created", ""), "updated": conv.get("created", ""),
            "by": "you", "people": list(conv.get("people") or []), "revisit": "",
            "snippet": exit_gate.mask(conv.get("text") or "", private)[:200], "sensitive": False,
            "conversation_id": conv["id"], "count": 0, "record_ids": [],
        })

    if (vault / vault_mod.BIOGRAPHY_NOTE).is_file():
        notes.append({
            "path": vault_mod.BIOGRAPHY_NOTE, "name": "Biography", "type": TYPE_SUMMARY, "id": "",
            "title": "Biography", "category": "Journal", "kind": "summary", "tags": ["journal"],
            "created": "", "updated": "", "by": "AI", "people": [], "revisit": "", "snippet": "",
            "sensitive": False, "conversation_id": "", "count": 0, "record_ids": [],
        })
    return notes


def public(note: dict[str, Any]) -> dict[str, Any]:
    """A note as the screen gets it: no search text and no list of ids (the note itself has its lines)."""
    return {k: v for k, v in note.items() if not k.startswith("_") and k != "record_ids"}


def hits(note: dict[str, Any], words: list[str], *, limit: int = 3) -> list[str]:
    """The lines of a note that hold the searched words, so a result shows why it matched."""
    if not words:
        return []
    out: list[str] = []
    for line in note.get("_lines", []):
        low = line.lower()
        if any(w in low for w in words):
            out.append(line[:220])
            if len(out) >= limit:
                break
    return out


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
    hay = f"{note['title']} {note['snippet']} {note.get('_text', '')} {' '.join(note['tags'])} {' '.join(note['people'])}".lower()
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


def links(store: Any, notes: list[dict[str, Any]], vault: Path | None = None) -> list[dict[str, str]]:
    """Every link between notes: who is mentioned where, curated links, and sources."""
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
        if note["type"] in (TYPE_TOPIC, TYPE_PROJECT, TYPE_SOURCE):
            for name in note["people"]:
                person = by_person.get(str(name).lower())
                if person:
                    add(note["path"], person["path"], "person")
    by_record = {rid: n["path"] for n in notes for rid in n.get("record_ids", [])}
    try:
        data = store.graph()
        for edge in data.get("edges", []):
            if edge.get("label") == "shares_tag":
                continue
            a, b = by_record.get(edge["src"]), by_record.get(edge["dst"])
            if a and b:
                add(a, b, "related")
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
         "sensitive": n["sensitive"], "count": n.get("count", 0)}
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


def _line_data(rec: Any) -> dict[str, Any]:
    """One memory as a row of a note on the screen."""
    free = [t for t in (rec.tags or []) if not str(t).startswith((topics.TAG_PREFIX, topics.NOTE_PREFIX,
                                                                  topics.THREAD_PREFIX))
            and t not in (topics.TODO_TAG, topics.DONE_TAG, topics.MOMENT_TAG)]
    tags = rec.tags or []
    return {
        "id": rec.id, "text": rec.body or rec.title or "", "date": (rec.event_time or rec.created or "")[:10],
        "by": _by(rec), "category": topics.category_of(tags, rec.body or rec.title), "tags": free,
        "todo": topics.TODO_TAG in tags and topics.DONE_TAG not in tags, "done": topics.DONE_TAG in tags,
        "moment": rec.kind in ("journal", "story") or topics.MOMENT_TAG in tags,
        "people": list((rec.source or {}).get("people", [])), "revisit": topics.revisit_of(rec.source) or "",
        "quote": (rec.source or {}).get("quote", ""), "conversation_id": (rec.source or {}).get("conversation_id", ""),
        "filed_by": (rec.source or {}).get("filed_by", ""),
    }


def _outline(body: str) -> list[dict[str, Any]]:
    out = []
    for line in body.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*\S)\s*$", line)
        if m:
            out.append({"level": len(m.group(1)), "text": m.group(2)})
    return out


def read_note(store: Any, vault: Path, rel: str) -> dict[str, Any]:
    """One note: its lines, its details, what links to it, and whether it can be edited."""
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
    # A link is two-way for the reader: who it points at and who points at it.
    outgoing += [by_path[e["source"]] for e in all_links if e["target"] == rel and e["source"] in by_path
                 and by_path[e["source"]]["type"] == TYPE_PERSON]
    outgoing = list({n["path"]: n for n in outgoing}.values())

    def brief(n: dict[str, Any]) -> dict[str, str]:
        return {"path": n["path"], "title": n["title"], "type": n["type"], "category": n["category"]}

    kind = note["type"] if note else TYPE_SUMMARY
    lines: list[dict[str, Any]] = []
    if note and note.get("record_ids"):
        for rid in note["record_ids"]:
            rec = store.get_record(rid)
            if rec is not None:
                lines.append(_line_data(rec))
    return {
        "path": rel, "type": kind, "id": note["id"] if note else "",
        "title": note["title"] if note else Path(rel).stem,
        "category": note["category"] if note else "",
        "tags": note["tags"] if note else [],
        "created": note["created"] if note else "", "updated": note["updated"] if note else "",
        "by": note["by"] if note else "AI", "people": note["people"] if note else [],
        "revisit": note["revisit"] if note else "",
        "sensitive": bool(note and note["sensitive"]),
        "body": body.strip(), "meta": meta, "lines": lines, "outline": _outline(body),
        "editable": kind == TYPE_PERSON,
        "links": [brief(n) for n in outgoing], "backlinks": [brief(n) for n in incoming],
        "categories": list(topics.CATEGORIES),
    }


def summary_for_status(store: Any, vault: Path) -> dict[str, int]:
    notes = list_notes(store, vault)
    return {"notes": sum(1 for n in notes if n["type"] in (TYPE_TOPIC, TYPE_PROJECT)),
            "people": sum(1 for n in notes if n["type"] == TYPE_PERSON),
            "sources": sum(1 for n in notes if n["type"] == TYPE_SOURCE)}


def now_view(store: Any, vault: Path | None = None) -> dict[str, Any]:
    """The Me screen's data."""
    return me_mod.build(store, vault=vault)


_ = re  # kept for callers that import the module's regex helpers
