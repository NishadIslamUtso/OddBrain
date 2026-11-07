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
    CANDIDATE_MAX,
    CONFIRMED_MIN,
    RETRACTED,
    SUPERSEDED,
    TRASH,
    Record,
    is_confirmed,
    sign_truth,
)

# The typed edges an owner may curate between records (§6). ``shares_tag``
# is the machine's disposable layer and is never owner-selectable.
GRAPH_LABELS: frozenset[str] = frozenset(
    {"supports", "contradicts", "supersedes", "cites", "related"}
)
AUTO_EDGE_LABEL = "shares_tag"

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
    demo INTEGER NOT NULL DEFAULT 0,
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
    demo INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS embeddings (
    record_id TEXT PRIMARY KEY,
    vec BLOB NOT NULL,
    dims INTEGER NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    id UNINDEXED,
    title,
    body,
    tags,
    tokenize='porter'
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
    """Turn arbitrary user text into a safe FTS5 MATCH expression.

    Every token is a prefix query: the owner types "peanut" and should find
    "peanuts", "allergy" should find "allergic". Exact-token matching made the
    vault answer no to the owner's own words, and an empty result reads as
    "the memory is empty" rather than "the search is too strict".
    """
    parts = _FTS_TOKEN_RE.findall(query or "")
    if not parts:
        return ""
    return " AND ".join(f'"{p}"*' for p in parts)


def _fts_query_or(query: str) -> str:
    """Same tokens, OR-joined — the fallback for natural-language questions.

    A question like "which theme do I prefer?" shares only one or two tokens
    with a record, so the strict AND form finds nothing. OR keeps the match
    and lets FTS5 rank the records that share more tokens first.
    """
    parts = _FTS_TOKEN_RE.findall(query or "")
    if not parts:
        return ""
    return " OR ".join(f'"{p}"*' for p in parts)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


class Store:
    """The Memory_OB store."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Each request opens its own Store and uses it start to finish, so the
        # connection is never shared between requests. But FastAPI closes a
        # generator dependency in a *different* worker thread than the one that
        # ran __enter__, so close() would otherwise raise "SQLite objects
        # created in a thread can only be used in that same thread" — which is
        # what 500s a page load under any concurrency.
        self.conn = sqlite3.connect(
            str(self.path), timeout=10.0, check_same_thread=False
        )
        self.conn.row_factory = sqlite3.Row
        try:
            # Several connections may be open at once (a request store beside
            # the caller's). WAL lets readers and a writer coexist;
            # busy_timeout covers the rest.
            self.conn.execute("PRAGMA journal_mode = WAL")
            self.conn.execute("PRAGMA busy_timeout = 10000")
            self.conn.executescript(_SCHEMA)
            self._migrate()
        except Exception:
            # If initialisation fails the connection would otherwise outlive
            # the object and be closed by the garbage collector — a leak that
            # shows up as a ResourceWarning and holds the file open.
            self.conn.close()
            raise
        self._meta_setdefault("schema_version", str(SCHEMA_VERSION))
        self._meta_setdefault("created_at", _now())

    def _migrate(self) -> None:
        """Add columns that older databases predate.

        ``CREATE TABLE IF NOT EXISTS`` cannot change an existing table, so
        each new column gets a guarded ``ALTER TABLE``. The vault is the
        owner's; a failed migration must never lose it.
        """
        have = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(records)").fetchall()
        }
        if "demo" not in have:
            self.conn.execute(
                "ALTER TABLE records ADD COLUMN demo INTEGER NOT NULL DEFAULT 0"
            )
        facts_have = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(facts)").fetchall()
        }
        if "demo" not in facts_have:
            self.conn.execute(
                "ALTER TABLE facts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0"
            )
        self._migrate_fts_tokenizer()
        self.conn.commit()

    def _migrate_fts_tokenizer(self) -> None:
        """Rebuild the search index when its tokenizer is out of date.

        ``CREATE VIRTUAL TABLE IF NOT EXISTS`` cannot change a tokenizer, so
        a database indexed before stemming existed would keep answering "no"
        to "allergy" for a record titled "allergic". The index is disposable —
        it is rebuilt from the ledger, never the other way round.
        """
        row = self.conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'records_fts'"
        ).fetchone()
        if row is None:
            return
        ddl = str(row[0] or "").lower()
        if "porter" in ddl:
            return
        self.conn.execute("DROP TABLE records_fts")
        self.conn.execute(
            "CREATE VIRTUAL TABLE records_fts USING fts5("
            "id UNINDEXED, title, body, tags, tokenize='porter')"
        )
        for rec_row in self.conn.execute("SELECT * FROM records").fetchall():
            rec = self._row_to_record(rec_row)
            self.conn.execute(
                "INSERT OR REPLACE INTO records_fts(id, title, body, tags)"
                " VALUES(?,?,?,?)",
                (rec.id, rec.title, rec.body, " ".join(rec.tags)),
            )

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
        """Write a record through the ordinary path.

        This path can NEVER create truth: the claimed signature is stripped
        and the trust is pulled back below the line, so a caller cannot mint
        truth by putting ``confirmed_by`` and a high score in a payload.
        Use :meth:`sign_record` — the Review panel's path — for that.
        """
        rec.confirmed_by = None
        if rec.trust >= CONFIRMED_MIN:
            rec.trust = CANDIDATE_MAX
        return self._persist(rec, changed_by=changed_by, reason="create")

    def update_record(
        self, rec: Record, changed_by: str | None = None, reason: str | None = None
    ) -> Record:
        """Update a record through the ordinary path (never creates truth)."""
        rec.confirmed_by = None
        if rec.trust >= CONFIRMED_MIN:
            rec.trust = CANDIDATE_MAX
        return self._persist(rec, changed_by=changed_by, reason=reason or "update")

    def set_never_send(
        self,
        record_id: str,
        *,
        value: bool,
        changed_by: str | None = None,
        reason: str = "owner decision",
    ) -> Record | None:
        """Change only the neverSend flag, leaving truth untouched.

        The ordinary paths (add_record/update_record) deliberately strip the
        signature and pull trust below the line, so a caller cannot mint
        truth. Going through one of them to flip a single flag would therefore
        silently demote a confirmed memory to a candidate — which is exactly
        what the "allow sharing" button did. This writes the one column and
        nothing else.
        """
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.never_send = bool(value)
        rec.modified = _now()
        self.conn.execute(
            "UPDATE records SET never_send=?, modified=? WHERE id=?",
            (int(rec.never_send), rec.modified, record_id),
        )
        self._append_history(rec, changed_by=changed_by, reason=reason)
        self.conn.commit()
        return rec

    def sign_record(
        self,
        rec: Record,
        *,
        card_id: str,
        at: str | None = None,
        changed_by: str | None = None,
        reason: str | None = None,
    ) -> Record:
        """The Review panel's write: sign truth, then persist.

        This is the only method that may leave ``confirmed_by`` set, and it
        stamps the card and the time itself — a caller cannot supply them.
        """
        sign_truth(rec, card_id=card_id, at=at)
        return self._persist(
            rec, changed_by=changed_by, reason=reason or f"card:{card_id}"
        )

    def _persist(
        self,
        rec: Record,
        *,
        changed_by: str | None,
        reason: str,
    ) -> Record:
        now = _now()
        if not rec.created:
            rec.created = now
        rec.modified = now
        exists = self.conn.execute(
            "SELECT 1 FROM records WHERE id = ?", (rec.id,)
        ).fetchone()
        if exists:
            self.conn.execute(
                "UPDATE records SET kind=?, subject=?, speaker=?, status=?, trust=?,"
                " title=?, body=?, tags=?, source=?, event_time=?, capture_time=?,"
                " confirmed_by=?, never_send=?, demo=?, links=?, created=?,"
                " modified=? WHERE id=?",
                (
                    rec.kind, rec.subject, rec.speaker, rec.status, rec.trust,
                    rec.title, rec.body, _json(rec.tags), _json(rec.source),
                    rec.event_time, rec.capture_time, rec.confirmed_by,
                    int(rec.never_send), int(rec.demo), _json(rec.links),
                    rec.created, rec.modified, rec.id,
                ),
            )
        else:
            self.conn.execute(
                "INSERT OR REPLACE INTO records"
                "(id, kind, subject, speaker, status, trust, title, body, tags,"
                " source, event_time, capture_time, confirmed_by, never_send,"
                " demo, links, created, modified)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    rec.id, rec.kind, rec.subject, rec.speaker, rec.status,
                    rec.trust, rec.title, rec.body, _json(rec.tags),
                    _json(rec.source), rec.event_time, rec.capture_time,
                    rec.confirmed_by, int(rec.never_send), int(rec.demo),
                    _json(rec.links),
                    rec.created, rec.modified,
                ),
            )
        self.conn.execute(
            "INSERT OR REPLACE INTO records_fts(id, title, body, tags)"
            " VALUES(?,?,?,?)",
            (rec.id, rec.title, rec.body, " ".join(rec.tags)),
        )
        self._append_history(rec, changed_by=changed_by, reason=reason)
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
        include_demo: bool = False,
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
        # §15 rule 7: shipped sample records are quarantined by default.
        if not include_demo:
            sql += " AND demo = 0"
        sql += " ORDER BY created DESC LIMIT ?"
        params.append(limit)
        rows = self.conn.execute(sql, params).fetchall()
        return [self._row_to_record(r) for r in rows]

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
            demo=bool(row["demo"]),
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
        sql = "SELECT * FROM facts WHERE status = 'candidate' AND demo = 0 AND ("
        sql += " OR ".join(["text LIKE ?"] * len(parts))
        sql += ") ORDER BY trust DESC LIMIT ?"
        params: list[Any] = [f"%{p}%" for p in parts] + [limit]
        rows = self.conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def search_all(
        self,
        query: str,
        *,
        limit: int = 20,
        backend: Any = None,
        slot: Any = None,
        rerank_call: Any = None,
    ) -> list[Record]:
        """Three-leg search: words + meaning + entities.

        Falls back to words + entities when no embeddings are cached or the
        embedding model is unreachable — it never claims to be semantic when
        it is not. An optional rerank model may reorder the result.
        """
        from .embedder import combined_search

        return combined_search(
            self,
            query,
            limit=limit,
            backend=backend,
            slot=slot,
            rerank_call=rerank_call,
        )

    def search(self, query: str, *, limit: int = 20) -> list[Record]:
        """Full-text search over non-private, non-trashed records.

        Tries every token (AND) first, then relaxes to any token (OR) so a
        natural question still reaches a record it only partly overlaps.
        """
        match = _fts_query(query)
        if not match:
            return []
        rows = self._search_rows(match, limit)
        if not rows:
            relaxed = _fts_query_or(query)
            if relaxed and relaxed != match:
                rows = self._search_rows(relaxed, limit)
        return [self._row_to_record(r) for r in rows]

    def _search_rows(self, match: str, limit: int) -> list[Any]:
        return self.conn.execute(
            "SELECT r.* FROM records_fts f JOIN records r ON r.id = f.id"
            " WHERE records_fts MATCH ? AND r.never_send = 0 AND r.demo = 0"
            " AND r.status != 'trash' ORDER BY rank LIMIT ?",
            (match, limit),
        ).fetchall()

    # -- edges -------------------------------------------------------------

    def add_edge(self, src: str, dst: str, label: str) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO edges(src, dst, label) VALUES(?,?,?)",
            (src, dst, label),
        )
        self.conn.commit()

    # -- graph -------------------------------------------------------------

    def rebuild_shared_edges(self) -> int:
        """Regenerate the shared-tag edges from the current records.

        These are LIVING-layer connections (§1): disposable, delete-and-
        rebuild any time. Owner-curated links are never touched here.
        """
        self.conn.execute("DELETE FROM edges WHERE label = 'shares_tag'")
        by_tag: dict[str, list[str]] = {}
        for r in self.list_records(include_private=False, limit=10000):
            for tag in set(r.tags):
                by_tag.setdefault(tag, []).append(r.id)
        n = 0
        for ids in by_tag.values():
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    self.add_edge(ids[i], ids[j], "shares_tag")
                    n += 1
        return n

    def link(self, src: str, dst: str, label: str, *, by: str = "owner") -> None:
        """Store an owner-curated link between two records.

        The owner's word outranks the machine's: any previous curated edge
        between the pair is replaced, and ``shares_tag`` edges are left
        alone so the automatic layer stays rebuildable.
        """
        self.conn.execute(
            "DELETE FROM edges WHERE src = ? AND dst = ? AND label != 'shares_tag'",
            (src, dst),
        )
        self.add_edge(src, dst, label)
        self.log_activity(
            "link", f"{src} --{label}--> {dst}", actor=by
        )

    def unlink(self, src: str, dst: str, *, by: str = "owner") -> None:
        """Remove the curated link between two records (shared-tag kept)."""
        self.conn.execute(
            "DELETE FROM edges WHERE src = ? AND dst = ? AND label != 'shares_tag'",
            (src, dst),
        )
        self.conn.commit()
        self.log_activity("unlink", f"{src} -/-> {dst}", actor=by)

    def graph(self, *, record_id: str | None = None) -> dict[str, Any]:
        """Nodes and typed edges for the Graph screen.

        Nodes carry enough to filter by person, tag, kind and trust (§6).
        """
        edges = self.edges(record_id)
        wanted = set()
        for s, d, _ in edges:
            wanted.add(s)
            wanted.add(d)
        if record_id:
            wanted.add(record_id)
        nodes = [
            r.to_dict()
            for r in self.list_records(include_private=False, limit=10000)
            if r.id in wanted
        ]
        return {
            "nodes": nodes,
            "edges": [
                {"src": s, "dst": d, "label": l} for s, d, l in edges
            ],
            "count": len(edges),
        }

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

    def add_fact(
        self,
        text: str,
        *,
        trust: float = 0.3,
        source: dict | None = None,
        demo: bool = False,
    ) -> str:
        fid = idgen.new_id()
        self.conn.execute(
            "INSERT INTO facts(id, text, trust, status, source, demo, created)"
            " VALUES(?,?,?,?,?,?,?)",
            (fid, text, trust, "candidate", _json(source or {}), int(demo), _now()),
        )
        self.conn.commit()
        return fid

    def list_facts(
        self, *, status: str = "candidate", limit: int = 200, offset: int = 0
    ) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM facts WHERE status = ? ORDER BY trust DESC"
            " LIMIT ? OFFSET ?",
            (status, limit, offset),
        ).fetchall()
        return [self._fact_dict(r) for r in rows]

    def count_facts(self, *, status: str = "candidate") -> int:
        """How many candidate facts exist in total.

        The list is capped, the total is not: a screen showing only the list
        would otherwise report the cap as if it were the truth.
        """
        row = self.conn.execute(
            "SELECT COUNT(*) FROM facts WHERE status = ?", (status,)
        ).fetchone()
        return int(row[0]) if row else 0

    def get_fact(self, fact_id: str) -> dict | None:
        """One candidate fact, or None."""
        row = self.conn.execute("SELECT * FROM facts WHERE id = ?", (fact_id,)).fetchone()
        return self._fact_dict(row) if row is not None else None

    def set_fact_status(self, fact_id: str, status: str) -> None:
        """Move a fact out of the candidate pool.

        ``promoted`` means the owner signed it into a record; ``rejected`` means
        they said it is not true. Both keep the text — nothing is deleted.
        """
        self.conn.execute("UPDATE facts SET status = ? WHERE id = ?", (status, fact_id))
        self.conn.commit()

    @staticmethod
    def _fact_dict(row) -> dict:
        out = dict(row)
        out["source"] = json.loads(out.get("source") or "{}")
        return out

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

    # -- embeddings (the meaning leg of search) ----------------------------

    def set_embedding(
        self, record_id: str, vec: list[float], *, model: str = ""
    ) -> None:
        import struct

        self.conn.execute(
            "INSERT OR REPLACE INTO embeddings(record_id, vec, dims, model, created)"
            " VALUES(?,?,?,?,?)",
            (
                record_id,
                struct.pack(f"<{len(vec)}f", *vec),
                len(vec),
                model,
                _now(),
            ),
        )
        self.conn.commit()

    def get_embedding(self, record_id: str) -> list[float] | None:
        import struct

        row = self.conn.execute(
            "SELECT vec FROM embeddings WHERE record_id = ?", (record_id,)
        ).fetchone()
        if not row:
            return None
        blob = row["vec"]
        return list(struct.unpack(f"<{len(blob) // 4}f", blob))

    def embedding_ids(self) -> list[str]:
        rows = self.conn.execute("SELECT record_id FROM embeddings").fetchall()
        return [r["record_id"] for r in rows]

    def missing_embeddings(self, *, limit: int = 500) -> list[str]:
        rows = self.conn.execute(
            "SELECT id FROM records WHERE never_send = 0 AND status != 'trash'"
            " AND id NOT IN (SELECT record_id FROM embeddings) LIMIT ?",
            (limit,),
        ).fetchall()
        return [r["id"] for r in rows]

    def count_embeddings(self) -> int:
        return int(self.conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0])

    def drop_embeddings(self) -> None:
        self.conn.execute("DELETE FROM embeddings")
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

        # neverSend records are excluded from every count: a total that
        # included them would leak how many the owner has (law 2).
        not_private = "never_send = 0"
        not_demo = "demo = 0"
        return {
            "records": one(f"SELECT COUNT(*) FROM records WHERE {not_private} AND {not_demo}"),
            "active": one(
                f"SELECT COUNT(*) FROM records WHERE status='active' AND {not_private} AND {not_demo}"
            ),
            "confirmed": one(
                "SELECT COUNT(*) FROM records WHERE trust >= 0.8 AND status='active' "
                f"AND {not_private} AND {not_demo}"
            ),
            "trash": one(
                f"SELECT COUNT(*) FROM records WHERE status='trash' AND {not_private} AND {not_demo}"
            ),
            "retracted": one(
                f"SELECT COUNT(*) FROM records WHERE status='retracted' AND {not_private} AND {not_demo}"
            ),
            "facts": one("SELECT COUNT(*) FROM facts WHERE demo = 0"),
            "edges": one("SELECT COUNT(*) FROM edges"),
            "history": one("SELECT COUNT(*) FROM history"),
        }
