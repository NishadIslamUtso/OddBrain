"""
Brain vault — plugin API, mounted at /api/plugins/brain/.

Reads and writes the Memory_OB vault folder.
The vault folder is the single source of truth.
Everything starts as raw unconfirmed evidence. Nothing is confirmed without user approval.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from config import (
    ALLOWED_FOLDERS,
    BRAIN_PATH,
    BRAIN_TOKEN,
    CACHE_TTL_SECS,
    SAFE_NAME_RE,
    SKIP_PREFIXES,
    TIMEZONE_OFFSET,
    VAULT_EXTS,
)

# Compile safe name regex from config string
_SAFE_NAME_RE = re.compile(SAFE_NAME_RE)

router = APIRouter()

# ---------------------------------------------------------------------------
# Brain path contract (single source of truth in config.py)
# ---------------------------------------------------------------------------
INDEX_PATH = BRAIN_PATH / ".brain" / "index.json"
PROPOSALS_DIR = BRAIN_PATH / "06 Review" / "proposals"

# ---------------------------------------------------------------------------
# Token auth (simple shared secret)
# ---------------------------------------------------------------------------
_BRAIN_TOKEN = BRAIN_TOKEN

def _check_token(request_token: Optional[str]) -> None:
    if request_token != _BRAIN_TOKEN:
        raise HTTPException(status_code=401, detail="invalid token")

# ---------------------------------------------------------------------------
# File-list cache
# ---------------------------------------------------------------------------
_CACHE_TTL_SECS = 5
_vault_cache: list[Path] = []
_vault_cache_at: float = 0.0
_vault_cache_dirty: bool = True


def _invalidate_vault_cache() -> None:
    global _vault_cache_dirty
    _vault_cache_dirty = True


def _get_cached_vault_files() -> list[Path]:
    global _vault_cache, _vault_cache_at, _vault_cache_dirty
    now = time.time()
    if not _vault_cache_dirty and _vault_cache_at > 0 and (now - _vault_cache_at) < _CACHE_TTL_SECS:
        return _vault_cache
    if not BRAIN_PATH.is_dir():
        _vault_cache = []
    else:
        _vault_cache = []
        for entry in sorted(BRAIN_PATH.rglob("*")):
            if not entry.is_file():
                continue
            if entry.suffix.lower() not in _VAULT_EXTS:
                continue
            if any(part.startswith(".") or part in _SKIP_PREFIXES for part in entry.relative_to(BRAIN_PATH).parts):
                continue
            _vault_cache.append(entry)
    _vault_cache_at = now
    _vault_cache_dirty = False
    return _vault_cache


_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)

# ---------------------------------------------------------------------------
# Hazard scanner
# ---------------------------------------------------------------------------
_HAZARD_PATTERNS = [
    re.compile(r"[\u200B-\u200D\u2060-\u206F]"),
    re.compile(r"(?i)ignore\s+all\s+previous\s+instructions"),
    re.compile(r"(?i)you\s+are\s+now\s+(in|operating in)\s+(a\s+)?new"),
    re.compile(r"(?i)developer\s+mode|debug\s+mode"),
    re.compile(r"(?i)execute\s+arbitrary\s+code|run\s+any\s+command"),
    re.compile(r"(?i)forget\s+(all|everything|your|previous)"),
    re.compile(r"(?i)act\s+as\s+(if|though)\s+you\s+are"),
    re.compile(r"(?i)do\s+not\s+follow\s+(your|the)\s+(previous|above|prior)"),
    re.compile(r"(?i)this\s+is\s+(a\s+)?(test|hypothetical|fictional)"),
]

_OMIT_MSG = "[OMITTED — potential instruction hazard detected by Brain scan]"

# ---------------------------------------------------------------------------
# Conflict scanner — contradictions and repetitions
# ---------------------------------------------------------------------------

_CONTRADICTION_PATTERNS = [
    (re.compile(r"(?i)\b(always|never|every|all|none)\b"), re.compile(r"(?i)\b(sometimes|rarely|occasionally|may|might|can)\b")),
    (re.compile(r"(?i)\b(prefer|like|love|enjoy)\b"), re.compile(r"(?i)\b(dislike|hate|avoid|detest)\b")),
    (re.compile(r"(?i)\b(always use|always do)\b"), re.compile(r"(?i)\b(never use|never do|don'?t use|don'?t do)\b")),
]


def _scan_conflicts(new_text: str, existing_texts: list[str]) -> list[dict[str, Any]]:
    """Scan for contradictions between new text and existing records."""
    conflicts = []
    for existing in existing_texts[:20]:  # limit to recent 20 for perf
        existing_lower = existing.lower()
        new_lower = new_text.lower()
        # Check for direct overlap
        words_new = set(re.findall(r"[a-z]{4,}", new_lower))
        words_old = set(re.findall(r"[a-z]{4,}", existing_lower))
        overlap = words_new & words_old
        if len(overlap) < 3:
            continue
        for pos_pat, neg_pat in _CONTRADICTION_PATTERNS:
            if (pos_pat.search(new_text) and neg_pat.search(existing)) or                (pos_pat.search(existing) and neg_pat.search(new_text)):
                conflicts.append({
                    "type": "contradiction",
                    "existing_excerpt": existing[:200],
                    "new_excerpt": new_text[:200],
                    "overlap_words": list(overlap)[:10],
                })
                break
    return conflicts


def _get_recent_records(limit: int = 20) -> list[str]:
    """Get recent record bodies for conflict scanning."""
    files = _get_cached_vault_files()
    bodies = []
    for f in files[-limit:]:
        try:
            rec = _load_record(f)
            bodies.append(rec.get("body", ""))
        except Exception:
            pass
    return bodies




def _scan_hazards(text: str) -> tuple[str, list[str]]:
    """Scan text for instruction-like hazards. Returns (cleaned_text, list_of_warnings)."""
    warnings = []
    lines = text.splitlines(keepends=True)
    cleaned = []
    for i, line in enumerate(lines, 1):
        skip = False
        for pat in _HAZARD_PATTERNS:
            if pat.search(line):
                warnings.append(f"line {i}: hazard pattern matched")
                skip = True
                break
        if skip:
            cleaned.append(f"> {_OMIT_MSG}\n")
        else:
            cleaned.append(line)
    return "".join(cleaned), warnings


def _next_id() -> str:
    """Collision-proof ID: timestamp + random suffix."""
    import secrets
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    rand = secrets.token_hex(3)
    return f"{ts}-{rand}"

# ---------------------------------------------------------------------------
# Path validation
# ---------------------------------------------------------------------------
def _safe_path(rel: str) -> Path:
    safe = (BRAIN_PATH / rel).resolve()
    safe.relative_to(BRAIN_PATH.resolve())
    folder = safe.parent.name
    allowed_lower = {f.lower(): f for f in ALLOWED_FOLDERS}
    if folder not in ALLOWED_FOLDERS and folder.lower() not in allowed_lower:
        raise HTTPException(status_code=400, detail=f"folder {folder!r} not allowed")
    if not _SAFE_NAME_RE.match(safe.name):
        raise HTTPException(status_code=400, detail="unsafe filename")
    return safe


def _now_iso() -> str:
    """Return current time in ISO-8601 with explicit Asia/Dhaka (+06:00) timezone."""
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=6))).strftime("%Y-%m-%dT%H:%M:%S+06:00")

def _write_record(path: Path, kind: str, title: str, body: str, status: str = "unconfirmed",
                  tags: Optional[list[str]] = None, source: Optional[str] = None) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    now = _now_iso()
    fm = {
        "type": kind,
        "status": status,
        "title": title,
        "created": now,
        "modified": now,
    }
    if tags:
        fm["tags"] = tags
    if source:
        fm["source"] = source
    fm_lines = ["---"]
    for k, v in fm.items():
        if isinstance(v, list):
            fm_lines.append(f"{k}: [{', '.join(str(x) for x in v)}]")
        elif isinstance(v, bool):
            fm_lines.append(f"{k}: {'true' if v else 'false'}")
        else:
            fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")
    content = "\n".join(fm_lines) + "\n\n" + body.strip() + "\n"
    path.write_text(content, encoding="utf-8")
    _invalidate_vault_cache()
    return _load_record(path)


def _set_frontmatter_status(raw: str, status: str) -> str:
    return re.sub(r"(^status:\s*)(\S+)", f"\1{status}", raw, count=1, flags=re.M)


def _set_frontmatter_modified(raw: str) -> str:
    now = _now_iso()
    return re.sub(r"(^modified:\s*)(.*)", f"\1{now}", raw, count=1, flags=re.M)


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------
def _append_activity(action: str, detail: str) -> None:
    """Append an entry to the activity log (append-only, never delete)."""
    activity_dir = BRAIN_PATH / "09 Activity & Undo"
    activity_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = "- [{}] {}: {}\n".format(ts, action, detail)
    log_file = activity_dir / f"{datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')}.md"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry)


def _invalidate_vault_cache() -> None:
    global _vault_cache_dirty
    _vault_cache_dirty = True


# ---------------------------------------------------------------------------
# READ routes
# ---------------------------------------------------------------------------

@router.get("/records")
def list_records(
    kind: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    files = _get_cached_vault_files()
    records: list[dict[str, Any]] = []
    for f in files:
        try:
            rec = _load_record(f)
        except Exception:
            continue
        if kind and rec.get("kind") != kind:
            continue
        if status and rec.get("status") != status:
            continue
        if q:
            haystack = f"{rec.get('title','')} {rec.get('body','')}".lower()
            if q.lower() not in haystack:
                continue
        records.append(rec)
    total = len(records)
    return {"total": total, "limit": limit, "offset": offset,
            "brain_path": str(BRAIN_PATH), "records": records[offset:offset + limit]}


@router.get("/records/{path:path}")
def get_record(path: str) -> dict[str, Any]:
    safe_path = _safe_path(path)
    if not safe_path.is_file():
        raise HTTPException(status_code=404, detail="record not found")
    try:
        return _load_record(safe_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict[str, Any]:
    files = _get_cached_vault_files()
    return {
        "ok": BRAIN_PATH.is_dir(),
        "brain_path": str(BRAIN_PATH),
        "record_count": len(files),
        "kinds": sorted({_record_kind(f) for f in files}),
    }


# ---------------------------------------------------------------------------
# PROPOSAL routes — nothing is confirmed without user approval
# ---------------------------------------------------------------------------

@router.post("/propose")
def propose_memory(payload: dict[str, Any]) -> dict[str, Any]:
    """Create a new memory proposal. Starts as 'pending' — nothing is confirmed
    until the user approves it in the Review screen."""
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    if not title and not body:
        raise HTTPException(status_code=400, detail="title or body required")
    kind = payload.get("kind", "memory")
    destination = payload.get("destination", "03 Memory")
    tags = payload.get("tags", [])
    source = payload.get("source", "")
    quote = payload.get("quote", "")
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    body_clean, warnings = _scan_hazards(body)
    if warnings:
        body_clean = body_clean + "\n\n[Brain hazard scan: " + ", ".join(warnings) + "]" + "\n"
    existing = _get_recent_records()
    conflicts = _scan_conflicts(body, existing)
    # Quote hash verification: store hash of quoted text if present
    quote_hash = None
    if quote:
        quote_hash = hashlib.sha256(quote.encode("utf-8")).hexdigest()[:16]
    nid = _next_id()
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-") or "memory"
    filename = f"{nid}-{slug}.md"
    now = _now_iso()
    fm_lines = [
        "---",
        f"type: proposal",
        f"status: pending",
        f"title: {title}",
        f"created: {now}",
        f"modified: {now}",
        f"proposal_id: {nid}",
        f"destination: {destination}",
    ]
    if tags:
        fm_lines.append(f"tags: [{', '.join(str(t) for t in tags)}]")
    if source:
        fm_lines.append(f"source: {source}")
    if quote_hash:
        fm_lines.append(f"quote_hash: {quote_hash}")
    fm_lines.append("---")
    body_parts = []
    if quote:
        body_parts.append(f"> {quote}\n")
    body_parts.append(body_clean)
    content = "\n".join(fm_lines) + "\n\n" + "\n".join(body_parts) + "\n"
    full_path = BRAIN_PATH / "06 Review" / "proposals" / filename
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")
    _invalidate_vault_cache()
    rec = _load_record(full_path)
    rec["destination"] = destination
    rec["proposal_id"] = nid
    rec["conflicts"] = conflicts
    if quote_hash:
        rec["quote_hash"] = quote_hash
    return rec


@router.get("/proposals")
def list_proposals(
    status: Optional[str] = Query(None),
    destination: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    if not PROPOSALS_DIR.is_dir():
        return {"total": 0, "limit": limit, "offset": offset, "proposals": []}
    proposals: list[dict[str, Any]] = []
    for f in sorted(PROPOSALS_DIR.glob("*.md")):
        try:
            rec = _load_record(f)
        except Exception:
            continue
        if status and rec.get("status") != status:
            continue
        if destination and rec.get("destination") != destination:
            continue
        proposals.append(rec)
    total = len(proposals)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "proposals": proposals[offset:offset + limit],
    }


@router.get("/proposals/{pid}")
def get_proposal(pid: str) -> dict[str, Any]:
    if not PROPOSALS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="no proposals")
    for f in PROPOSALS_DIR.glob("*.md"):
        try:
            rec = _load_record(f)
        except Exception:
            continue
        if rec.get("proposal_id") == pid or rec.get("id") == pid:
            return rec
    raise HTTPException(status_code=404, detail="proposal not found")


@router.post("/proposals/{pid}/approve")
def approve_proposal(pid: str, token: Optional[str] = Query(None)) -> dict[str, Any]:
    _check_token(token)
    if not PROPOSALS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="no proposals")
    src = None
    rec = None
    for f in PROPOSALS_DIR.glob("*.md"):
        try:
            r = _load_record(f)
        except Exception:
            continue
        if r.get("proposal_id") == pid or r.get("id") == pid:
            src = f
            rec = r
            break
    if src is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    dest_folder = rec.get("destination", "03 Memory")
    dest_dir = _safe_path(dest_folder)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = _safe_path(str(dest_dir.relative_to(BRAIN_PATH)) + "/" + src.name)
    raw = src.read_text(encoding="utf-8-sig", errors="replace")
    raw = _set_frontmatter_status(raw, "confirmed")
    raw = _set_frontmatter_modified(raw)
    dest_path.write_text(raw, encoding="utf-8")
    src.unlink()
    _invalidate_vault_cache()
    _append_activity("approve", f"Proposal {pid} approved -> {dest_path.relative_to(BRAIN_PATH)}")
    return {"ok": True, "proposal_id": pid, "moved_to": str(dest_path.relative_to(BRAIN_PATH)),
            "status": "confirmed"}


@router.post("/proposals/{pid}/deny")
def deny_proposal(pid: str, payload: Optional[dict[str, Any]] = None, token: Optional[str] = Query(None)) -> dict[str, Any]:
    _check_token(token)
    if not PROPOSALS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="no proposals")
    src = None
    rec = None
    for f in PROPOSALS_DIR.glob("*.md"):
        try:
            r = _load_record(f)
        except Exception:
            continue
        if r.get("proposal_id") == pid or r.get("id") == pid:
            src = f
            rec = r
            break
    if src is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    reason = ""
    if payload and payload.get("reason"):
        reason = f"\n\n> **Deny reason:** {payload['reason']}\n"
    archive_dir = BRAIN_PATH / "90 Archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    dest_path = _safe_path(str(archive_dir.relative_to(BRAIN_PATH)) + "/" + src.name)
    raw = src.read_text(encoding="utf-8-sig", errors="replace")
    raw = _set_frontmatter_status(raw, "denied")
    raw = _set_frontmatter_modified(raw)
    raw = raw.rstrip() + reason
    dest_path.write_text(raw, encoding="utf-8")
    src.unlink()
    _invalidate_vault_cache()
    _append_activity("deny", f"Proposal {pid} denied -> {dest_path.relative_to(BRAIN_PATH)}")
    return {"ok": True, "proposal_id": pid, "moved_to": str(dest_path.relative_to(BRAIN_PATH)),
            "status": "denied"}


@router.post("/proposals/{pid}/modify")
def modify_proposal(pid: str, payload: dict[str, Any], token: Optional[str] = Query(None)) -> dict[str, Any]:
    _check_token(token)
    if not PROPOSALS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="no proposals")
    src = None
    for f in PROPOSALS_DIR.glob("*.md"):
        try:
            r = _load_record(f)
        except Exception:
            continue
        if r.get("proposal_id") == pid or r.get("id") == pid:
            src = f
            break
    if src is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    raw = src.read_text(encoding="utf-8-sig", errors="replace")
    if payload.get("title"):
        raw = re.sub(r"(^title:\s*)(.*)", f"\1{payload['title']}", raw, count=1, flags=re.M)
    if payload.get("destination"):
        raw = re.sub(r"(^destination:\s*)(.*)", f"\1{payload['destination']}", raw, count=1, flags=re.M)
    raw = _set_frontmatter_modified(raw)
    if payload.get("body"):
        parts = raw.split("\n---\n", 2)
        if len(parts) == 3:
            raw = parts[0] + "\n---\n" + parts[1] + "\n---\n" + payload["body"].strip() + "\n"
        else:
            raw = raw.rstrip() + "\n" + payload["body"].strip() + "\n"
    src.write_text(raw, encoding="utf-8")
    _invalidate_vault_cache()
    return _load_record(src)


# ---------------------------------------------------------------------------
# WRITE routes (agent-side, no user confirmation needed)
# ---------------------------------------------------------------------------

@router.post("/records")
def create_record(payload: dict[str, Any], token: Optional[str] = Query(None)) -> dict[str, Any]:
    """Create a vault record directly. Used by the agent for working notes,
    session captures, and intake — where user confirmation per-item is not needed.
    Only scratch kinds are allowed; memory MUST go through propose."""
    _check_token(token)
    kind = payload.get("kind", "memory")
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body required")
    folder_map = {
        "memory": "03 Memory",
        "journal": "08 Journal",
        "working-memory": "04 Working Memory",
        "knowledge": "05 Knowledge",
        "source": "02 Sources",
        "review": "06 Review",
        "people": "10 People",
        "system": "00 System",
        "inbox": "01 Inbox",
        "activity": "09 Activity & Undo",
        "sharing-receipt": "07 Sharing Receipts",
    }
    allowed_direct = {"working-memory", "journal", "system", "inbox", "sources", "activity", "sharing-receipts", "archive", "review"}
    if kind == "memory" or kind not in allowed_direct:
        raise HTTPException(status_code=403, detail=f"kind={kind!r} requires proposal flow; use POST /propose instead")
    dest_folder = payload.get("folder") or folder_map.get(kind, "03 Memory")
    filename = payload.get("filename")
    if not filename:
        nid = _next_id()
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-") or kind
        filename = f"{nid}-{slug}.md"
    dest_dir = _safe_path(dest_folder)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    body_clean, _ = _scan_hazards(body)
    status = payload.get("status", "raw-unconfirmed-evidence")
    rec = _write_record(
        dest_path,
        kind=kind,
        title=title or dest_path.stem,
        body=body_clean,
        status=status,
        tags=payload.get("tags", []),
        source=payload.get("source", "agent"),
    )
    rec["destination"] = str(dest_path.relative_to(BRAIN_PATH))
    return rec

# ---------------------------------------------------------------------------
# Compression checkpoint — capture before Hermes compresses session
# ---------------------------------------------------------------------------

@router.post("/capture")
def capture_session(payload: dict[str, Any], token: Optional[str] = Query(None)) -> dict[str, Any]:
    """Save a pre-compression checkpoint. Called by Hermes before it compresses
    a session, so nothing is lost."""
    _check_token(token)
    title = (payload.get("title") or "Session capture").strip()
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body required")
    destination = payload.get("destination", "03 Memory")
    dest_dir = _safe_path(destination)
    dest_dir.mkdir(parents=True, exist_ok=True)
    nid = _next_id()
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-") or "capture"
    filename = f"{nid}-capture-{slug}.md"
    dest_path = dest_dir / filename
    rec = _write_record(
        dest_path,
        kind="memory",
        title=title,
        body=body,
        status="raw-unconfirmed-evidence",
        source="pre-compression-capture",
    )
    _append_activity("capture", f"Pre-compression checkpoint saved -> {dest_path.relative_to(BRAIN_PATH)}")
    rec["destination"] = str(dest_path.relative_to(BRAIN_PATH))
    return rec

# ---------------------------------------------------------------------------
# Connection graph — record relationships
# ---------------------------------------------------------------------------

@router.get("/graph")
def connection_graph(limit: int = Query(100, ge=1, le=1000)) -> dict[str, Any]:
    """Return a simple connection graph: nodes (records) and edges (shared tags/mentions)."""
    files = _get_cached_vault_files()
    nodes = []
    tag_index: dict[str, list[str]] = {}
    for f in files[:limit]:
        try:
            rec = _load_record(f)
        except Exception:
            continue
        rid = rec.get("id")
        nodes.append({"id": rid, "title": rec.get("title"), "kind": rec.get("kind"),
                      "status": rec.get("status"), "path": rec.get("path")})
        for tag in rec.get("tags", []):
            tag_index.setdefault(tag, []).append(rid)
    edges = []
    seen_edges = set()
    for tag, rids in tag_index.items():
        for i in range(len(rids)):
            for j in range(i + 1, len(rids)):
                edge = (rids[i], rids[j], tag)
                if edge not in seen_edges:
                    seen_edges.add(edge)
                    edges.append({"source": rids[i], "target": rids[j], "label": tag})
    return {"nodes": nodes, "edges": edges}

# ---------------------------------------------------------------------------
# Semantic search — basic TF-IDF keyword search
# ---------------------------------------------------------------------------

@router.get("/search")
def semantic_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    """Search vault records by keyword relevance."""
    import math
    files = _get_cached_vault_files()
    query_terms = set(re.findall(r"[a-z]{3,}", q.lower()))
    if not query_terms:
        return {"query": q, "results": []}

    results = []
    for f in files:
        try:
            rec = _load_record(f)
        except Exception:
            continue
        text = f"{rec.get('title', '')} {rec.get('body', '')}".lower()
        doc_terms = set(re.findall(r"[a-z]{3,}", text))
        overlap = query_terms & doc_terms
        if not overlap:
            continue
        score = len(overlap) / len(query_terms)
        results.append({
            "id": rec.get("id"),
            "title": rec.get("title"),
            "path": rec.get("path"),
            "score": round(score, 3),
            "preview": rec.get("body_preview", "")[:200],
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": q, "results": results[:limit]}


# ---------------------------------------------------------------------------
# Checksummed manifest — vault integrity
# ---------------------------------------------------------------------------

@router.get("/manifest")
def vault_manifest() -> dict[str, Any]:
    """Return a checksummed manifest of all vault files for integrity checking."""
    files = _get_cached_vault_files()
    entries = []
    for f in files:
        try:
            raw = f.read_bytes()
            checksum = hashlib.sha256(raw).hexdigest()[:16]
            rel = str(f.relative_to(BRAIN_PATH))
            entries.append({
                "path": rel,
                "size": f.stat().st_size,
                "checksum": checksum,
                "modified": datetime.datetime.fromtimestamp(f.stat().st_mount_time).isoformat(),
            })
        except Exception:
            pass
    return {
        "brain_path": str(BRAIN_PATH),
        "total_files": len(entries),
        "generated_at": _now_iso(),
        "files": entries,
    }

