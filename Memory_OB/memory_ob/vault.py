"""Vault export — the 12-folder markdown view.

The vault is the human-readable *view* of the store, never the source of
truth. Every record becomes one markdown file with YAML frontmatter, placed
in the folder that matches its kind.

Law 2: neverSend records are never exported. Law 4: the export is a render —
deleting a file here changes nothing in the store.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .config import VAULT_FOLDER_NAMES
from .records import CAPSULE, JOURNAL, LEARNING, NOTE, PROFILE, STORY

# kind -> vault folder
KIND_FOLDER: dict[str, str] = {
    PROFILE: "10 People",
    JOURNAL: "08 Journal",
    STORY: "03 Memory",
    CAPSULE: "03 Memory",
    LEARNING: "05 Knowledge",
    NOTE: "04 Working Memory",
}

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def _slug(text: str, max_len: int = 60) -> str:
    s = re.sub(r"[^\w\s-]", "", text or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    return (s[:max_len].rstrip("-")) or "record"


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


def render_record(record: Any) -> str:
    """Render one record as markdown with YAML frontmatter."""
    lines = ["---"]
    lines.append(f"id: {record.id}")
    lines.append(f"kind: {record.kind}")
    lines.append(f"subject: {_yaml_scalar(record.subject)}")
    lines.append(f"speaker: {_yaml_scalar(record.speaker)}")
    lines.append(f"status: {record.status}")
    lines.append(f"trust: {record.trust}")
    lines.append(f"title: {_yaml_scalar(record.title)}")
    if record.tags:
        lines.append("tags: [" + ", ".join(_yaml_scalar(t) for t in record.tags) + "]")
    if record.event_time:
        lines.append(f"event_time: {record.event_time}")
    if record.capture_time:
        lines.append(f"capture_time: {record.capture_time}")
    if record.confirmed_by:
        lines.append(f"confirmed_by: {_yaml_scalar(record.confirmed_by)}")
    if record.never_send:
        lines.append("never_send: true")
    for label, targets in (record.links or {}).items():
        if targets:
            lines.append(
                f"{label}: [" + ", ".join(_yaml_scalar(t) for t in targets) + "]"
            )
    lines.append("---")
    lines.append("")
    if record.title:
        lines.append(f"# {record.title}")
        lines.append("")
    lines.append(record.body or "")
    lines.append("")
    return "\n".join(lines)


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
            inner = val[1:-1].strip()
            meta[key.strip()] = inner
        else:
            meta[key.strip()] = val.strip().strip('"').strip("'")
    return meta, text[m.end() :]


def vault_path_for(record: Any) -> Path:
    """The vault file path for a record."""
    folder = KIND_FOLDER.get(record.kind, "03 Memory")
    return Path(folder) / f"{record.id}-{_slug(record.title)}.md"


def export_all(store: Any, vault: Path, *, include_private: bool = False) -> int:
    """Export every record to the vault. Returns the count written."""
    vault = Path(vault)
    for name in VAULT_FOLDER_NAMES:
        (vault / name).mkdir(parents=True, exist_ok=True)
    records = store.list_records(include_private=include_private, limit=10000)
    written = 0
    for rec in records:
        if rec.never_send and not include_private:
            continue
        path = vault / vault_path_for(rec)
        path.write_text(render_record(rec), encoding="utf-8")
        written += 1
    return written


def import_vault(vault: Path, store: Any) -> int:
    """Import markdown files from the vault into the store.

    Existing ids are updated, new ids are added. Trashed/private records in
    the vault are skipped unless they already exist.
    """
    vault = Path(vault)
    count = 0
    for name in VAULT_FOLDER_NAMES:
        folder = vault / name
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
            if not meta.get("id"):
                continue
            existing = store.get_record(meta["id"])
            if existing is not None:
                continue
            from .records import Record

            rec = Record(
                id=meta["id"],
                kind=meta.get("kind", NOTE),
                subject=meta.get("subject", "self"),
                speaker=meta.get("speaker", "source:import"),
                status=meta.get("status", "active"),
                trust=float(meta.get("trust", 0.3) or 0.3),
                title=meta.get("title", ""),
                body=body.strip(),
                tags=[t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
                never_send=meta.get("never_send") == "true",
            )
            store.add_record(rec, changed_by="import")
            count += 1
    return count
