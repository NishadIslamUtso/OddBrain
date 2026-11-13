"""The vault — an Obsidian vault kept up to date by Memory_OB.

The vault is the human-readable *view* of the store, never the source of
truth. It is laid out the way Obsidian expects, so you can open the folder in
Obsidian and use its graph, search and backlinks directly::

    <vault>/
      .obsidian/            Obsidian's own settings (graph colours, plugins)
      .brain/               Memory_OB's private data (database, token, backups)
      Me.md                 what is true about you right now
      Health/ Plans/ ...    one folder per category, one note per memory
      People/               one note per person
      Journal/              Biography.md and dated entries
      Sources/              the raw evidence: conversations and files, unchanged

Notes use YAML frontmatter, nested ``#tags`` and ``[[wikilinks]]``. Law 2:
neverSend records are never written. Law 4: this is a render — deleting a note
here changes nothing in the store.
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
BIOGRAPHY_NOTE = "Journal/Biography.md"
ME_NOTE = "Me.md"

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


def folder_for(record: Any) -> str:
    """The vault folder a record's note lives in."""
    if record.kind in (JOURNAL, STORY):
        return "Journal"
    project = topics.thread_of_tags(record.tags)
    if project:
        return f"{topics.IDEAS}/{note_name(project, fallback='Project')}"     # all of a project in one place
    return topics.category_of(record.tags, record.body or record.title)


def render_record(
    record: Any,
    *,
    people: list[str] | None = None,
    related: list[str] | None = None,
) -> str:
    """Render one record as an Obsidian note."""
    category = topics.category_of(record.tags, record.body or record.title)
    free_tags = [t for t in record.tags if not str(t).startswith(topics.TAG_PREFIX)]
    project = topics.thread_of_tags(record.tags)
    lines = ["---"]
    lines.append(f"id: {record.id}")
    lines.append(f"kind: {record.kind}")
    lines.append(f"category: {_yaml_scalar(category)}")
    lines.append(f"status: {record.status}")
    lines.append(f"trust: {record.trust}")
    lines.append(f"title: {_yaml_scalar(record.title)}")
    lines.append(f"subject: {_yaml_scalar(record.subject)}")
    lines.append(f"speaker: {_yaml_scalar(record.speaker)}")
    lines.append("tags: " + _yaml_list([topics.tag_for(category), *free_tags]))
    if record.event_time:
        lines.append(f"event_time: {record.event_time}")
    if record.created:
        lines.append(f"created: {record.created}")
    if record.modified:
        lines.append(f"updated: {record.modified}")
    if record.confirmed_by:
        lines.append(f"confirmed_by: {_yaml_scalar(record.confirmed_by)}")
    origin = (record.source or {}).get("origin")
    if origin:
        lines.append(f"origin: {_yaml_scalar(origin)}")
    revisit = topics.revisit_of(record.source)
    if revisit:
        lines.append(f"revisit: {revisit}")
    project = topics.thread_of_tags(record.tags)
    if project:
        lines.append(f"project: {_yaml_scalar(project)}")
    if record.never_send:
        lines.append("never_send: true")
    for label, targets in (record.links or {}).items():
        if targets:
            lines.append(f"{label}: " + _yaml_list(list(targets)))
    lines.append("---")
    lines.append("")
    lines.append(record.body or record.title or "")
    if project:
        lines += ["", f"Part of: [[{note_name(project, fallback='Project')}]]"]
    if people:
        lines += ["", "People: " + ", ".join(f"[[{p}]]" for p in people)]
    if related:
        lines += ["", "Related: " + ", ".join(f"[[{r}]]" for r in related)]
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


def _free_path(vault: Path, folder: str, name: str, owner_id: str, index: dict[str, str]) -> str:
    """A note path inside *folder* that no other record uses."""
    taken = {rel.lower() for rid, rel in index.items() if rid != owner_id}
    n = 1
    while True:
        suffix = "" if n == 1 else f" {n}"
        rel = f"{folder}/{name}{suffix}.md"
        if rel.lower() not in taken:
            return rel
        n += 1


def vault_path_for(record: Any) -> Path:
    """The default vault file path for a record (before collisions)."""
    return Path(folder_for(record)) / f"{note_name(record.title or record.body, fallback=record.id)}.md"


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


def write_record(store: Any, vault: Path, record: Any, *, index: dict[str, str] | None = None) -> Path | None:
    """Write (or move, or remove) the note for one record.

    Active records get a note. Records that are trashed, retracted, superseded
    or neverSend have no note: if one exists it is removed (it is only a render).
    Returns the note path, or None when there is no note.
    """
    vault = Path(vault)
    own_index = index is None
    idx = _load_index(vault) if own_index else index
    assert idx is not None
    existing_rel = idx.get(record.id)

    if record.never_send or record.demo or record.status != ACTIVE:
        if existing_rel:
            _remove(vault / existing_rel)
            idx.pop(record.id, None)
            if own_index:
                _save_index(vault, idx)
        return None

    folder = folder_for(record)
    name = note_name(record.title or record.body, fallback=record.id)
    wanted_prefix = f"{folder}/"
    if existing_rel and existing_rel.startswith(wanted_prefix) and Path(existing_rel).stem.startswith(name):
        rel = existing_rel
    else:
        rel = _free_path(vault, folder, name, record.id, idx)
    target = vault / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    related = _related_notes(store, record, idx)
    target.write_text(
        render_record(record, people=_record_people(record), related=related),
        encoding="utf-8",
    )
    if existing_rel and existing_rel != rel:
        _remove(vault / existing_rel)
    idx[record.id] = rel
    if own_index:
        _save_index(vault, idx)
    return target


def _related_notes(store: Any, record: Any, idx: dict[str, str]) -> list[str]:
    """Notes this record is linked to (curated links only), by note name."""
    out: list[str] = []
    try:
        for src, dst, label in store.edges(record.id):
            if label == "shares_tag":
                continue
            other = dst if src == record.id else src
            rel = idx.get(other)
            if rel:
                out.append(Path(rel).stem)
    except Exception:  # noqa: BLE001
        return []
    return list(dict.fromkeys(out))


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def write_person(store: Any, vault: Path, person: dict[str, Any]) -> Path:
    """Write one person's note in People/."""
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
    mentions: list[str] = []
    days: list[str] = []
    names = {person["name"].lower(), *(a.lower() for a in person.get("aliases", []))}
    for rec in store.list_records(status=ACTIVE, limit=10000):
        rel_rec = idx.get(rec.id)
        if rel_rec and {p.lower() for p in _record_people(rec)} & names:
            mentions.append(f"- [[{Path(rel_rec).stem}]]")
            days.append(_day(rec.event_time or rec.created))
    days = sorted(d for d in days if d)
    summary = [person["relation"]] if person.get("relation") else []
    if mentions:
        summary.append(f"mentioned {len(mentions)} time{'s' if len(mentions) != 1 else ''}")
        if days:
            summary.append(f"first {days[0]}, latest {days[-1]}")
    if summary:
        lines += ["**" + " · ".join(summary) + "**", ""]
    if mentions:
        lines += ["## What I know", "", *mentions, ""]
    convs = store.person_conversations(person)
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
    """One hub note per project: where it stands, what is next, and the whole story in order.

    The hub is generated; the notes it links to are where details are edited.
    """
    vault = Path(vault)
    idx = _load_index(vault)
    threads = project_threads(store)
    written = 0
    live = set()
    for tag, recs in threads.items():
        title = topics.thread_title(tag)
        key = f"project:{tag[len(topics.THREAD_PREFIX):]}"
        live.add(key)
        recs = sorted(recs, key=lambda r: (r.event_time or r.created or "", r.created or ""))
        folder = f"{topics.IDEAS}/{note_name(title, fallback='Project')}"
        rel = f"{folder}/{note_name(title, fallback='Project')}.md"
        old = idx.get(key)

        def line(r: Any) -> str:
            stem = Path(idx[r.id]).stem if r.id in idx else ""
            link = f" ([[{stem}]])" if stem else ""
            return f"- {_day(r.event_time or r.created)} — {(r.body or r.title).strip()}{link}"

        lines = ["---", f"id: {key}", "kind: project", f"title: {_yaml_scalar(title)}",
                 f"tags: [{_yaml_scalar(tag)}]", "---", "", f"# {title}", "",
                 "_Kept up to date automatically. Edit the notes it links to._", ""]
        newest = list(reversed(recs))[:3]
        lines += ["## Where it stands", "", *[line(r) for r in newest], ""]
        later = [r for r in recs if topics.revisit_of(r.source)]
        if later:
            lines += ["## Come back to", "", *[
                f"- {topics.revisit_of(r.source)} — {(r.body or r.title).strip()}" for r in later], ""]
        todo = [r for r in recs if topics.TODO_TAG in r.tags and topics.DONE_TAG not in r.tags]
        if todo:
            lines += ["## To do", "", *[f"- [ ] {(r.body or r.title).strip()}" for r in todo], ""]
        lines += ["## Timeline", "", *[line(r) for r in recs], ""]
        convs = list(dict.fromkeys(
            str((r.source or {}).get("conversation_id") or "") for r in recs))
        convs = [c for c in convs if c]
        if convs:
            lines += ["## Where this came from", ""]
            seen_stems: set[str] = set()
            for cid in convs:
                conv = store.get_conversation(cid)
                if conv and conversation_note_stem(conv) not in seen_stems:
                    seen_stems.add(conversation_note_stem(conv))
                    lines.append(f"- [[{conversation_note_stem(conv)}]] ({conv.get('origin') or 'chat'})")
            lines.append("")
        target = vault / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines), encoding="utf-8")
        if old and old != rel:
            _remove(vault / old)
        idx[key] = rel
        written += 1
    for key in [k for k in idx if k.startswith("project:") and k not in live]:
        _remove(vault / idx.pop(key))
    _save_index(vault, idx)
    return written


def conversation_note_stem(conv: dict[str, Any]) -> str:
    """The note name of a stored conversation."""
    # The start of an id is a clock reading, shared by everything made in the same
    # minutes; the end is the part that differs.
    return f"{_day(conv.get('created'))} {note_name(conv.get('origin') or 'chat', limit=20)} {str(conv['id']).split('-')[-1][:6]}"


def write_conversation(vault: Path, conv: dict[str, Any], hide: list[str] | None = None) -> Path:
    """Write a stored conversation, verbatim, as a source note.

    *hide* lists sentences the owner made private; they are blanked in the note.
    """
    from .exit import mask

    vault = Path(vault)
    folder = vault / "Sources" / "Conversations"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{conversation_note_stem(conv)}.md"
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
    """Write Me.md and Journal/Biography.md."""
    from . import me as me_mod

    vault = Path(vault)
    (vault / ME_NOTE).write_text(
        me_mod.render_markdown(me_data if me_data is not None else me_mod.build(store, vault=vault)),
        encoding="utf-8",
    )
    if biography:
        path = vault / BIOGRAPHY_NOTE
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(biography.rstrip() + "\n", encoding="utf-8")


def rebuild(store: Any, vault: Path) -> dict[str, int]:
    """Write every note again from the store. Safe to run any time."""
    vault = Path(vault)
    ensure_layout(vault)
    idx = _load_index(vault)
    written = removed = 0
    for rec in store.list_records(include_private=True, include_demo=True, limit=100000):
        if write_record(store, vault, rec, index=idx):
            written += 1
        else:
            removed += 1
    _save_index(vault, idx)
    people = store.list_people(limit=10000)
    for person in people:
        write_person(store, vault, store.get_person(person["id"]))
    convs = 0
    stems: set[str] = set()
    hide = store.private_phrases()
    for row in store.list_conversations(limit=100000):
        conv = store.get_conversation(row["id"])
        if conv:
            write_conversation(vault, conv, hide)
            stems.add(conversation_note_stem(conv))
            convs += 1
    for old in (vault / "Sources" / "Conversations").glob("*.md"):     # renders from an older naming
        if old.stem not in stems:
            _remove(old)
    write_summary_notes(store, vault)
    write_projects(store, vault)
    return {"notes": written, "people": len(people), "conversations": convs}


def export_all(store: Any, vault: Path, *, include_private: bool = False) -> int:
    """Write the whole vault again. Returns how many memory notes were written."""
    return rebuild(store, vault)["notes"]


def import_vault(vault: Path, store: Any) -> int:
    """Add records for notes in the vault that the store does not know.

    Only notes with an ``id`` in their frontmatter count. Existing ids are
    left alone. Nothing here can sign anything: imported notes arrive as
    unconfirmed records.
    """
    from .records import Record

    vault = Path(vault)
    count = 0
    for path in sorted(vault.rglob("*.md")):
        parts = path.relative_to(vault).parts
        if parts[0].startswith(".") or parts[0] == "Sources":
            continue
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        if not meta.get("id") or meta.get("kind") in ("person", "conversation"):
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


def _backup(vault: Path) -> Path:
    """A full zip of the vault (database included) before anything moves."""
    vault = Path(vault)
    target_dir = vault / ".brain" / "backups"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"before-new-layout-{_now_stamp()}.zip"
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
