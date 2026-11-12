"""Standing-layer sync — confirmed truth into Hermes's own memory files.

Hermes reads ``MEMORY.md`` and ``USER.md`` every session. This module keeps a
clearly marked block inside each file in step with the Memory_OB ledger.

The rules (§15 rule 6) are strict because these files are the owner's:

* **opt-in** — off unless the owner switches it on;
* **confirmed only** — demo, unconfirmed, pending and neverSend records never
  sync, into either file, ever;
* **back up first** — every run that will change a file writes a timestamped
  copy beside it;
* **the block is ours, the rest is theirs** — hand-written text outside the
  marked block never moves;
* **idempotent** — a second run changes nothing.

The vault remains the source of truth; these files are a convenience copy.
"""

from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

BEGIN = "<!-- Memory_OB begin (generated — do not edit inside) -->"
END = "<!-- Memory_OB end -->"

CONFIRMED_TRUST = 0.8


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def render_block(records: list[Any], heading: str) -> str:
    """The marked block, heading included: one line per confirmed record."""
    lines = [
        BEGIN,
        "",
        heading,
        "",
        f"Confirmed memory ({len(records)} record(s)). Source of truth: the Memory_OB ledger.",
        "",
    ]
    for r in records:
        who = f"{r.speaker} · {r.kind} · trust {r.trust:.1f}"
        lines.append(f"- {r.title} — {r.body}  [{who}]  (`{r.id}`)")
    lines += ["", END, ""]
    return "\n".join(lines)


def _split(text: str) -> tuple[str, str, str]:
    """Return (before, block, after) for the marked region."""
    i = text.find(BEGIN)
    if i == -1:
        return text, "", ""
    j = text.find(END, i)
    if j == -1:
        return text, "", ""
    return text[:i], text[i : j + len(END)], text[j + len(END) :]


def _backup(path: Path) -> Path | None:
    """A timestamped copy beside the file, taken before any change."""
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = path.with_suffix(path.suffix + f".{stamp}.bak")
    shutil.copy2(path, dest)
    return dest


def _write_if_changed(path: Path, content: str) -> str:
    """Write *content* to *path* only when it differs. Returns what happened."""
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return "unchanged"
    _backup(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return "written"


def confirmed_records(store: Any) -> list[Any]:
    """Signed truth only — the only thing that may sync (§15 rule 6).

    "Confirmed" means a Review card signed the record: confirmed tier, active,
    and a ``confirmed_by``. Anything less is a candidate, and candidates never
    reach standing memory.
    """
    from .exit import keep

    return [
        r
        for r in store.list_records(include_private=False, limit=10000)
        if r.is_truth and keep(r)
    ]


def sync_file(
    store: Any, path: Path, *, heading: str, enabled: bool = True
) -> dict[str, Any]:
    """Sync one Hermes memory file. Returns a small report."""
    block = render_block(confirmed_records(store), heading)

    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    before, _old_block, after = _split(existing)

    if not enabled:
        # Switching off removes our block and leaves the owner's text alone.
        if _old_block:
            content = (before + after).rstrip() + "\n"
            result = _write_if_changed(path, content)
            return {"file": str(path), "result": result, "removed": True}
        return {"file": str(path), "result": "unchanged", "removed": False}

    before = before.rstrip()
    after = after.lstrip("\n")
    content = (before + "\n\n" + block + "\n" + after).strip() + "\n" if before else block
    result = _write_if_changed(path, content)
    return {"file": str(path), "result": result, "removed": False}


def sync_all(
    store: Any,
    *,
    memory_path: Path,
    user_path: Path,
    enabled: bool = False,
) -> dict[str, Any]:
    """Sync both Hermes memory files. Opt-in (§15 rule 6) and idempotent."""
    return {
        "enabled": enabled,
        "memory": sync_file(store, memory_path, heading="# Memory (confirmed)", enabled=enabled),
        "user": sync_file(store, user_path, heading="# User (confirmed)", enabled=enabled),
        "synced": len(confirmed_records(store)),
        "at": _now(),
    }
