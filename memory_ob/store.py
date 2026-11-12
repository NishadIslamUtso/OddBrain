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
from typing import Any

from typing_extensions import Self

from . import ids as idgen
from .records import (
    CANDIDATE_MAX,
    CONFIRMED_MIN,
    RETRACTED,
    SUPERSEDED,
    TRASH,
    Record,
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
    modified TEXT NOT NULL,
    valid_from TEXT,
    valid_until TEXT,
    importance INTEGER NOT NULL DEFAULT 0
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
    meta TEXT NOT NULL DEFAULT '{}',
    corroborated INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL DEFAULT '',
    session TEXT NOT NULL DEFAULT '',
    speaker TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    parts TEXT NOT NULL DEFAULT '[]',
    people TEXT NOT NULL DEFAULT '[]',
    topics TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    relation TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    trust REAL NOT NULL DEFAULT 0.5,
    created TEXT NOT NULL,
    modified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL DEFAULT '',
    started TEXT NOT NULL,
    ended TEXT,
    summary TEXT NOT NULL DEFAULT '',
    people TEXT NOT NULL DEFAULT '[]',
    topics TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor TEXT,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    before TEXT NOT NULL DEFAULT '{}',
    after TEXT NOT NULL DEFAULT '{}',
    reason TEXT
);

CREATE TABLE IF NOT EXISTS confirmations (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    question TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    answer TEXT,
    answered_at TEXT,
    created_by TEXT
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


def _search_terms(query: str) -> list[str]:
    """The words of a query, cut back to their stems.

    "allergy" and "allergic" share the stem "allerg", so searching for one
    finds the other. Short words are left alone.
    """
    from .conflicts import stem

    terms: list[str] = []
    for raw in _FTS_TOKEN_RE.findall(query or ""):
        low = raw.lower()
        cut = stem(low) if len(low) > 3 else low
        terms.append(cut or low)
    return terms


def _fts_query(query: str) -> str:
    """Turn arbitrary user text into a safe FTS5 MATCH expression.

    Every token is a prefix query: the owner types "peanut" and should find
    "peanuts", "allergy" should find "allergic". Exact-token matching made the
    vault answer no to the owner's own words, and an empty result reads as
    "the memory is empty" rather than "the search is too strict".
    """
    parts = _search_terms(query)
    if not parts:
        return ""
    return " AND ".join(f'"{p}"*' for p in parts)


def _fts_query_or(query: str) -> str:
    """Same tokens, OR-joined — the fallback for natural-language questions.

    A question like "which theme do I prefer?" shares only one or two tokens
    with a record, so the strict AND form finds nothing. OR keeps the match
    and lets FTS5 rank the records that share more tokens first.
    """
    parts = _search_terms(query)
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
        if "valid_from" not in have:
            self.conn.execute("ALTER TABLE records ADD COLUMN valid_from TEXT")
        if "valid_until" not in have:
            self.conn.execute("ALTER TABLE records ADD COLUMN valid_until TEXT")
        if "importance" not in have:
            self.conn.execute("ALTER TABLE records ADD COLUMN importance INTEGER NOT NULL DEFAULT 0")
        facts_have = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(facts)").fetchall()
        }
        if "demo" not in facts_have:
            self.conn.execute(
                "ALTER TABLE facts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0"
            )
        if "meta" not in facts_have:
            self.conn.execute(
                "ALTER TABLE facts ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"
            )
        if "corroborated" not in facts_have:
            self.conn.execute(
                "ALTER TABLE facts ADD COLUMN corroborated INTEGER NOT NULL DEFAULT 0"
            )
        conv_have = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(conversations)").fetchall()
        }
        if "people" not in conv_have:
            self.conn.execute(
                "ALTER TABLE conversations ADD COLUMN people TEXT NOT NULL DEFAULT '[]'"
            )
        if "topics" not in conv_have:
            self.conn.execute(
                "ALTER TABLE conversations ADD COLUMN topics TEXT NOT NULL DEFAULT '[]'"
            )
        if "processed" not in conv_have:
            # 1 = facts were read from it. Old rows count as read.
            self.conn.execute(
                "ALTER TABLE conversations ADD COLUMN processed INTEGER NOT NULL DEFAULT 1"
            )
        change_have = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(changes)").fetchall()
        }
        if "undone_at" not in change_have:
            self.conn.execute("ALTER TABLE changes ADD COLUMN undone_at TEXT")
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

    def __enter__(self) -> Self:
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
        if not rec.valid_from:
            rec.valid_from = at or _now()
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
                " modified=?, valid_from=?, valid_until=?, importance=? WHERE id=?",
                (
                    rec.kind, rec.subject, rec.speaker, rec.status, rec.trust,
                    rec.title, rec.body, _json(rec.tags), _json(rec.source),
                    rec.event_time, rec.capture_time, rec.confirmed_by,
                    int(rec.never_send), int(rec.demo), _json(rec.links),
                    rec.created, rec.modified, rec.valid_from, rec.valid_until,
                    rec.importance, rec.id,
                ),
            )
        else:
            self.conn.execute(
                "INSERT OR REPLACE INTO records"
                "(id, kind, subject, speaker, status, trust, title, body, tags,"
                " source, event_time, capture_time, confirmed_by, never_send,"
                " demo, links, created, modified, valid_from, valid_until, importance)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    rec.id, rec.kind, rec.subject, rec.speaker, rec.status,
                    rec.trust, rec.title, rec.body, _json(rec.tags),
                    _json(rec.source), rec.event_time, rec.capture_time,
                    rec.confirmed_by, int(rec.never_send), int(rec.demo),
                    _json(rec.links),
                    rec.created, rec.modified, rec.valid_from, rec.valid_until,
                    rec.importance,
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

    def records_valid_at(self, when: str, *, limit: int = 50) -> list[Record]:
        """Records that were true at *when* — the temporal query.

        A record is valid when it had become true by then and had not yet
        stopped. Records without an explicit interval count as always-valid.
        """
        rows = self.conn.execute(
            "SELECT * FROM records WHERE status = 'active' AND never_send = 0"
            " AND demo = 0"
            " AND (valid_from IS NULL OR valid_from <= ?)"
            " AND (valid_until IS NULL OR valid_until > ?)"
            " ORDER BY trust DESC LIMIT ?",
            (when, when, limit),
        ).fetchall()
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
            valid_from=row["valid_from"] if "valid_from" in row.keys() else None,
            valid_until=row["valid_until"] if "valid_until" in row.keys() else None,
            importance=row["importance"] if "importance" in row.keys() else 0,
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
        rec.valid_until = _now()
        return self.update_record(rec, changed_by=by, reason=f"trash: {reason}")

    def retract(
        self, record_id: str, *, reason: str, by: str | None = None
    ) -> Record | None:
        """Retract a record, keeping it and its history (law 4)."""
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.status = RETRACTED
        rec.valid_until = _now()
        return self.update_record(rec, changed_by=by, reason=f"retract: {reason}")

    def supersede(
        self, record_id: str, *, reason: str, by: str | None = None
    ) -> Record | None:
        rec = self.get_record(record_id)
        if rec is None:
            return None
        rec.status = SUPERSEDED
        rec.valid_until = _now()
        return self.update_record(rec, changed_by=by, reason=f"supersede: {reason}")

    # -- search ------------------------------------------------------------

    def search_facts(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        """Search the candidate pool (living index).

        Candidates are recallable but always labelled UNVERIFIED — they sit
        below the truth line and can never be quoted as fact.
        """
        parts = [p for p in _search_terms(query) if p]
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
        semantic: bool = True,
    ) -> list[Record]:
        """Three-leg search: words + meaning + entities.

        Falls back to words + entities when no embeddings are cached or the
        embedding model is unreachable — it never claims to be semantic when
        it is not.
        """
        from .embedder import combined_search

        return combined_search(
            self,
            query,
            limit=limit,
            backend=backend,
            slot=slot,
            semantic=semantic,
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
                # A category is shown as one hub, not as a link between every
                # pair of memories filed in it.
                if tag.startswith("topic/"):
                    continue
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
        meta: dict | None = None,
    ) -> str:
        fid = idgen.new_id()
        self.conn.execute(
            "INSERT INTO facts(id, text, trust, status, source, meta, demo, created)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (fid, text, trust, "candidate", _json(source or {}), _json(meta or {}), int(demo), _now()),
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

    def has_conversation(self, text: str, *, origin: str = "", session: str = "") -> bool:
        """Whether this exact conversation is already saved (so a re-import adds nothing)."""
        row = self.conn.execute(
            "SELECT 1 FROM conversations WHERE origin=? AND session=? AND text=? LIMIT 1",
            (origin, session, text),
        ).fetchone()
        return row is not None

    def add_conversation(
        self,
        text: str,
        *,
        origin: str = "",
        session: str = "",
        speaker: str = "",
        parts: list | None = None,
        people: list | None = None,
        topics: list | None = None,
        processed: bool = True,
    ) -> str:
        """Store a full conversation verbatim. Returns its id.

        ``processed=False`` marks a conversation whose facts have not been read
        yet (no AI helper was available); the nightly run picks it up.
        """
        import json as _json

        from . import ids

        cid = ids.new_id()
        self.conn.execute(
            "INSERT INTO conversations(id, origin, session, speaker, text, parts, people, topics, created, processed) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                cid,
                origin,
                session,
                speaker,
                text,
                _json.dumps(parts or []),
                _json.dumps(people or []),
                _json.dumps(topics or []),
                _now(),
                int(processed),
            ),
        )
        self.conn.commit()
        return cid

    def link_conversation(self, conv_id: str) -> int:
        """Connect a conversation to others sharing people or topics."""
        import json as _json

        row = self.conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
        if row is None:
            return 0
        people = set(_json.loads(row["people"]))
        topics = set(_json.loads(row["topics"]))
        if not (people or topics):
            return 0
        linked = 0
        for other in self.conn.execute(
            "SELECT id, people, topics FROM conversations WHERE id != ?", (conv_id,)
        ).fetchall():
            op = set(_json.loads(other["people"]))
            ot = set(_json.loads(other["topics"]))
            shared = (people & op) | (topics & ot)
            if not shared:
                continue
            self.conn.execute(
                "INSERT OR IGNORE INTO edges(src, dst, label) VALUES(?,?,?)",
                (conv_id, other["id"], "session:related"),
            )
            linked += 1
        if linked:
            self.conn.commit()
            self.log_activity(
                "session-link",
                f"{conv_id} ~ {linked} conversation(s)",
                actor="memory_ob",
            )
        return linked

    def get_conversation(self, conv_id: str) -> dict | None:
        """Read a stored conversation back, verbatim."""
        import json as _json

        row = self.conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "origin": row["origin"],
            "session": row["session"],
            "speaker": row["speaker"],
            "text": row["text"],
            "parts": _json.loads(row["parts"]),
            "people": _json.loads(row["people"] or "[]"),
            "processed": bool(row["processed"]),
            "created": row["created"],
        }

    def list_conversations(self, *, limit: int = 200, offset: int = 0) -> list[dict]:
        """Stored conversations, newest first — the recovery index."""
        rows = self.conn.execute(
            "SELECT id, origin, session, speaker, text, people, processed, created FROM conversations "
            "ORDER BY created DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "origin": r["origin"],
                "session": r["session"],
                "speaker": r["speaker"],
                "text": r["text"],
                "people": json.loads(r["people"] or "[]"),
                "processed": bool(r["processed"]),
                "created": r["created"],
            }
            for r in rows
        ]

    def count_conversations(self) -> int:
        row = self.conn.execute("SELECT COUNT(*) FROM conversations").fetchone()
        return int(row[0]) if row else 0

    # -- people ------------------------------------------------------------

    def upsert_person(
        self,
        name: str,
        *,
        aliases: list[str] | None = None,
        relation: str = "",
        notes: str = "",
        tags: list[str] | None = None,
    ) -> dict:
        """Create or update a person profile. Returns the person."""
        import json as _json

        name = (name or "").strip()
        if not name:
            raise ValueError("a person needs a name")
        row = self.conn.execute(
            "SELECT * FROM people WHERE lower(name) = lower(?)", (name,)
        ).fetchone()
        if row is None:
            # A name the owner has told us is another name for someone.
            found = self.find_person(name)
            if found is not None:
                row = self.conn.execute(
                    "SELECT * FROM people WHERE id = ?", (found["id"],)
                ).fetchone()
        now = _now()
        if row is None:
            pid = idgen.new_id()
            self.conn.execute(
                "INSERT INTO people(id, name, aliases, relation, notes, tags, trust, created, modified) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    pid, name, _json.dumps(aliases or []), relation, notes,
                    _json.dumps(tags or []), 0.5, now, now,
                ),
            )
            self.conn.commit()
            person = self.get_person(pid)
            assert person is not None
            return person
        data = dict(row)
        merged_aliases = set(_json.loads(data["aliases"])) | set(aliases or [])
        merged_aliases.discard(data["name"])
        merged_tags = set(_json.loads(data["tags"])) | set(tags or [])
        self.conn.execute(
            "UPDATE people SET aliases=?, relation=COALESCE(NULLIF(?,''),relation), "
            "notes=COALESCE(NULLIF(?,''),notes), tags=?, modified=? WHERE id=?",
            (
                _json.dumps(sorted(merged_aliases)), relation, notes,
                _json.dumps(sorted(merged_tags)), now, data["id"],
            ),
        )
        self.conn.commit()
        person = self.get_person(data["id"])
        assert person is not None
        return person

    def get_person(self, person_id: str) -> dict | None:
        import json as _json

        row = self.conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "aliases": _json.loads(row["aliases"]),
            "relation": row["relation"],
            "notes": row["notes"],
            "tags": _json.loads(row["tags"]),
            "trust": row["trust"],
            "created": row["created"],
            "modified": row["modified"],
        }

    def list_people(self, *, limit: int = 200) -> list[dict]:
        import json as _json

        rows = self.conn.execute(
            "SELECT * FROM people ORDER BY modified DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "aliases": _json.loads(r["aliases"]),
                "relation": r["relation"],
                "notes": r["notes"],
                "tags": _json.loads(r["tags"]),
                "trust": r["trust"],
                "modified": r["modified"],
            }
            for r in rows
        ]

    def find_person(self, name: str) -> dict | None:
        """A person by name or by any of their other names."""
        wanted = (name or "").strip().lower()
        if not wanted:
            return None
        for person in self.list_people(limit=10000):
            names = [person["name"], *person["aliases"]]
            if wanted in {n.strip().lower() for n in names}:
                return self.get_person(person["id"])
        return None

    def update_person(
        self,
        person_id: str,
        *,
        name: str | None = None,
        aliases: list[str] | None = None,
        relation: str | None = None,
        notes: str | None = None,
    ) -> dict | None:
        """Change a profile's own fields. Only what is given is changed."""
        person = self.get_person(person_id)
        if person is None:
            return None
        new_name = (name if name is not None else person["name"]).strip() or person["name"]
        new_aliases = [a.strip() for a in (aliases if aliases is not None else person["aliases"]) if a.strip()]
        new_aliases = [a for a in dict.fromkeys(new_aliases) if a.lower() != new_name.lower()]
        self.conn.execute(
            "UPDATE people SET name=?, aliases=?, relation=?, notes=?, modified=? WHERE id=?",
            (
                new_name, json.dumps(new_aliases),
                person["relation"] if relation is None else relation,
                person["notes"] if notes is None else notes,
                _now(), person_id,
            ),
        )
        if new_name != person["name"]:
            self._rename_in_conversations(person["name"], new_name)
        self.conn.commit()
        return self.get_person(person_id)

    def _rename_in_conversations(self, old: str, new: str) -> list[str]:
        """Rewrite a person's name in every conversation's people list."""
        changed: list[str] = []
        for row in self.conn.execute("SELECT id, people FROM conversations").fetchall():
            people = json.loads(row["people"] or "[]")
            if old in people:
                updated = list(dict.fromkeys(new if p == old else p for p in people))
                self.conn.execute(
                    "UPDATE conversations SET people = ? WHERE id = ?",
                    (json.dumps(updated), row["id"]),
                )
                changed.append(row["id"])
        return changed

    def merge_people(self, keep_id: str, other_id: str) -> dict | None:
        """Make two profiles one person. The owner's decision, never the AI's.

        The second profile's name and aliases become aliases of the first, its
        notes are appended, and every conversation that named it now names the
        first. Returns what is needed to undo it.
        """
        keep = self.get_person(keep_id)
        other = self.get_person(other_id)
        if keep is None or other is None or keep_id == other_id:
            return None
        aliases = list(dict.fromkeys([*keep["aliases"], other["name"], *other["aliases"]]))
        aliases = [a for a in aliases if a.lower() != keep["name"].lower()]
        notes = keep["notes"]
        if other["notes"] and other["notes"] not in notes:
            notes = (notes + "\n\n" + other["notes"]).strip()
        tags = sorted(set(keep["tags"]) | set(other["tags"]))
        relation = keep["relation"] or other["relation"]
        self.conn.execute(
            "UPDATE people SET aliases=?, notes=?, tags=?, relation=?, modified=? WHERE id=?",
            (json.dumps(aliases), notes, json.dumps(tags), relation, _now(), keep_id),
        )
        touched = self._rename_in_conversations(other["name"], keep["name"])
        for alias in other["aliases"]:
            touched += self._rename_in_conversations(alias, keep["name"])
        self.conn.execute("DELETE FROM people WHERE id = ?", (other_id,))
        self.conn.commit()
        return {
            "keep_before": keep, "other_before": other,
            "keep_after": self.get_person(keep_id),
            "conversations": sorted(set(touched)),
        }

    def delete_person(self, person_id: str) -> dict | None:
        """Remove a profile. Conversations that named them are kept untouched."""
        person = self.get_person(person_id)
        if person is None:
            return None
        self.conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
        self.conn.commit()
        return person

    def restore_person(self, person: dict) -> None:
        """Put back a profile removed by :meth:`delete_person`."""
        if self.get_person(person["id"]) is not None:
            return
        self.conn.execute(
            "INSERT INTO people(id, name, aliases, relation, notes, tags, trust, created, modified) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (person["id"], person["name"], json.dumps(person.get("aliases", [])),
             person.get("relation", ""), person.get("notes", ""), json.dumps(person.get("tags", [])),
             person.get("trust", 0.5), person.get("created") or _now(), _now()),
        )
        self.conn.commit()

    def restore_merged_people(self, info: dict) -> None:
        """Undo :meth:`merge_people` from what it returned."""
        keep, other = info["keep_before"], info["other_before"]
        self.conn.execute(
            "UPDATE people SET aliases=?, notes=?, tags=?, relation=?, modified=? WHERE id=?",
            (json.dumps(keep["aliases"]), keep["notes"], json.dumps(keep["tags"]),
             keep["relation"], _now(), keep["id"]),
        )
        self.conn.execute(
            "INSERT OR REPLACE INTO people(id, name, aliases, relation, notes, tags, trust, created, modified)"
            " VALUES(?,?,?,?,?,?,?,?,?)",
            (other["id"], other["name"], json.dumps(other["aliases"]), other["relation"],
             other["notes"], json.dumps(other["tags"]), other.get("trust", 0.5),
             other.get("created") or _now(), _now()),
        )
        for cid in info.get("conversations", []):
            row = self.conn.execute(
                "SELECT people FROM conversations WHERE id = ?", (cid,)
            ).fetchone()
            if row is None:
                continue
            people = json.loads(row["people"] or "[]")
            if keep["name"] in people and other["name"] not in people:
                people.append(other["name"])
            self.conn.execute(
                "UPDATE conversations SET people = ? WHERE id = ?",
                (json.dumps(people), cid),
            )
        self.conn.commit()

    def person_conversations(self, person: dict) -> list[dict]:
        """Every stored conversation that names this person (or an alias)."""
        names = {person["name"].lower(), *(a.lower() for a in person["aliases"])}
        out = []
        for row in self.conn.execute(
            "SELECT id, origin, people, created, text FROM conversations ORDER BY created DESC"
        ).fetchall():
            people = {p.lower() for p in json.loads(row["people"] or "[]")}
            if people & names:
                out.append({
                    "id": row["id"], "origin": row["origin"], "created": row["created"],
                    "preview": (row["text"] or "")[:160],
                })
        return out

    # -- sessions ----------------------------------------------------------

    def add_session(
        self,
        *,
        origin: str = "",
        started: str = "",
        summary: str = "",
        people: list[str] | None = None,
        topics: list[str] | None = None,
    ) -> str:
        import json as _json

        sid = idgen.new_id()
        now = started or _now()
        self.conn.execute(
            "INSERT INTO sessions(id, origin, started, ended, summary, people, topics, created) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (sid, origin, now, None, summary, _json.dumps(people or []), _json.dumps(topics or []), now),
        )
        self.conn.commit()
        return sid

    def link_session(self, session_id: str, other_id: str, *, label: str = "related") -> None:
        """Connect two sessions that share people or topics."""
        import json as _json

        if session_id == other_id:
            return
        a = self.conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        b = self.conn.execute("SELECT * FROM sessions WHERE id=?", (other_id,)).fetchone()
        if a is None or b is None:
            return
        topics = set(_json.loads(a["topics"])) & set(_json.loads(b["topics"]))
        people = set(_json.loads(a["people"])) & set(_json.loads(b["people"]))
        if not (topics or people):
            return
        why = ",".join(sorted(topics | people))
        self.conn.execute(
            "INSERT OR IGNORE INTO edges(src, dst, label) VALUES(?,?,?)",
            (session_id, other_id, f"session:{label}"),
        )
        self.log_activity(
            "session-link",
            f"{session_id} ~ {other_id} ({why})",
            actor="memory_ob",
        )

    # -- change log (diffs) -------------------------------------------------

    def log_change(
        self,
        *,
        entity: str,
        entity_id: str,
        action: str,
        before: dict | None,
        after: dict | None,
        actor: str = "memory_ob",
        reason: str = "",
    ) -> None:
        import json as _json

        self.conn.execute(
            "INSERT INTO changes(at, actor, entity, entity_id, action, before, after, reason) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (
                _now(), actor, entity, entity_id, action,
                _json.dumps(before or {}), _json.dumps(after or {}), reason,
            ),
        )
        self.conn.commit()

    def list_changes(self, *, limit: int = 100) -> list[dict]:
        import json as _json

        rows = self.conn.execute(
            "SELECT * FROM changes ORDER BY seq DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            {
                "seq": r["seq"],
                "at": r["at"],
                "actor": r["actor"],
                "entity": r["entity"],
                "entity_id": r["entity_id"],
                "action": r["action"],
                "before": _json.loads(r["before"]),
                "after": _json.loads(r["after"]),
                "reason": r["reason"],
                "undone_at": r["undone_at"],
            }
            for r in rows
        ]

    def get_change(self, seq: int) -> dict | None:
        """One logged change by its sequence number."""
        import json as _json

        r = self.conn.execute("SELECT * FROM changes WHERE seq = ?", (seq,)).fetchone()
        if r is None:
            return None
        return {
            "seq": r["seq"], "at": r["at"], "actor": r["actor"],
            "entity": r["entity"], "entity_id": r["entity_id"],
            "action": r["action"], "before": _json.loads(r["before"]),
            "after": _json.loads(r["after"]), "reason": r["reason"],
            "undone_at": r["undone_at"],
        }

    def has_later_change(self, entity_id: str, seq: int) -> bool:
        """True when this thing was changed again after change *seq* (and not undone)."""
        row = self.conn.execute(
            "SELECT 1 FROM changes WHERE entity_id = ? AND seq > ? AND undone_at IS NULL LIMIT 1",
            (entity_id, seq),
        ).fetchone()
        return row is not None

    def mark_change_undone(self, seq: int) -> None:
        self.conn.execute(
            "UPDATE changes SET undone_at = ? WHERE seq = ?", (_now(), seq)
        )
        self.conn.commit()

    # -- conversations waiting to be read ------------------------------------

    def unprocessed_conversations(self, *, limit: int = 50) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id FROM conversations WHERE processed = 0 ORDER BY created LIMIT ?",
            (limit,),
        ).fetchall()
        return [c for c in (self.get_conversation(r["id"]) for r in rows) if c]

    def count_unprocessed_conversations(self) -> int:
        return int(self.conn.execute(
            "SELECT COUNT(*) FROM conversations WHERE processed = 0"
        ).fetchone()[0])

    def mark_conversation_processed(self, conv_id: str) -> None:
        self.conn.execute(
            "UPDATE conversations SET processed = 1 WHERE id = ?", (conv_id,)
        )
        self.conn.commit()

    def set_conversation_people(self, conv_id: str, people: list[str]) -> None:
        self.conn.execute(
            "UPDATE conversations SET people = ? WHERE id = ?",
            (json.dumps(people), conv_id),
        )
        self.conn.commit()

    # -- confirmations (the AI asks, the owner answers) ---------------------

    def ask_confirmation(
        self, *, question: str, context: str = "", created_by: str = "memory_ob"
    ) -> dict:
        """Raise a doubt. The owner answers yes/no; nothing is written until then."""
        from . import ids

        cid = ids.new_id()
        self.conn.execute(
            "INSERT INTO confirmations(id, at, question, context, status, created_by) "
            "VALUES(?,?,?,?,?,?)",
            (cid, _now(), question, context, "pending", created_by),
        )
        self.conn.commit()
        self.log_activity("confirm-ask", question[:120], actor=created_by)
        conf = self.get_confirmation(cid)
        assert conf is not None
        return conf

    def get_confirmation(self, cid: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM confirmations WHERE id = ?", (cid,)
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "at": row["at"],
            "question": row["question"],
            "context": row["context"],
            "status": row["status"],
            "answer": row["answer"],
            "answered_at": row["answered_at"],
            "created_by": row["created_by"],
        }

    def list_confirmations(self, *, status: str = "pending", limit: int = 20) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM confirmations WHERE status = ? ORDER BY at DESC LIMIT ?",
            (status, limit),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "at": r["at"],
                "question": r["question"],
                "context": r["context"],
                "status": r["status"],
                "answer": r["answer"],
                "answered_at": r["answered_at"],
                "created_by": r["created_by"],
            }
            for r in rows
        ]

    def answer_confirmation(
        self, cid: str, *, answer: str, by: str = "owner"
    ) -> dict | None:
        """Record the owner's yes/no. The caller acts on it."""
        conf = self.get_confirmation(cid)
        if conf is None:
            return None
        self.conn.execute(
            "UPDATE confirmations SET status='answered', answer=?, answered_at=? WHERE id=?",
            (answer, _now(), cid),
        )
        self.conn.commit()
        self.log_activity("confirm-answer", f"{cid}: {answer}", actor=by)
        return self.get_confirmation(cid)

    def set_fact_status(self, fact_id: str, status: str) -> None:
        """Move a fact out of the candidate pool.

        ``promoted`` means the owner signed it into a record; ``rejected`` means
        they said it is not true. Both keep the text — nothing is deleted.
        """
        self.conn.execute("UPDATE facts SET status = ? WHERE id = ?", (status, fact_id))
        self.conn.commit()

    def corroborate(self, *, limit: int = 500) -> int:
        """Mark facts that recur across distinct days.

        A fact the owner says once may be noise; the same thing on three
        different days is a pattern. Those get a corroborated count and rise.
        Returns how many facts were corroborated.
        """
        import re as _re

        def norm(text: str) -> str:
            return " ".join(sorted(set(_re.findall(r"[a-z0-9]+", (text or "").lower()))))

        rows = self.conn.execute(
            "SELECT id, text, source, corroborated FROM facts "
            "WHERE status = 'candidate' ORDER BY trust DESC LIMIT ?",
            (limit,),
        ).fetchall()
        groups: dict[str, list] = {}
        for r in rows:
            key = norm(r["text"])
            if len(key) > 8:
                groups.setdefault(key, []).append(r)
        count = 0
        for key, items in groups.items():
            if len(items) < 2:
                continue
            days = {
                str(it["source"].get("session", ""))[:1]
                for it in items
                if isinstance(it["source"], dict)
            }
            if len(days) < 2 and len(items) < 3:
                continue
            for it in items:
                self.conn.execute(
                    "UPDATE facts SET corroborated = corroborated + 1 WHERE id = ?",
                    (it["id"],),
                )
                count += 1
        if count:
            self.conn.commit()
            self.log_activity("corroborate", f"{count} fact(s) repeated", actor="memory_ob")
        return count

    def dismiss_facts(self, *, origin: str | None = None, status: str = "rejected") -> int:
        """Bulk-move candidate facts out of the pool.

        Returns how many were moved. Nothing is deleted — the text is kept.
        """
        if origin:
            rows = self.conn.execute(
                "SELECT id FROM facts WHERE status = 'candidate' AND json_extract(source, '$.origin') = ?",
                (origin,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT id FROM facts WHERE status = 'candidate'"
            ).fetchall()
        ids = [r[0] for r in rows]
        if ids:
            placeholders = ",".join("?" * len(ids))
            self.conn.execute(
                f"UPDATE facts SET status = ? WHERE id IN ({placeholders})",
                [status, *ids],
            )
            self.conn.commit()
        return len(ids)

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
