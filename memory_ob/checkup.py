"""The monthly check-up: a short, friendly summary of how the memory is doing.

Once a month - the first time the owner opens the Review screen in a new
month - Memory_OB shows a summary: how much is remembered, what came and
went during the month, what is coming back to, and whether anything is
waiting for the owner's answer. The summary only reads; the one thing it
writes is the date stamp that remembers it was shown. The owner can ask for
the summary any time from Settings.

This is not the nightly check-up (audit.py) that looks for problems. This
one is the plain "how are things going" note.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import topics

STAMP_FILE = "checkup.json"
HOW_OFTEN_DAYS = 30

_ASIDE_STATUSES = {"trash", "trashed", "retracted", "removed", "retired"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def stamp_path(vault: Path | None) -> Path | None:
    return (Path(vault) / ".brain" / STAMP_FILE) if vault else None


def last_shown(vault: Path | None) -> datetime | None:
    path = stamp_path(vault)
    if path is None or not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return datetime.fromisoformat(str(raw["last_shown"]))
    except Exception:  # noqa: BLE001 - a damaged stamp just means "show it again"
        return None


def mark_shown(vault: Path | None, *, now: datetime | None = None) -> None:
    """Remember that the summary was shown this month."""
    path = stamp_path(vault)
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"last_shown": _iso(now or _now())}), encoding="utf-8")


def due(vault: Path | None, *, now: datetime | None = None) -> bool:
    """Is it time to show the summary again? About once a month."""
    last = last_shown(vault)
    if last is None:
        return True
    return (now or _now()) - last >= timedelta(days=HOW_OFTEN_DAYS)


def _parse_when(value: Any) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _things(n: int) -> str:
    return "1 thing" if n == 1 else f"{n} things"


def _text_of(snap: dict[str, Any]) -> str:
    return str(snap.get("body") or snap.get("title") or snap.get("text") or "")


def _month_counts(store: Any, since: datetime) -> dict[str, int]:
    added = corrected = aside = 0
    for change in store.list_changes(limit=10000):
        if change.get("entity") != "record":
            continue
        if change.get("undone_at"):
            continue          # a change put back did not really happen
        at = _parse_when(change.get("at"))
        if at is not None and at < since:
            continue
        action = str(change.get("action") or "")
        before, after = change.get("before") or {}, change.get("after") or {}
        was_away = str(before.get("status") or "").lower() in _ASIDE_STATUSES
        now_away = str(after.get("status") or "").lower() in _ASIDE_STATUSES
        if action == "create":
            added += 1
        elif action in ("remove", "retire", "retract") or (now_away and not was_away):
            aside += 1
        elif action == "update":
            if _text_of(before) != _text_of(after):
                corrected += 1
    return {"added": added, "corrected": corrected, "aside": aside}


def summary(store: Any, *, vault: Path | None = None, now: datetime | None = None,
            coming: list[dict[str, Any]] | None = None,
            waiting: int | None = None) -> dict[str, Any]:
    """The whole summary, in numbers and in plain sentences."""
    now = now or _now()
    active = store.list_records(status="active")
    notes = sum(1 for r in active if topics.note_of_tags(list(r.tags or [])))
    people = len(store.list_people(limit=100000))

    last = last_shown(vault)
    since = last if last is not None else now - timedelta(days=HOW_OFTEN_DAYS)
    month = _month_counts(store, since)

    coming = list(coming or [])
    waiting = int(waiting or 0)

    overdue = 0
    for item in coming:
        when = item.get("revisit_at") or item.get("due") or ""
        day = str(when)[:10]
        if day and day < now.date().isoformat():
            overdue += 1

    lines: list[str] = [f"{len(active)} memories and notes are saved, about {people} people."]
    if month["added"] or month["corrected"] or month["aside"]:
        lines.append(
            f"This month: {month['added']} new, {month['corrected']} corrected,"
            f" {month['aside']} put aside.")
    else:
        lines.append("Nothing new this month - everything stayed the same.")
    if coming:
        lines.append(f"{_things(len(coming))} to come back to"
                     + (f", {_things(overdue)} past their date." if overdue else "."))
    else:
        lines.append("Nothing to come back to right now.")
    if waiting:
        lines.append(f"{_things(waiting)} waiting for your answer.")
    else:
        lines.append("Nothing is waiting for your answer.")

    return {
        "at": _iso(now),
        "totals": {"memories": len(active), "notes": notes, "people": people},
        "month": month,
        "coming": len(coming),
        "overdue": overdue,
        "waiting": waiting,
        "lines": lines,
    }


def card(store: Any, *, vault: Path | None = None, now: datetime | None = None,
         coming: list[dict[str, Any]] | None = None,
         waiting: int | None = None) -> dict[str, Any]:
    """The summary plus "should it be shown this month"."""
    now = now or _now()
    out = summary(store, vault=vault, now=now, coming=coming, waiting=waiting)
    out["show"] = due(vault, now=now)
    return out
