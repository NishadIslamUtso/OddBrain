"""The check-up: a gentle, regular look over everything that is remembered.

It does two kinds of work, and keeps them apart.

**Checks** are things the app may fix by itself, because they only touch the notes
(a view of the database): a note that lost a line, a line that should not be
there any more, a private memory showing in a note. They are fixed and counted.

**Findings** are about what the owner said, so the app never settles them. It
lists them in plain words with one-click answers: two memories that disagree, the
same thing twice, a to-do that has sat for weeks, a memory whose saved proof no
longer matches the conversation it came from. An answer is the owner's own, so
it is logged like any other change and Undo works.

The last report is kept in ``.brain/audit.json`` so the Review screen can show it
without recomputing anything.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import conflicts, extract, manager, quotes, topics
from . import exit as exit_gate
from .records import ACTIVE, Record

logger = logging.getLogger(__name__)

STALE_TODO_DAYS = 45          # a to-do untouched this long gets a "still to do?"
SNOOZE_DAYS = 45              # "still to do" asks again after this long
MAX_PER_KIND = 8              # a short report: the most pressing few of each kind, then a count
_MAX_PAIRS = 40000            # a safety stop for very large stores
_COMMON = 40                  # a word in more memories than this does not tell two are about the same thing

KINDS = ("disagree", "twice", "old-todo", "quote")
_ID_AT_END = re.compile(r"\^([A-Za-z0-9-]+)\s*$")

# answer key -> what it does, per kind (the labels are the plain words the owner sees)
ACTIONS: dict[str, list[tuple[str, str]]] = {
    "disagree": [("keep_new", "Keep the newer one"), ("keep_old", "Keep the older one"), ("keep_both", "Both are right")],
    "twice": [("join", "Keep just one"), ("keep_both", "Keep both")],
    "old-todo": [("done", "Done"), ("still", "Still to do"), ("remove", "Not needed any more")],
    "quote": [("keep", "Keep it"), ("forget", "Forget it")],
}


# -- the saved report -------------------------------------------------------------------


def path_for(vault: Path) -> Path:
    return Path(vault) / ".brain" / "audit.json"


def _load(vault: Path) -> dict[str, Any]:
    try:
        data = json.loads(path_for(vault).read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("not an object")
    except (OSError, ValueError):
        data = {}
    data.setdefault("dismissed", {})
    data.setdefault("answered_pairs", [])
    data.setdefault("findings", [])
    data.setdefault("checks", [])
    data.setdefault("more", {})
    data.setdefault("lonely", {"count": 0, "notes": []})
    return data


def _save(vault: Path, data: dict[str, Any]) -> None:
    target = path_for(vault)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".audit-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1, sort_keys=True)
        os.replace(tmp, target)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def pair_answered(vault: Path, first_id: str, second_id: str) -> None:
    """The owner said "both are true" when asked: this pair is never raised as a disagreement."""
    data = _load(vault)
    pairs = set(data["answered_pairs"])
    pairs.add("|".join(sorted((first_id, second_id))))
    data["answered_pairs"] = sorted(pairs)
    _save(vault, data)


def public(vault: Path) -> dict[str, Any]:
    """The last report, as the screens show it (never the internal list of dismissed items)."""
    data = _load(vault)
    findings = data["findings"]
    checks = data["checks"]
    return {
        "ran": bool(data.get("last_run")),
        "last_run": data.get("last_run", ""),
        "findings": findings,
        "more": data["more"],
        "checks": checks,
        "lonely": data["lonely"],
        "summary": {
            "needs_you": len(findings) + sum(int(v) for v in data["more"].values()),
            "fixed": sum(int(c.get("fixed", 0)) for c in checks),
            "checks_ok": sum(1 for c in checks if c.get("ok")),
            "checks_total": len(checks),
        },
    }


# -- helpers --------------------------------------------------------------------------


def _today(today: str | None) -> str:
    return today or datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _fid(kind: str, *recs: Record) -> str:
    """A stable id for one finding: the same memories saying the same words give the same id."""
    parts = sorted(f"{r.id}:{hashlib.sha1((r.body or r.title or '').encode('utf-8')).hexdigest()[:8]}" for r in recs)
    return hashlib.sha1("|".join([kind, *parts]).encode("utf-8")).hexdigest()[:12]


def _muted(data: dict[str, Any], fid: str, today: str) -> bool:
    entry = data["dismissed"].get(fid)
    if not entry:
        return False
    until = entry.get("until")
    if until and until <= today:
        del data["dismissed"][fid]          # a snooze that ran out: ask again
        return False
    return True


def _text(rec: Record) -> str:
    return " ".join((rec.body or rec.title or "").split())


def _short(text: str, n: int = 140) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _day(rec: Record) -> str:
    return (rec.created or rec.capture_time or "")[:10]


def _who(text: str) -> tuple[str, frozenset[str]]:
    kind, tokens = extract.subject_of(text)
    return ("other", tokens) if kind == "other" else ("me", frozenset())


def _same_subject(a: str, b: str) -> bool:
    """Two statements are about the same person (the owner, or the same named someone)."""
    (ka, ta), (kb, tb) = _who(a), _who(b)
    if ka != kb:
        return False
    return ka == "me" or bool(ta & tb)


def _lasting(rec: Record) -> bool:
    return rec.status == ACTIVE and not rec.demo and rec.kind not in ("journal", "story") and topics.MOMENT_TAG not in rec.tags


def _is_todo(rec: Record) -> bool:
    return topics.TODO_TAG in rec.tags or topics.DONE_TAG in rec.tags


# -- findings -------------------------------------------------------------------------


def _candidate_pairs(texts: list[str]) -> list[tuple[int, int]]:
    """Pairs of memories sharing enough words to be worth comparing (no AI, no guessing)."""
    plain = [conflicts._plain_words(conflicts.read(t)) for t in texts]       # noqa: SLF001
    buckets: dict[str, list[int]] = {}
    for i, words in enumerate(plain):
        for w in words:
            buckets.setdefault(w, []).append(i)
    counts: dict[tuple[int, int], int] = {}
    for idxs in buckets.values():
        if len(idxs) < 2 or len(idxs) > _COMMON:
            continue
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                key = (idxs[a], idxs[b])
                counts[key] = counts.get(key, 0) + 1
    out = []
    for (i, j), n in counts.items():
        smaller = min(len(plain[i]), len(plain[j]))
        if n >= 2 or smaller <= 3:
            out.append((i, j))
            if len(out) >= _MAX_PAIRS:
                break
    return out


def _disagreements(recs: list[Record], answered: set[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    texts = [_text(r) for r in recs]
    for i, j in _candidate_pairs(texts):
        old, new = sorted((recs[i], recs[j]), key=lambda r: (r.created or "", r.id))
        if "|".join(sorted((old.id, new.id))) in answered:
            continue                          # the owner already said both are true
        t_old, t_new = _text(old), _text(new)
        if not _same_subject(t_old, t_new):
            continue
        if _is_todo(old) != _is_todo(new):
            continue
        verdict = conflicts.compare(t_new, t_old)
        if verdict == conflicts.CONFLICT and not _is_todo(new):
            out.append({
                "kind": "disagree", "id": _fid("disagree", old, new), "ids": [old.id, new.id],
                "title": "These two do not agree",
                "detail": f"Earlier ({_day(old)}): “{_short(t_old)}”\nLater ({_day(new)}): “{_short(t_new)}”",
                "sort": new.created or "",
            })
        elif verdict == conflicts.DUPLICATE:
            out.append({
                "kind": "twice", "id": _fid("twice", old, new), "ids": [old.id, new.id],
                "title": "The same thing is saved twice",
                "detail": f"“{_short(t_old)}” ({_day(old)})\n“{_short(t_new)}” ({_day(new)})",
                "sort": new.created or "",
            })
    return out


def _old_todos(recs: list[Record], today: str) -> list[dict[str, Any]]:
    cutoff = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=STALE_TODO_DAYS)).strftime("%Y-%m-%d")
    out = []
    for rec in recs:
        if topics.TODO_TAG not in rec.tags or topics.DONE_TAG in rec.tags:
            continue
        touched = max(_day(rec), (rec.modified or "")[:10])
        revisit = topics.revisit_of(rec.source)
        if not touched or touched > cutoff or (revisit and revisit > today):
            continue
        age = (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(_day(rec) or today, "%Y-%m-%d")).days
        out.append({
            "kind": "old-todo", "id": _fid("old-todo", rec), "ids": [rec.id],
            "title": "Still on your to-do list?",
            "detail": f"“{_short(_text(rec))}”\nAdded {age} days ago and not ticked off.",
            "sort": rec.created or "",
        })
    return out


def _lost_proof(store: Any, recs: list[Record]) -> list[dict[str, Any]]:
    """Memories whose saved proof no longer matches the conversation it came from (law 1)."""
    out = []
    cache: dict[str, str | None] = {}
    for rec in recs:
        src = rec.source or {}
        quote, digest, cid = str(src.get("quote") or ""), str(src.get("quote_hash") or ""), str(src.get("conversation_id") or "")
        if not (quote and digest and cid):
            continue
        if cid not in cache:
            conv = store.get_conversation(cid)
            cache[cid] = conv["text"] if conv else None
        said = cache[cid]
        if said is None:                      # the conversation was deleted: nothing to compare with
            continue
        if not quotes.verify_quote(quote, said, digest):
            out.append({
                "kind": "quote", "id": _fid("quote", rec), "ids": [rec.id],
                "title": "I cannot find the proof for this one any more",
                "detail": f"I saved “{_short(_text(rec))}” because you said “{_short(quote)}”, "
                          "but the conversation it came from does not read that way now.",
                "sort": rec.created or "",
            })
    return out


# -- checks (fixed by the app itself) ------------------------------------------------


def _notes_ids(vault: Path) -> set[str]:
    ids: set[str] = set()
    root = Path(vault)
    for path in root.rglob("*.md"):
        rel = path.relative_to(root).parts
        if rel[0].startswith((".", "_")) or rel[0] == "Sources":
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                m = _ID_AT_END.search(line)
                if m:
                    ids.add(m.group(1))
        except OSError:
            continue
    return ids


def _check_notes(store: Any, vault: Path, *, fix: bool) -> dict[str, Any]:
    from . import vault as vault_mod

    def compare_now() -> tuple[set[str], set[str], set[str]]:
        every = store.list_records(include_private=True, include_demo=True, limit=100000)
        should = {r.id for r in every if r.status == ACTIVE and not r.demo and exit_gate.keep(r)}
        withheld = {r.id for r in every if not exit_gate.keep(r) or r.status != ACTIVE or r.demo}
        present = _notes_ids(vault)
        return should - present, present - should, present & withheld

    missing, stray, leaked = compare_now()
    fixed = 0
    if (missing or stray) and fix:
        vault_mod.rebuild(store, vault)
        fixed = len(missing) + len(stray)
        missing, stray, leaked = compare_now()
    ok = not missing and not stray
    detail = "Every memory is in its note, and nothing extra is there."
    if fixed and ok:
        detail = f"Put {fixed} line(s) right in your notes."
    elif not ok:
        detail = f"{len(missing)} memory line(s) missing and {len(stray)} extra in your notes; I could not fix that."
    out = {"key": "notes", "title": "Your notes match what I remember", "ok": ok, "fixed": fixed if ok else 0, "detail": detail}
    return out | {"private_ok": not leaked, "leaked": len(leaked)}


def _check_private(notes: dict[str, Any]) -> dict[str, Any]:
    ok = bool(notes.get("private_ok"))
    return {"key": "private", "title": "Private things stay out of your notes", "ok": ok, "fixed": 0,
            "detail": "No private or removed memory shows in any note." if ok else f"{notes.get('leaked', 0)} line(s) that should be hidden are in a note."}


def _check_database(store: Any) -> dict[str, Any]:
    try:
        row = store.conn.execute("PRAGMA integrity_check").fetchone()
        ok = bool(row) and str(row[0]).lower() == "ok"
        detail = "My memory file is healthy." if ok else f"The memory file reports a problem: {row[0] if row else 'unknown'}."
    except Exception as exc:  # noqa: BLE001
        ok, detail = False, f"I could not check the memory file: {exc}"
    return {"key": "database", "title": "My memory file is healthy", "ok": ok, "fixed": 0, "detail": detail}


def _check_originals(vault: Path) -> dict[str, Any]:
    from .manifest import verify_manifest

    try:
        res = verify_manifest(vault)
        bad = len(res["changed"]) + len(res["missing"])
    except Exception as exc:  # noqa: BLE001
        return {"key": "originals", "title": "Your imported files are unchanged", "ok": False, "fixed": 0,
                "detail": f"I could not check them: {exc}"}
    return {"key": "originals", "title": "Your imported files are unchanged", "ok": bad == 0, "fixed": 0,
            "detail": "Every imported file is exactly as it arrived." if not bad else
            f"{bad} imported file(s) were changed or are missing, so I will not quote them as proof."}


def _lonely(store: Any, vault: Path) -> dict[str, Any]:
    from . import vaultview

    try:
        notes = vaultview.list_notes(store, vault)
        edges = vaultview.links(store, notes)
        linked = {e["source"] for e in edges} | {e["target"] for e in edges}
    except Exception:  # noqa: BLE001
        logger.warning("could not look for unlinked notes", exc_info=True)
        return {"count": 0, "notes": []}
    skip = (vaultview.TYPE_PERSON, vaultview.TYPE_SOURCE, vaultview.TYPE_SUMMARY)
    lone = sorted(n["title"] for n in notes if n["type"] not in skip and n["path"] not in linked)
    return {"count": len(lone), "notes": lone[:12]}


# -- the whole check-up ----------------------------------------------------------------


def run(store: Any, vault: Path, *, today: str | None = None, fix: bool = True) -> dict[str, Any]:
    """Look over everything, fix what only touches the notes, list the rest. Returns the report."""
    vault = Path(vault)
    day = _today(today)
    data = _load(vault)
    recs = [r for r in store.list_records(status=ACTIVE, include_private=True, limit=100000) if not r.demo]
    lasting = [r for r in recs if _lasting(r)]

    found: list[dict[str, Any]] = []
    for step in (lambda: _disagreements(lasting, set(data["answered_pairs"])), lambda: _old_todos(recs, day), lambda: _lost_proof(store, recs)):
        try:
            found.extend(step())
        except Exception:  # noqa: BLE001 - one bad look must not hide the others
            logger.warning("check-up step failed", exc_info=True)
    found = [f for f in found if not _muted(data, f["id"], day)]
    findings: list[dict[str, Any]] = []
    more: dict[str, int] = {}
    for kind in KINDS:
        mine = sorted((f for f in found if f["kind"] == kind), key=lambda f: f["sort"], reverse=True)
        for f in mine[:MAX_PER_KIND]:
            f["actions"] = [{"key": k, "label": label} for k, label in ACTIONS[kind]]
            f.pop("sort", None)
            findings.append(f)
        if len(mine) > MAX_PER_KIND:
            more[kind] = len(mine) - MAX_PER_KIND

    notes_check = _check_notes(store, vault, fix=fix)
    checks = [{k: v for k, v in notes_check.items() if k not in ("private_ok", "leaked")},
              _check_private(notes_check), _check_database(store), _check_originals(vault)]
    data.update({
        "last_run": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "findings": findings, "more": more, "checks": checks, "lonely": _lonely(store, vault),
    })
    _save(vault, data)
    return public(vault)


# -- the owner's answers ------------------------------------------------------------------


def act(store: Any, vault: Path, finding_id: str, action: str, *, today: str | None = None) -> dict[str, Any]:
    """Carry out the owner's answer to one finding. Raises ``LookupError`` / ``ValueError`` for bad requests."""
    vault = Path(vault)
    day = _today(today)
    data = _load(vault)
    finding = next((f for f in data["findings"] if f["id"] == finding_id), None)
    if finding is None:
        raise LookupError("That item is no longer on the list.")
    allowed = {k for k, _ in ACTIONS[finding["kind"]]}
    if action not in allowed:
        raise ValueError("That is not one of the choices.")
    ids = finding["ids"]
    result = "done"

    def forget(rid: str) -> None:
        manager.forget_record(store, rid, vault=vault)

    def mute(until: str | None = None) -> None:
        data["dismissed"][finding_id] = {"how": action, "at": day, **({"until": until} if until else {})}

    kind = finding["kind"]
    live = [store.get_record(rid) for rid in ids]
    if any(r is None or r.status != ACTIVE for r in live):
        result = "gone"                        # something changed since the report was made
    elif kind == "disagree":
        old, new = ids[0], ids[1]
        if action == "keep_new":
            forget(old)
        elif action == "keep_old":
            forget(new)
        else:
            mute()
    elif kind == "twice":
        if action == "join":
            forget(ids[1])                     # keep the older one, it has the history
        else:
            mute()
    elif kind == "old-todo":
        if action == "done":
            manager.mark_done(store, ids[0], done=True, vault=vault)
        elif action == "remove":
            forget(ids[0])
        else:
            mute(until=(datetime.strptime(day, "%Y-%m-%d") + timedelta(days=SNOOZE_DAYS)).strftime("%Y-%m-%d"))
    elif kind == "quote":
        if action == "forget":
            forget(ids[0])
        else:
            mute()
    data["findings"] = [f for f in data["findings"] if f["id"] != finding_id]
    _save(vault, data)
    return {"result": result}
