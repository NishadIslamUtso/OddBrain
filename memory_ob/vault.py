"""The vault — an Obsidian vault kept up to date by Memory_OB.

The vault is the human-readable *view* of the store, never the source of
truth. It is laid out the way Obsidian expects, so you can open the folder in
Obsidian and use its graph, search and backlinks directly::

    <vault>/
      .obsidian/                 Obsidian's own settings (graph colours, plugins)
      .brain/                    Memory_OB's private data (database, token, backups)
      Health/ Plans/ Life/ ...   one folder per kind of thing, a few notes in each
        Health/Health.md           the general note for that folder
        Health/Peanut allergy.md   a note on one subject, made by the AI librarian
        Plans/To-do.md             open and finished to-dos
      Projects & Ideas/<Project>/<Project>.md   one note per project, whole story in order
      People/                    one note per person
      Journal/                   Biography.md and one note per month
      Sources/                   the raw evidence: imported files and imported chats, unchanged

A note is written the way a person would keep it: a title and a list of dated
lines, oldest first. Every line ends with a block id (``^id``), so a memory in
the app and its line in the note are the same thing. Notes use YAML
frontmatter, nested ``#tags`` and ``[[wikilinks]]``. Law 2: neverSend records
are never written. Law 4: this is a render — deleting a note here changes
nothing in the store.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import topics
from .config import LEGACY_FOLDER_NAMES, VAULT_FOLDER_NAMES
from .records import ACTIVE, JOURNAL, NOTE, STORY

logger = logging.getLogger(__name__)

INDEX_FILE = ".brain/vault-index.json"
LAYOUT_FILE = ".brain/vault-layout.json"
LAYOUT = 2                      # 1 = a note per memory, 2 = notes by subject
BIOGRAPHY_NOTE = "Journal/Biography.md"
ME_NOTE = "Me.md"                # no longer written; an old copy is cleaned up
MONTHS = ("", "January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December")
# Chats typed or spoken into Hermes live in the app, not as files. Imported chats are kept as source notes.
LIVE_ORIGINS = frozenset({"hermes", "tell", "api", "browser", "app", ""})

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_BAD_NAME_CHARS = re.compile(r'[\\/:*?"<>|#^\[\]\n\r\t]+')


# -- small helpers ---------------------------------------------------------


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value)
    if s and (s[0] in "[]{}\"'#&*!|>%@`" or ": " in s or s != s.strip()):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def _yaml_list(values: list[str]) -> str:
    return "[" + ", ".join(_yaml_scalar(v) for v in values) + "]"


def note_name(text: str, *, fallback: str = "Note", limit: int = 70) -> str:
    """A safe file name (without extension) taken from some text."""
    name = _BAD_NAME_CHARS.sub(" ", text or "")
    name = re.sub(r"\s+", " ", name).strip(" .")
    if len(name) > limit:
        name = name[:limit].rsplit(" ", 1)[0].strip(" .") or name[:limit]
    return name or fallback


def _now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _day(stamp: str | None) -> str:
    return (stamp or "")[:10]


# -- frontmatter -----------------------------------------------------------


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Parse simple YAML frontmatter. Returns (meta, body).

    Only the flat scalar/list shapes Memory_OB writes are supported — this is
    not a general YAML parser.
    """
    m = _FRONTMATTER_RE.match(text or "")
    if not m:
        return {}, text or ""
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            meta[key.strip()] = val[1:-1].strip()
        else:
            meta[key.strip()] = val.strip().strip('"').strip("'")
    return meta, text[m.end():]


# -- rendering -------------------------------------------------------------


def note_target(record: Any) -> tuple[str, str]:
    """The (folder, title) of the note a record is written in.

    Journal moments go in a note for their month, a project's memories in the
    project's note, to-dos in one to-do list, and everything else in the note
    the librarian named — or, with no name, the general note of its folder.
    """
    tags = list(record.tags or [])
    if record.kind in (JOURNAL, STORY):
        day = _day(record.event_time or record.created)
        if len(day) >= 7 and day[5:7].isdigit() and 1 <= int(day[5:7]) <= 12:
            return "Journal", f"{day[:7]} {MONTHS[int(day[5:7])]}"
        return "Journal", "Undated"
    project = topics.thread_of_tags(tags)
    if project:
        name = note_name(project, fallback="Project")
        return f"{topics.IDEAS}/{name}", name
    category = topics.category_of(tags, record.body or record.title)
    if topics.TODO_TAG in tags or topics.DONE_TAG in tags:
        return topics.PLANS, "To-do"
    title = topics.note_of_tags(tags)
    if title:
        return category, note_name(title, fallback=category)
    return category, category


def folder_for(record: Any) -> str:
    """The vault folder a record's note lives in."""
    return note_target(record)[0]


def _one_line(text: str) -> str:
    return " ".join(str(text or "").split())


def render_line(record: Any, *, known_people: set[str] | None = None, anchor: bool = True,
                check: bool = False, extra: str = "") -> str:
    """One memory as one line of a note: ``- 2026-10-02 — I am allergic to peanuts. [[Mim]] ^id``."""
    day = _day(record.event_time or record.created)
    box = ""
    if check:
        box = "[x] " if topics.DONE_TAG in (record.tags or []) else "[ ] "
    text = _one_line(record.body or record.title)
    line = f"- {box}{day + ' — ' if day else ''}{text}"
    if extra:
        line += f" {extra}"
    names = [p for p in _record_people(record) if known_people is None or note_name(p).lower() in known_people]
    if names:
        line += " · " + ", ".join(f"[[{note_name(p, fallback='Person')}]]" for p in dict.fromkeys(names))
    if anchor:
        line += f" ^{record.id}"
    return line


def render_topic(rel: str, members: list[Any], *, known_people: set[str] | None = None) -> str:
    """The text of one subject note from the memories filed in it."""
    folder, _, fname = rel.rpartition("/")
    title = fname[:-3] if fname.endswith(".md") else fname
    recs = sorted(members, key=lambda r: (r.event_time or r.created or "", r.created or "", r.id))
    top = folder.split("/")[0]
    project = topics.thread_of_tags(recs[0].tags) if top == topics.IDEAS and "/" in folder else ""
    is_todo = rel == f"{topics.PLANS}/To-do.md"
    kind = "project" if project else "journal" if top == "Journal" else "todo" if is_todo else "topic"
    category = topics.IDEAS if top == topics.IDEAS else top if top in topics.CATEGORIES else "Journal"
    tags = [topics.tag_for(category)] if category in topics.CATEGORIES else ["journal"]
    if project:
        tags.append(topics.thread_tag(project))
    updated = max((r.modified or r.created or "" for r in recs), default="")
    lines = ["---", f"kind: {kind}", f"title: {_yaml_scalar(title)}", f"category: {_yaml_scalar(category)}",
             "tags: " + _yaml_list(tags)]
    if updated:
        lines.append(f"updated: {updated}")
    lines += ["---", "", f"# {title}", ""]

    def lined(rs: list[Any], **kw: Any) -> list[str]:
        return [render_line(r, known_people=known_people, **kw) for r in rs]

    if is_todo:
        open_ = [r for r in recs if topics.DONE_TAG not in (r.tags or [])]
        done = [r for r in recs if topics.DONE_TAG in (r.tags or [])]
        if open_:
            lines += ["## Open", "", *[render_line(r, known_people=known_people, check=True,
                                                    extra=f"(come back {topics.revisit_of(r.source)})"
                                                    if topics.revisit_of(r.source) else "") for r in open_], ""]
        if done:
            lines += ["## Done", "", *lined(done, check=True), ""]
    elif project:
        newest = list(reversed(recs))[:3]
        lines += ["## Where it stands", "", *lined(newest, anchor=False), ""]
        later = [r for r in recs if topics.revisit_of(r.source)]
        if later:
            lines += ["## Come back to", "", *[
                f"- {topics.revisit_of(r.source)} — {_one_line(r.body or r.title)}" for r in later], ""]
        todo = [r for r in recs if topics.TODO_TAG in (r.tags or []) and topics.DONE_TAG not in (r.tags or [])]
        if todo:
            lines += ["## To do", "", *[f"- [ ] {_one_line(r.body or r.title)}" for r in todo], ""]
        lines += ["## Timeline", "", *lined(recs), ""]
    elif len(recs) > 30 and top != "Journal":
        month = ""
        for r in recs:
            m = _day(r.event_time or r.created)[:7] or "Undated"
            if m != month:
                month = m
                lines += ["", f"## {m}", ""]
            lines.append(render_line(r, known_people=known_people))
        lines.append("")
    else:
        lines += lined(recs)
        lines.append("")
    return "\n".join(lines)


# -- the index: which file belongs to which record ------------------------------


def _index_path(vault: Path) -> Path:
    return Path(vault) / INDEX_FILE


def _load_index(vault: Path) -> dict[str, str]:
    try:
        data = json.loads(_index_path(vault).read_text(encoding="utf-8"))
        return {str(k): str(v) for k, v in data.items()}
    except (OSError, ValueError):
        return {}


def _save_index(vault: Path, index: dict[str, str]) -> None:
    path = _index_path(vault)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(index, indent=1, sort_keys=True), encoding="utf-8")


def vault_path_for(record: Any) -> Path:
    """The default vault file path for a record (before collisions)."""
    folder, title = note_target(record)
    return Path(folder) / f"{title}.md"


def _is_record_key(key: str) -> bool:
    """Index keys that are memories (people, projects and chats have a prefix with a colon)."""
    return ":" not in key


def _person_stems(idx: dict[str, str]) -> set[str]:
    return {Path(v).stem.lower() for k, v in idx.items() if k.startswith("person:")}


# -- writing notes -----------------------------------------------------------


def ensure_layout(vault: Path) -> None:
    """Create the folders that always exist and Obsidian's settings."""
    vault = Path(vault)
    for name in VAULT_FOLDER_NAMES:
        (vault / name).mkdir(parents=True, exist_ok=True)
    (vault / ".brain").mkdir(parents=True, exist_ok=True)
    obsidian = vault / ".obsidian"
    obsidian.mkdir(parents=True, exist_ok=True)
    defaults = {
        "app.json": {"alwaysUpdateLinks": True, "showFrontmatter": False},
        "core-plugins.json": [
            "file-explorer", "global-search", "graph", "backlink",
            "outgoing-link", "tag-pane", "properties", "outline",
        ],
        "graph.json": {
            "showTags": False, "showOrphans": True, "showAttachments": False,
            "colorGroups": [
                {"query": f"path:{name}", "color": {"a": 1, "rgb": rgb}}
                for name, rgb in _CATEGORY_RGB.items()
            ],
        },
    }
    for fname, payload in defaults.items():
        path = obsidian / fname
        if not path.exists():
            path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


# Colours (as 0xRRGGBB integers) used for the graph, in Obsidian and in the app.
_CATEGORY_RGB = {
    topics.HEALTH: 0xD9534F,
    topics.MONEY: 0x2E9E6B,
    topics.IDEAS: 0x8E5CD9,
    topics.WORK: 0x2F7BD9,
    topics.LEARNING: 0xE08A1E,
    topics.PLANS: 0x1FA7B8,
    topics.INTERESTS: 0xD9569A,
    topics.LIFE: 0x7A8594,
    "People": 0xC9A227,
    "Journal": 0x5E7A3A,
}


def _record_people(record: Any) -> list[str]:
    return [str(p) for p in (record.source or {}).get("people", []) if str(p).strip()]


def write_record(
    store: Any, vault: Path, record: Any, *, index: dict[str, str] | None = None,
    dirty: set[str] | None = None, cache: dict[str, Any] | None = None,
) -> str | None:
    """File one record in its note (moving it, or taking it out, as needed).

    Active records get a line in a note. Records that are trashed, retracted,
    superseded or neverSend have none: if one exists it is taken out (it is
    only a render). Returns the note's path (relative), or None when the record
    has no note.

    The notes touched are written straight away, or — when *dirty* is given —
    only noted in it, so a caller filing many records writes each note once
    with :func:`render_notes`.
    """
    vault = Path(vault)
    own_index = index is None
    idx = _load_index(vault) if own_index else index
    assert idx is not None
    mine = dirty if dirty is not None else set()
    old_rel = idx.get(record.id)

    if record.never_send or record.demo or record.status != ACTIVE:
        if old_rel:
            idx.pop(record.id, None)
            mine.add(old_rel)
        rel = None
    else:
        folder, title = note_target(record)
        rel = f"{folder}/{title}.md"
        same = {v.lower(): v for k, v in idx.items() if _is_record_key(k)}
        rel = same.get(rel.lower(), rel)                    # one file per name, whatever the letter case
        idx[record.id] = rel
        mine.add(rel)
        if old_rel and old_rel != rel:
            mine.add(old_rel)
    if cache is not None:
        cache[record.id] = record
    if dirty is None:
        render_notes(store, vault, mine, idx, cache=cache)
    if own_index:
        _save_index(vault, idx)
    return rel


def render_notes(store: Any, vault: Path, rels: set[str] | list[str], idx: dict[str, str], *,
                 cache: dict[str, Any] | None = None) -> int:
    """Write each of the given notes from the records the index files in it. Returns how many exist."""
    vault = Path(vault)
    cache = cache if cache is not None else {}
    stems = _person_stems(idx)
    made = 0
    for rel in sorted(set(rels)):
        if not rel or rel.startswith("person:") or rel.startswith("project:"):
            continue
        members: list[Any] = []
        for rid in [k for k, v in idx.items() if v == rel and _is_record_key(k)]:
            rec = cache.get(rid)
            if rec is None:
                rec = cache[rid] = store.get_record(rid)
            if rec is not None and rec.status == ACTIVE and not rec.never_send and not rec.demo:
                members.append(rec)
            else:
                idx.pop(rid, None)
        target = vault / rel
        project_key = ""
        if members and rel.startswith(f"{topics.IDEAS}/") and rel.count("/") == 2:
            slug = topics.thread_of_tags(members[0].tags)
            project_key = f"project:{topics.thread_slug(slug)}" if slug else ""
        if not members:
            _remove(target)
            for k in [k for k, v in idx.items() if v == rel and not _is_record_key(k) and k.startswith("project:")]:
                idx.pop(k, None)
            _remove_empty_folder(vault, target.parent)
            continue
        text = render_topic(rel, members, known_people=stems)
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            unchanged = target.is_file() and target.read_text(encoding="utf-8") == text
        except OSError:
            unchanged = False
        if not unchanged:
            target.write_text(text, encoding="utf-8")
        if project_key:
            idx[project_key] = rel
        made += 1
    return made


def _remove_empty_folder(vault: Path, folder: Path) -> None:
    """Tidy away a project folder that no longer holds anything (never a top-level folder)."""
    try:
        rel = folder.relative_to(vault)
        if len(rel.parts) >= 2 and not any(folder.iterdir()):
            folder.rmdir()
    except (OSError, ValueError):
        pass


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def write_person(store: Any, vault: Path, person: dict[str, Any], *,
                 records: list[Any] | None = None) -> Path:
    """Write one person's note in People/: who they are and every line that mentions them."""
    vault = Path(vault)
    name = note_name(person["name"], fallback="Person")
    folder = vault / "People"
    folder.mkdir(parents=True, exist_ok=True)
    idx = _load_index(vault)
    key = f"person:{person['id']}"
    rel = idx.get(key) or f"People/{name}.md"
    taken = {r.lower() for k, r in idx.items() if k != key}
    if rel.lower() in taken:
        rel = f"People/{name} {person['id'][:4]}.md"
    old = idx.get(key)
    target = vault / rel
    lines = ["---", f"id: {person['id']}", "kind: person", f"title: {_yaml_scalar(person['name'])}"]
    if person.get("aliases"):
        lines.append("aliases: " + _yaml_list(list(person["aliases"])))
    if person.get("relation"):
        lines.append(f"relation: {_yaml_scalar(person['relation'])}")
    lines += ["tags: [people]", "---", ""]
    if person.get("notes"):
        lines += [person["notes"], ""]
    names = {person["name"].lower(), *(a.lower() for a in person.get("aliases", []))}
    pool = records if records is not None else store.list_records(status=ACTIVE, limit=10000)
    mentions = sorted(
        (r for r in pool if r.status == ACTIVE and idx.get(r.id) and {p.lower() for p in _record_people(r)} & names),
        key=lambda r: (r.event_time or r.created or "", r.id))
    days = sorted(d for d in (_day(r.event_time or r.created) for r in mentions) if d)
    summary = [person["relation"]] if person.get("relation") else []
    if mentions:
        summary.append(f"mentioned {len(mentions)} time{'s' if len(mentions) != 1 else ''}")
        if days:
            summary.append(f"first {days[0]}, latest {days[-1]}")
    if summary:
        lines += ["**" + " · ".join(summary) + "**", ""]
    if mentions:
        lines += ["## What I know", ""]
        for r in mentions:
            where = idx[r.id]
            day = _day(r.event_time or r.created)
            lines.append(f"- {day + ' — ' if day else ''}{_one_line(r.body or r.title)}"
                         f" (in [[{where[:-3]}|{Path(where).stem}]])")
        lines.append("")
    convs = [c for c in store.person_conversations(person) if (c.get("origin") or "").lower() not in LIVE_ORIGINS]
    if convs:
        lines += ["## Conversations", ""]
        for conv in convs:
            lines.append(f"- [[{conversation_note_stem(conv)}]] ({conv['origin']})")
        lines.append("")
    target.write_text("\n".join(lines), encoding="utf-8")
    if old and old != rel:
        _remove(vault / old)
    idx[key] = rel
    _save_index(vault, idx)
    return target


def project_threads(store: Any) -> dict[str, list[Any]]:
    """Active, shareable records grouped by project tag."""
    from . import exit as exit_gate

    out: dict[str, list[Any]] = {}
    for rec in store.list_records(status=ACTIVE, limit=100000):
        if rec.never_send or rec.demo or not exit_gate.keep(rec):
            continue
        for tag in rec.tags:
            if str(tag).startswith(topics.THREAD_PREFIX):
                out.setdefault(str(tag), []).append(rec)
    return out


def write_projects(store: Any, vault: Path) -> int:
    """Write every project's note again. A project's note is the one place its whole story lives.

    Project notes are written like any subject note (see :func:`write_record`);
    this only brings them all up to date and forgets projects with nothing left.
    """
    vault = Path(vault)
    idx = _load_index(vault)
    rels = {v for k, v in idx.items() if k.startswith("project:")}
    for rec in project_member_records(store):
        rel = idx.get(rec.id)
        if rel:
            rels.add(rel)
    made = render_notes(store, vault, rels, idx)
    for key in [k for k in idx if k.startswith("project:") and not (vault / idx[k]).is_file()]:
        idx.pop(key, None)
    _save_index(vault, idx)
    return made


def project_member_records(store: Any) -> list[Any]:
    from . import exit as exit_gate

    return [r for r in store.list_records(status=ACTIVE, limit=100000)
            if not (r.never_send or r.demo) and exit_gate.keep(r) and topics.thread_of_tags(r.tags)]


def conversation_note_stem(conv: dict[str, Any]) -> str:
    """The note name of a stored conversation."""
    # The start of an id is a clock reading, shared by everything made in the same
    # minutes; the end is the part that differs.
    return f"{_day(conv.get('created'))} {note_name(conv.get('origin') or 'chat', limit=20)} {str(conv['id']).split('-')[-1][:6]}"


def write_conversation(vault: Path, conv: dict[str, Any], hide: list[str] | None = None) -> Path | None:
    """Write an imported conversation, verbatim, as a source note (chats with Hermes are not written).

    *hide* lists sentences the owner made private; they are blanked in the note.
    """
    from .exit import mask

    vault = Path(vault)
    folder = vault / "Sources" / "Conversations"
    path = folder / f"{conversation_note_stem(conv)}.md"
    if (conv.get("origin") or "").strip().lower() in LIVE_ORIGINS:
        _remove(path)                      # chats with Hermes live in the app, not as one file per message
        return None
    folder.mkdir(parents=True, exist_ok=True)
    people = conv.get("people") or []
    lines = [
        "---", f"id: {conv['id']}", "kind: conversation",
        f"origin: {_yaml_scalar(conv.get('origin') or '')}",
        f"created: {conv.get('created') or ''}",
    ]
    if people:
        lines.append("people: " + _yaml_list([str(p) for p in people]))
    lines += ["tags: [source]", "---", ""]
    if people:
        lines += ["With: " + ", ".join(f"[[{p}]]" for p in people), ""]
    lines += [mask(conv.get("text") or "", hide or []), ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def write_summary_notes(store: Any, vault: Path, *, me_data: dict[str, Any] | None = None,
                        biography: str | None = None) -> None:
    """Write Journal/Biography.md. (There is no Me.md: the Me screen is where that lives.)"""
    vault = Path(vault)
    _remove(vault / ME_NOTE)                               # written by older versions
    if biography:
        path = vault / BIOGRAPHY_NOTE
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(biography.rstrip() + "\n", encoding="utf-8")


def rebuild(store: Any, vault: Path) -> dict[str, int]:
    """Write every note again from the store. Safe to run any time."""
    vault = Path(vault)
    ensure_layout(vault)
    idx = _load_index(vault)
    records = store.list_records(include_private=True, include_demo=True, limit=100000)
    cache = {r.id: r for r in records}
    dirty: set[str] = {v for k, v in idx.items() if _is_record_key(k)}        # notes from before: re-checked
    written = removed = 0
    for rec in records:
        if write_record(store, vault, rec, index=idx, dirty=dirty, cache=cache):
            written += 1
        else:
            removed += 1
    for rid in [k for k in idx if _is_record_key(k) and k not in cache]:       # records that no longer exist
        dirty.add(idx.pop(rid))
    _save_index(vault, idx)
    # People first: a line only links to a person who has a note.
    people = store.list_people(limit=10000)
    live = [r for r in records if r.status == ACTIVE and not r.never_send and not r.demo]
    for person in people:
        write_person(store, vault, store.get_person(person["id"]), records=live)
    idx = _load_index(vault)
    notes = render_notes(store, vault, dirty, idx, cache=cache)
    _save_index(vault, idx)
    convs = 0
    stems: set[str] = set()
    hide = store.private_phrases()
    for row in store.list_conversations(limit=100000):
        conv = store.get_conversation(row["id"])
        if conv and write_conversation(vault, conv, hide):
            stems.add(conversation_note_stem(conv))
            convs += 1
    for old in (vault / "Sources" / "Conversations").glob("*.md"):     # renders from an older naming
        if old.stem not in stems:
            _remove(old)
    from . import biography

    write_summary_notes(store, vault, biography=biography.load(vault)["text"] or None)
    _mark_layout(vault)
    return {"notes": written, "files": notes, "people": len(people), "conversations": convs}


def _mark_layout(vault: Path) -> None:
    path = Path(vault) / LAYOUT_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"layout": LAYOUT}), encoding="utf-8")


def layout_version(vault: Path) -> int:
    try:
        return int(json.loads((Path(vault) / LAYOUT_FILE).read_text(encoding="utf-8")).get("layout", 1))
    except (OSError, ValueError, TypeError):
        return 1


def needs_subject_layout(vault: Path) -> bool:
    """True for a vault written the old way (a note per memory) that has not been moved yet."""
    vault = Path(vault)
    return (vault / INDEX_FILE).is_file() and layout_version(vault) < LAYOUT


def migrate_to_subject_notes(store: Any, vault: Path) -> dict[str, Any]:
    """Move a vault with one note per memory to notes by subject. Loses nothing.

    A verified zip of the whole vault is written first; if it cannot be
    verified, nothing is touched. Then every note is written again, which
    takes the old one-note-per-memory files away (they are only a render of
    the store) and writes the subject notes, people and projects.
    """
    vault = Path(vault)
    if not needs_subject_layout(vault):
        return {"migrated": False}
    backup = _backup(vault, name="before-notes-by-subject")
    done = rebuild(store, vault)
    return {"migrated": True, "backup": backup.name, **done}


def export_all(store: Any, vault: Path, *, include_private: bool = False) -> int:
    """Write the whole vault again. Returns how many memory notes were written."""
    return rebuild(store, vault)["notes"]


_LINE_RE = re.compile(r"^- (?:\[([ xX])\] )?(?:(\d{4}-\d{2}-\d{2}) — )?(.*?)(?: · ((?:\[\[[^\]]+\]\](?:, )?)+))? \^([A-Za-z0-9-]+)\s*$")


def parse_lines(rel: str, text: str) -> list[dict[str, Any]]:
    """The memories written as lines in a subject note: id, words, date, people, to-do state."""
    meta, body = parse_frontmatter(text)
    out = []
    for line in body.splitlines():
        m = _LINE_RE.match(line.strip())
        if not m:
            continue
        box, day, words, people, rid = m.groups()
        out.append({
            "id": rid, "text": words.strip(), "date": day or "", "check": box,
            "people": re.findall(r"\[\[([^\]]+)\]\]", people or ""),
        })
    return out


def import_vault(vault: Path, store: Any) -> int:
    """Add records for memories in the vault that the store does not know.

    A subject note counts line by line (a line ending in ``^id``); a note from
    the older one-note-per-memory layout counts when it has an ``id`` in its
    frontmatter. Existing ids are left alone. Nothing here can sign anything:
    imported memories arrive as unconfirmed records.
    """
    from .records import Record

    vault = Path(vault)
    count = 0
    for path in sorted(vault.rglob("*.md")):
        parts = path.relative_to(vault).parts
        if parts[0].startswith(".") or parts[0] == "Sources":
            continue
        rel = path.relative_to(vault).as_posix()
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        kind = meta.get("kind", "")
        if kind in ("topic", "journal", "todo", "project"):
            top = parts[0]
            category = meta.get("category") or top
            for item in parse_lines(rel, text):
                if store.get_record(item["id"]) is not None:
                    continue
                tags = []
                if category in topics.CATEGORIES:
                    tags.append(topics.tag_for(category))
                if kind == "project" and len(parts) >= 2:
                    tags.append(topics.thread_tag(parts[1]))
                title = Path(rel).stem
                if kind == "topic" and title != category:
                    tags.append(topics.note_tag(title))
                if kind == "todo" or item["check"] is not None:
                    tags.append(topics.TODO_TAG)
                    if (item["check"] or "").lower() == "x":
                        tags.append(topics.DONE_TAG)
                store.add_record(Record(
                    id=item["id"], kind=JOURNAL if kind == "journal" else NOTE, subject="self",
                    speaker="source:import", status="active", trust=0.3, title=item["text"][:120],
                    body=item["text"], tags=tags, source={"people": item["people"], "origin": "vault"},
                ), changed_by="import")
                count += 1
            continue
        if not meta.get("id") or kind in ("person", "conversation"):
            continue
        if store.get_record(meta["id"]) is not None:
            continue
        rec = Record(
            id=meta["id"],
            kind=meta.get("kind", NOTE),
            subject=meta.get("subject", "self"),
            speaker=meta.get("speaker", "source:import"),
            status=meta.get("status", "active"),
            trust=min(float(meta.get("trust", 0.3) or 0.3), 0.6),
            title=meta.get("title", ""),
            body=body.strip(),
            tags=[t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
            never_send=meta.get("never_send") == "true",
        )
        store.add_record(rec, changed_by="import")
        count += 1
    return count


# -- moving an old layout to the new one -----------------------------------


def is_legacy(vault: Path) -> bool:
    """True when the vault still has the old numbered folders."""
    vault = Path(vault)
    return any((vault / name).is_dir() for name in LEGACY_FOLDER_NAMES)


def _backup(vault: Path, *, name: str = "before-new-layout") -> Path:
    """A full zip of the vault (database included) before anything moves."""
    vault = Path(vault)
    target_dir = vault / ".brain" / "backups"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{name}-{_now_stamp()}.zip"
    count = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(vault.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(vault)
            if rel.parts[:2] == (".brain", "backups"):
                continue
            zf.write(path, rel.as_posix())
            count += 1
    with zipfile.ZipFile(target) as zf:
        if zf.testzip() is not None or len(zf.namelist()) != count:
            target.unlink(missing_ok=True)
            raise RuntimeError("backup could not be verified; nothing was changed")
    return target


def migrate_legacy(store: Any, vault: Path) -> dict[str, Any]:
    """Move an old numbered-folder vault to the Obsidian layout. Loses nothing.

    1. A full, verified zip backup is written first. If it cannot be verified,
       nothing is touched.
    2. Raw intake files move to ``Sources/Files``; sharing receipts move to
       ``.brain/receipts``.
    3. The remaining old folders are moved, whole, into ``.brain/old-layout``
       (hidden from Obsidian, still on disk).
    4. Every note is written again in the new layout from the store.
    """
    vault = Path(vault)
    if not is_legacy(vault):
        return {"migrated": False}
    backup = _backup(vault)
    ensure_layout(vault)

    moved_files = 0
    inbox = vault / "01 Inbox"
    if inbox.is_dir():
        for path in sorted(inbox.rglob("*")):
            if path.is_file():
                dest = vault / "Sources" / "Files" / path.name
                if dest.exists():
                    dest = dest.with_name(f"{dest.stem}-{_now_stamp()}{dest.suffix}")
                shutil.move(str(path), str(dest))
                moved_files += 1
    receipts_old = vault / "07 Sharing Receipts"
    if receipts_old.is_dir():
        receipts_new = vault / ".brain" / "receipts"
        receipts_new.mkdir(parents=True, exist_ok=True)
        for path in sorted(receipts_old.glob("*")):
            if path.is_file():
                shutil.move(str(path), str(receipts_new / path.name))

    legacy_home = vault / ".brain" / "old-layout"
    legacy_home.mkdir(parents=True, exist_ok=True)
    kept = []
    for name in LEGACY_FOLDER_NAMES:
        folder = vault / name
        if folder.is_dir():
            dest = legacy_home / name
            if dest.exists():
                dest = legacy_home / f"{name}-{_now_stamp()}"
            shutil.move(str(folder), str(dest))
            kept.append(name)
    for stray in ("MANIFEST.json",):
        old = vault / stray
        if old.is_file():
            shutil.move(str(old), str(legacy_home / stray))

    # The index maps record ids to files; the old one (if any) is stale.
    _index_path(vault).unlink(missing_ok=True)
    counts = rebuild(store, vault)
    return {
        "migrated": True, "backup": str(backup), "moved_files": moved_files,
        "old_folders": kept, **counts,
    }
