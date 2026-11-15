"""Standing-layer sync — confirmed truth into Hermes's own memory files.

Hermes reads ``MEMORY.md`` and ``USER.md`` (in its ``memories`` folder) at the
start of every session and puts them in the prompt. This module keeps one
clearly marked entry inside each file in step with what Memory_OB remembers.

Hermes keeps these files small on purpose (about 2,200 and 1,375 characters)
and refuses to save anything of its own once a file is full. So the entry is a
short digest, never the whole ledger: it takes a limited share of the room,
leaves the rest to Hermes, and points at ``memory_ob_search`` for everything
else.

The rules (§15 rule 6) are strict because these files are the owner's:

* **opt-in** — off unless the owner switches it on;
* **confirmed only** — demo, unconfirmed, pending, private and neverSend
  records never sync, into either file, ever;
* **back up first** — the first time we touch a file we copy it beside it;
* **the entry is ours, the rest is theirs** — hand-written text outside the
  marked entry never moves;
* **fits** — our entry never uses more than its share, and never pushes the
  file over Hermes's limit;
* **idempotent** — a second run changes nothing.

The vault remains the source of truth; these files are a convenience copy.
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Hermes splits its notes into entries on this line, so each of our blocks is one entry.
DELIM = "\n§\n"
BEGIN = "<!-- Memory_OB -->"
END = "<!-- /Memory_OB -->"
# What older versions of Memory_OB wrote; still recognised so they can be cleaned up.
_OLD_BEGIN = "<!-- Memory_OB begin (generated — do not edit inside) -->"
_OLD_END = "<!-- Memory_OB end -->"

CONFIRMED_TRUST = 0.8
SHARE = 0.45          # the most of a file we take, so Hermes keeps room for its own notes
MARGIN = 60           # characters left free on top of that
MIN_ROOM = 150        # below this there is no point writing anything
LINE_MAX = 140
BACKUPS_KEPT = 3

USER_HEADING = "Memory_OB · about the owner (confirmed). More: memory_ob_search"
MEMORY_HEADING = (
    "Memory_OB holds {total} confirmed memories about the owner. Use memory_ob_search "
    "before saying you do not know something. Projects and decisions:"
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# -- choosing what goes in -------------------------------------------------


def _line(record: Any) -> str:
    """One memory as one short line. No new lines and no ``§`` — both would split an entry."""
    text = " ".join(str(record.body or record.title or "").replace("§", " ").split())
    return text if len(text) <= LINE_MAX else text[: LINE_MAX - 1].rstrip() + "…"


def _tags(record: Any) -> set[str]:
    return {str(t).lower() for t in (record.tags or [])}


def ranked(records: list[Any]) -> tuple[list[Any], list[Any]]:
    """Split confirmed memories into (about the owner, projects and decisions), best first.

    Passing moments, finished to-dos and empty text are left out. Within each
    group the most important and most recent come first.
    """
    pool = [
        r for r in records
        if r.kind != "journal"
        and not (_tags(r) & {"moment", "done"})
        and _line(r)
    ]
    pool.sort(key=lambda r: r.modified or r.created or "", reverse=True)
    pool.sort(key=lambda r: -int(r.importance or 0))
    work = [r for r in pool if _tags(r) & {"todo", "project"} or int(r.importance or 0) >= 2]
    work_ids = {r.id for r in work}
    personal = [r for r in pool if r.id not in work_ids]
    return personal, work


def render_block(records: list[Any], heading: str, budget: int | None = None) -> tuple[str, int]:
    """The marked entry and how many memories made it in (all of them when no budget)."""
    shell = len(BEGIN) + len(END) + len(heading) + 3  # three line breaks
    lines: list[str] = []
    used = shell
    for r in records:
        text = "- " + _line(r)
        more = len(records) - len(lines) - 1
        reserve = 0 if more <= 0 else 40  # room for "(+N more: memory_ob_search)"
        if budget is not None and used + len(text) + 1 + reserve > budget:
            break
        lines.append(text)
        used += len(text) + 1
    left = len(records) - len(lines)
    if left:
        lines.append(f"(+{left} more: memory_ob_search)")
    return "\n".join([BEGIN, heading, *lines, END]), len(lines) - (1 if left else 0)


# -- the file ---------------------------------------------------------------


def _split(text: str) -> tuple[str, str, str]:
    """Return (before, block, after) for the marked region (old or new markers)."""
    starts = [i for i in (text.find(BEGIN), text.find(_OLD_BEGIN)) if i != -1]
    if not starts:
        return text, "", ""
    i = min(starts)
    ends = [(j, m) for m in (END, _OLD_END) if (j := text.find(m, i)) != -1]
    if not ends:
        return text, "", ""
    j, marker = min(ends)
    return text[:i], text[i : j + len(marker)], text[j + len(marker) :]


def _trim_end(text: str) -> str:
    """Drop the entry line and blank space that sat between the text and our entry."""
    text = text.rstrip()
    return text[: -len("§")].rstrip() if text.endswith("§") else text


def _trim_start(text: str) -> str:
    text = text.lstrip()
    return text[len("§"):].lstrip() if text.startswith("§") else text


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig") if path.exists() else ""
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def _backup(path: Path) -> Path | None:
    """A timestamped copy beside the file, taken before we first change it."""
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = path.with_suffix(path.suffix + f".{stamp}.bak")
    shutil.copy2(path, dest)
    old = sorted(path.parent.glob(path.name + ".*.bak"))
    for extra in old[:-BACKUPS_KEPT]:
        try:
            extra.unlink()
        except OSError:
            pass
    return dest


def _write_if_changed(path: Path, content: str, *, backup: bool = True) -> str:
    """Write *content* to *path* only when it differs. Returns what happened."""
    if path.exists() and _read(path).strip() == content.strip():
        return "unchanged"
    if not path.exists() and not content.strip():
        return "unchanged"
    if backup:
        _backup(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Whole file at once, so Hermes never reads half of it.
    tmp = path.with_name(path.name + ".mob-tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    os.replace(tmp, path)
    return "written"


def confirmed_records(store: Any) -> list[Any]:
    """Signed truth only — the only thing that may sync (§15 rule 6).

    "Confirmed" means a Review card signed the record: confirmed tier, active,
    and a ``confirmed_by``. Anything less is a candidate, and candidates never
    reach standing memory. Private memories never leave either.
    """
    from .exit import keep

    return [
        r
        for r in store.list_records(include_private=False, limit=10000)
        if r.is_truth and keep(r)
    ]


def sync_file(
    store: Any,
    path: Path,
    *,
    heading: str,
    enabled: bool = True,
    records: list[Any] | None = None,
    limit: int = 2200,
    always: bool = False,
) -> dict[str, Any]:
    """Sync one Hermes memory file. Returns a small report.

    *records* is the list that may go in (best first); by default every
    confirmed memory. *always* writes the entry even with no memories in it.
    """
    existing = _read(path)
    before, old_block, after = _split(existing)
    before, after = _trim_end(before), _trim_start(after)
    others = [part for part in (before, after) if part.strip()]
    report: dict[str, Any] = {"file": str(path), "removed": False, "shown": 0, "total": 0}

    def finish(block: str) -> dict[str, Any]:
        parts = [before, block, after] if block else [before, after]
        content = DELIM.join(p for p in parts if p.strip())
        content = content + "\n" if content else ""
        # The first time we touch the file, keep the owner's version.
        report["result"] = _write_if_changed(path, content, backup=bool(existing.strip()) and not old_block)
        return report

    if not enabled:
        report["removed"] = bool(old_block)
        return finish("") if old_block else {**report, "result": "unchanged"}

    if records is None:
        personal, work = ranked(confirmed_records(store))
        records = personal + work
    report["total"] = len(records)
    taken = len(DELIM.join(others)) + (len(DELIM) if others else 0)
    budget = min(int(limit * SHARE), limit - taken - MARGIN)
    if budget < MIN_ROOM:
        report["note"] = "no room"
        return finish("")
    if not records and not always:
        return finish("")
    block, shown = render_block(records, heading, budget)
    if len(block) > budget:  # even the heading alone does not fit
        report["note"] = "no room"
        return finish("")
    report["shown"] = shown
    return finish(block)


def sync_all(
    store: Any,
    *,
    memory_path: Path,
    user_path: Path,
    enabled: bool = False,
    memory_limit: int = 2200,
    user_limit: int = 1375,
) -> dict[str, Any]:
    """Sync both Hermes memory files. Opt-in (§15 rule 6) and idempotent.

    USER.md gets the facts about the owner; MEMORY.md gets a pointer to
    ``memory_ob_search`` plus projects and decisions, and takes whatever did
    not fit in USER.md.
    """
    everything = confirmed_records(store)
    personal, work = ranked(everything)
    total = len(personal) + len(work)
    user = sync_file(store, user_path, heading=USER_HEADING, enabled=enabled,
                     records=personal, limit=user_limit)
    left_over = personal[user["shown"]:] if enabled else []
    memory = sync_file(store, memory_path, heading=MEMORY_HEADING.format(total=total), enabled=enabled,
                       records=work + left_over, limit=memory_limit, always=total > 0)
    return {
        "enabled": enabled,
        "memory": memory,
        "user": user,
        "synced": total,
        "shown": user["shown"] + memory["shown"],
        "at": _now(),
    }
