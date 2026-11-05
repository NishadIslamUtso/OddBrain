"""The SQLite store — attic, truth ledger, and the disposable living index.

Three layers, one database file:

* **attic** — every capture, speaker-tagged, append-only, sacred.
* **ledger** — confirmed records, history forever, the only truth.
* **index** — candidate facts, trust scores, edges. Disposable: delete and
  rebuild any time.

The store never permanently deletes. Deletion is a trash transition, and
trash keeps who/what/why/previous (law 3).
"""

from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable, Iterator

from . import ids as idgen
from .records import (
    ACTIVE,
    RETRACTED,
    SUPERSEDED,
    TRASH,
    Record,
)

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'self',
    speaker TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    trust REAL NOT NULL DEFAULT 0.1,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '{}',
    event_time TEXT,
    capture_time TEXT,
    confirmed_by TEXT,
    never_send INTEGER NOT NULL DEFAULT 0,
    links TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL,
    modified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    changed_by TEXT,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    trust REAL NOT NULL DEFAULT 0.3,
    status TEXT NOT NULL DEFAULT 'candidate',
    source TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (src, dst, label)
);

CREATE TABLE IF NOT EXISTS activity (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);

CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    id UNINDEXED,
    title,
    body,
    tags
);

CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind);
CREATE INDEX IF NOT EXISTS idx_records_trust ON records(trust);
CREATE INDEX IF NOT EXISTS idx_history_record ON history(record_id);
"""


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# FTS5 query neutraliser. User text is untrusted: raw input can contain FTS5
# operators (AND, OR, NEAR, *, ^) or punctuation that the parser reads as
# syntax. We keep only alphanumeric tokens and AND them together, so a query
# can never be interpreted as FTS5 syntax and hyphenated words still match.
_FTS_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")


def _fts_query(query: str) -> str:
    """Turn arbitrary user text into a safe FTS5 MATCH expression."""
    parts = _FTS_TOKEN_RE.findall(query or "")
    if not parts:
        return ""
    return " AND ".join(f'"{p}"' for p in parts)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


class Store:
    """The Memory_OB store."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self._meta_setdefault("schema_version", str(SCHEMA_VERSION))
        self._meta_setdefault("created_at", _now())

    # -- lifecycle ---------------------------------------------------------

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _meta_setdefault(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO NOTHING",
            (key, value),
        )
        self.conn.commit()

    # -- records -----------------------------------------------------------

    def add_record(self, rec: Record, changed_by: str | None = None) -> Record:
        now = _now()
        if not rec.created:
            rec.created = now
        rec.modified = now
        self.conn.execute(
            "INSERT OR REPLACE INTO records"
            "(id, kind, subject, speaker, status, trust, title, body, tags,"
            " source, event_time, capture_time, confirmed_by, never_send,"
            " links, created, modified)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                rec.id, rec.kind, rec.subject, rec.speaker, rec.status,
                rec.trust, rec.title, rec.body, _json(rec.tags),
                _json(rec.source), rec.event_time, rec.capture_time,
                rec.confirmed_by, int(rec.never_send), _json(rec.links),
                rec.created, rec.modified,
            ),
        )
        self.conn.execute(
            "INSERT OR REPLACE INTO records_fts(id, title, body, tags)"
            " VALUES(?,?,?,?)",
            (rec.id, rec.title, rec.body, " ".join(rec.tags)),
        )
        self._append_history(rec, changed_by=changed_by, reason="create")
        self.conn.commit()
        return rec

    def get_record(self, record_id: str) -> Record | None:
        row = self.conn.execute(
            "SELECT * FROM records WHERE id = ?", (record_id,)
        ).fetchone()
        return self._row_to_record(row) if row else None

    def list_records(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        speaker: str | None = None,
        include_private: bool = False,
        limit: int = 200,
    ) -> list[Record]:
        sql = "SELECT * FROM records WHERE 1=1"
        params: list[Any] = []
        if kind is not None:
            sql += " AND kind = ?"
            params.append(kind)
        if status is not None:
            sql += " AND status = ?"
            params.append(status)
        if speaker is not None:
            sql += " AND speaker = ?"
            params.append(speaker)
        # Law 2: neverSend records never appear in any listing, screen or
        # export. Only an explicit owner-facing call may include them.
        if not include_private:
            sql += " AND never_send = 0"
        sql += " ORDER BY created DESC LIMIT ?"
        params.append(limit)
        rows = self.conn.execute(sql, params).fetchall()
        return [self._row_to_record(r) for r in rows]

    def update_record(
        self, rec: Record, changed_by: str | None = None, reason: str | None = None
    ) -> Record:
        rec.modified = _now()
        self.conn.execute(
            "UPDATE records SET kind=?, subject=?, speaker=?, status=?, trust=?,"
            " title=?, body=?, tags=?, source=?, event_time=?, capture_time=?,"
            " confirmed_by=?, never_send=?, links=?, modified=? WHERE id=?",
            (
                rec.kind, rec.subject, rec.speaker, rec.status, rec.trust,
                rec.title, rec.body, _json(rec.tags), _json(rec.source),
                rec.event_time, rec.capture_time, rec.confirmed_by,
                int(rec.never_send), _json(rec.links), rec.modified, rec.id,
            ),
        )
        self.conn.execute(
            "INSERT OR REPLACE INTO records_fts(id, title, body, tags)"
            " VALUES(?,?,?,?)",
            (rec.id, rec.title, rec.body, " ".join(rec.tags)),
        )
        self._append_history(rec, changed_by=changed_by, reason=reason or "update")
        self.conn.commit()
        return rec

    def _row_to_record(self, row: sqlite3.Row) -> Record:
        return Record(
            id=row["id"],
            kind=row["kind"],
            subject=row["subject"],
            speaker=row["speaker"],
            status=row["status"],
            trust=row["trust"],
            title=row["title"],
            body=row["body"],
            tags=json.loads(row["tags"]),
            source=json.loads(row["source"]),
            event_time=row["event_time"],
            capture_time=row["capture_time"],
            confirmed_by=row["confirmed_by"],
            never_send=bool(row["never_send"]),
            links=json.loads(row["links"]),
            created=row["created"],
            modified=row["modified"],
        )

    # -- history (law 4) ---------------------------------------------------

    def _append_history(
        self,
        rec: Record,
        *,
        changed_by: str | None,
        reason: str | None,
    ) -> None:
        version = self.next_version(rec.id)
        self.conn.execute(
            "INSERT INTO history(record_id, version, data, changed_at,"
            " changed_by, reason) VALUES(?,?,?,?,?,?)",
            (rec.id, version, _json(rec.to_dict()), _now(), changed_by, reason),
        )

    def next_version(self, record_id: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM history WHERE record_id = ?",
            (record_id,),
        ).fetchone()
        return int(row["v"]) + 1

    def get_history(self, record_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT version, data, changed_at, changed_by, reason"
            " FROM history WHERE record_id = ? ORDER BY version",
            (record_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append(
                {
                    "version": r["version"],
                    "data": json.loads(r["data"]),
                    "changed_at": r["changed_at"],
                    "changed_by": r["changed_by"],
                    "reason": r["reason"],
                }
            )
        return out

    # -- trash / retract (laws 3 and 4) ------------------------------------

    def trash(
        self, record_id: str, *, reason: str, by: str | None = None
    ) -> Record | None:
        """Move a record to trash. Never deletes (law 3)."""
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.status = TRASH
        return self.update_record(rec, changed_by=by, reason=f"trash: {reason}")

    def retract(
        self, record_id: str, *, reason: str, by: str | None = None
    ) -> Record | None:
        """Retract a record, keeping it and its history (law 4)."""
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.status = RETRACTED
        return self.update_record(rec, changed_by=by, reason=f"retract: {reason}")

    def supersede(
        self, record_id: str, *, reason: str, by: str | None = None
    ) -> Record | None:
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.status = SUPERSEDED
        return self.update_record(rec, changed_by=by, reason=f"supersede: {reason}")

    # -- search ------------------------------------------------------------

    def search_facts(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        """Search the candidate pool (living index).

        Candidates are recallable but always labelled UNVERIFIED — they sit
        below the truth line and can never be quoted as fact.
        """
        parts = [p for p in _FTS_TOKEN_RE.findall(query or "") if p]
        if not parts:
            return []
        sql = "SELECT * FROM facts WHERE status = 'candidate' AND ("
        sql += " OR ".join(["text LIKE ?"] * len(parts))
        sql += ") ORDER BY trust DESC LIMIT ?"
        params: list[Any] = [f"%{p}%" for p in parts] + [limit]
        rows = self.conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def search(self, query: str, *, limit: int = 20) -> list[Record]:
        """Full-text search over non-private, non-trashed records."""
        match = _fts_query(query)
        if not match:
            return []
        rows = self.conn.execute(
            "SELECT r.* FROM records_fts f JOIN records r ON r.id = f.id"
            " WHERE records_fts MATCH ? AND r.never_send = 0"
            " AND r.status != 'trash' ORDER BY rank LIMIT ?",
            (match, limit),
        ).fetchall()
        return [self._row_to_record(r) for r in rows]

    # -- edges -------------------------------------------------------------

    def add_edge(self, src: str, dst: str, label: str) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO edges(src, dst, label) VALUES(?,?,?)",
            (src, dst, label),
        )
        self.conn.commit()

    def edges(self, record_id: str | None = None) -> list[tuple[str, str, str]]:
        if record_id is None:
            rows = self.conn.execute(
                "SELECT src, dst, label FROM edges ORDER BY src, label"
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT src, dst, label FROM edges WHERE src = ? OR dst = ?"
                " ORDER BY label",
                (record_id, record_id),
            ).fetchall()
        return [(r["src"], r["dst"], r["label"]) for r in rows]

    # -- facts (living index) ----------------------------------------------

    def add_fact(self, text: str, *, trust: float = 0.3, source: dict | None = None) -> str:
        fid = idgen.new_id()
        self.conn.execute(
            "INSERT INTO facts(id, text, trust, status, source, created)"
            " VALUES(?,?,?,?,?,?)",
            (fid, text, trust, "candidate", _json(source or {}), _now()),
        )
        self.conn.commit()
        return fid

    def list_facts(self, *, status: str = "candidate", limit: int = 200) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM facts WHERE status = ? ORDER BY trust DESC LIMIT ?",
            (status, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def rebuild_index(self) -> None:
        """Drop and rebuild the disposable index. Never touches the ledger."""
        self.conn.execute("DELETE FROM facts")
        self.conn.execute("DELETE FROM edges")
        self.conn.execute("DELETE FROM records_fts")
        for row in self.conn.execute("SELECT * FROM records").fetchall():
            rec = self._row_to_record(row)
            self.conn.execute(
                "INSERT OR REPLACE INTO records_fts(id, title, body, tags)"
                " VALUES(?,?,?,?)",
                (rec.id, rec.title, rec.body, " ".join(rec.tags)),
            )
        self.conn.commit()

    # -- activity log ------------------------------------------------------

    def log_activity(
        self, action: str, detail: str = "", *, actor: str | None = None
    ) -> None:
        """Append to the activity log (append-only, never delete)."""
        self.conn.execute(
            "INSERT INTO activity(at, actor, action, detail) VALUES(?,?,?,?)",
            (_now(), actor, action, detail),
        )
        self.conn.commit()

    def activity(self, *, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT at, actor, action, detail FROM activity"
            " ORDER BY seq DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # -- stats -------------------------------------------------------------

    def stats(self) -> dict[str, Any]:
        def one(sql: str) -> int:
            return int(self.conn.execute(sql).fetchone()[0])

        return {
            "records": one("SELECT COUNT(*) FROM records"),
            "active": one("SELECT COUNT(*) FROM records WHERE status='active'"),
            "confirmed": one(
                "SELECT COUNT(*) FROM records WHERE trust >= 0.8 AND status='active'"
            ),
            "trash": one("SELECT COUNT(*) FROM records WHERE status='trash'"),
            "retracted": one("SELECT COUNT(*) FROM records WHERE status='retracted'"),
            "facts": one("SELECT COUNT(*) FROM facts"),
            "edges": one("SELECT COUNT(*) FROM edges"),
            "history": one("SELECT COUNT(*) FROM history"),
        }
