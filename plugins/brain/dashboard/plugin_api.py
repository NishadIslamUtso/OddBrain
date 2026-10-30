"""Brain vault — plugin API, mounted at /api/plugins/brain/.

Reads and writes the Memory_OB vault folder.
The vault folder is the single source of truth.
Everything starts as raw unconfirmed evidence. Nothing is confirmed without user approval.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# ---------------------------------------------------------------------------
# Brain path contract
# ---------------------------------------------------------------------------
BRAIN_PATH = Path(r"C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB")
INDEX_PATH = BRAIN_PATH / ".brain" / "index.json"
PROPOSALS_DIR = BRAIN_PATH / "06 Review" / "proposals"

_VAULT_EXTS = {".md", ".txt", ".json"}
_SKIP_PREFIXES = {".brain", ".git", "__pycache__"}

# Simple file-list cache to avoid a full rglob on every request.
# The vault is write-light, read-heavy; a 5-second TTL is plenty.
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


def _parse_frontmatter(text: str) -> dict[str, Any]:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}
    block = m.group(1)
    result: dict[str, Any] = {}
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if not key:
            continue
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1]
            items = [v.strip().strip("\"'") for v in inner.split(",") if v.strip()]
            result[key] = items
        elif val.lower() in {"true", "yes"}:
            result[key] = True
        elif val.lower() in {"false", "no"}:
            result[key] = False
        else:
            try:
                result[key] = int(val)
            except ValueError:
                try:
                    result[key] = float(val)
                except ValueError:
                    result[key] = val.strip("\"'")
    return result


def _record_kind(path: Path) -> str:
    parts = [p for p in path.relative_to(BRAIN_PATH).parts if p]
    if not parts:
        return "root"
    folder = parts[0]
    label = re.sub(r"^\d+\s*", "", folder).strip()
    return label.lower().replace(" ", "-") if label else folder


def _record_id(rel_path: Path) -> str:
    return str(rel_path).replace("\\", "/")


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def _load_index() -> dict[str, Any]:
    if INDEX_PATH.exists():
        try:
            return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"version": 1, "brain_path": str(BRAIN_PATH), "next_id": 1, "last_scan": None, "total_records": 0}


def _save_index(idx: dict[str, Any]) -> None:
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(idx, indent=2), encoding="utf-8")


def _next_id() -> int:
    idx = _load_index()
    nid = int(idx.get("next_id", 1))
    idx["next_id"] = nid + 1
    idx["last_scan"] = _now_iso()
    _save_index(idx)
    return nid


def _load_record(path: Path) -> dict[str, Any]:
    rel = path.relative_to(BRAIN_PATH)
    raw = path.read_text(encoding="utf-8-sig", errors="replace")
    fm = _parse_frontmatter(raw)
    body_start = raw.find("\n---\n")
    body = raw[body_start + 4 :] if body_start != -1 else raw
    body = body.strip()
    title_line = ""
    for line in body.splitlines():
        stripped = line.strip()
        if stripped:
            title_line = stripped.lstrip("#").strip()
            break
    return {
        "id": _record_id(rel),
        "path": str(rel),
        "kind": fm.get("type", _record_kind(path)),
        "status": fm.get("status", "unconfirmed"),
        "title": fm.get("title", title_line),
        "body": body,
        "body_preview": body[:300] + ("…" if len(body) > 300 else ""),
        "tags": fm.get("tags", []),
        "created": fm.get("created", ""),
        "modified": fm.get("modified", ""),
        "size_bytes": path.stat().st_size,
    }


def _iter_vault_files() -> list[Path]:
    """Deprecated: use _get_cached_vault_files(). Kept for compatibility."""
    _invalidate_vault_cache()
    return _get_cached_vault_files()


def _safe_path(rel: str) -> Path:
    safe = (BRAIN_PATH / rel).resolve()
    safe.relative_to(BRAIN_PATH.resolve())
    return safe


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
    nid = _next_id()
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-") or "memory"
    filename = f"{nid:04d}-{slug}.md"
    now = _now_iso()
    fm_lines = [
        "---",
        f"type: proposal",
        f"status: pending",
        f"title: {title}",
        f"created: {now}",
        f"modified: {now}",
        f"proposal_id: {nid:04d}",
        f"destination: {destination}",
    ]
    if tags:
        fm_lines.append(f"tags: [{', '.join(str(t) for t in tags)}]")
    if source:
        fm_lines.append(f"source: {source}")
    fm_lines.append("---")
    body_parts = []
    if quote:
        body_parts.append(f"> {quote}\n")
    body_parts.append(body.strip())
    content = "\n".join(fm_lines) + "\n\n" + "\n".join(body_parts) + "\n"
    full_path = BRAIN_PATH / "06 Review" / "proposals" / filename
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")
    _invalidate_vault_cache()
    rec = _load_record(full_path)
    rec["destination"] = destination
    rec["proposal_id"] = f"{nid:04d}"
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
def approve_proposal(pid: str) -> dict[str, Any]:
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
    dest_dir = BRAIN_PATH / dest_folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / src.name
    raw = src.read_text(encoding="utf-8-sig", errors="replace")
    raw = _set_frontmatter_status(raw, "confirmed")
    raw = _set_frontmatter_modified(raw)
    dest_path.write_text(raw, encoding="utf-8")
    src.unlink()
    _invalidate_vault_cache()
    return {"ok": True, "proposal_id": pid, "moved_to": str(dest_path.relative_to(BRAIN_PATH)),
            "status": "confirmed"}


@router.post("/proposals/{pid}/deny")
def deny_proposal(pid: str, payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
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
    dest_path = archive_dir / src.name
    raw = src.read_text(encoding="utf-8-sig", errors="replace")
    raw = _set_frontmatter_status(raw, "denied")
    raw = _set_frontmatter_modified(raw)
    raw = raw.rstrip() + reason
    dest_path.write_text(raw, encoding="utf-8")
    src.unlink()
    _invalidate_vault_cache()
    return {"ok": True, "proposal_id": pid, "moved_to": str(dest_path.relative_to(BRAIN_PATH)),
            "status": "denied"}


@router.post("/proposals/{pid}/modify")
def modify_proposal(pid: str, payload: dict[str, Any]) -> dict[str, Any]:
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
def create_record(payload: dict[str, Any]) -> dict[str, Any]:
    """Create a vault record directly. Used by the agent for working notes,
    session captures, and intake — where user confirmation per-item is not needed."""
    kind = payload.get("kind", "memory")
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body required")
    folder_map = {
        "memory": "03 Memory",
        "journal": "08 Journal",
        "working-note": "04 Working Memory",
        "knowledge": "05 Knowledge",
        "source": "02 Sources",
        "review": "06 Review",
        "people": "10 People",
        "system": "00 System",
        "inbox": "01 Inbox",
        "activity": "09 Activity & Undo",
        "sharing-receipt": "07 Sharing Receipts",
    }
    dest_folder = payload.get("folder") or folder_map.get(kind, "03 Memory")
    filename = payload.get("filename")
    if not filename:
        nid = _next_id()
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-") or kind
        filename = f"{nid:04d}-{slug}.md"
    dest_dir = BRAIN_PATH / dest_folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    rec = _write_record(
        dest_path,
        kind=kind,
        title=title or dest_path.stem,
        body=body,
        status=payload.get("status", "confirmed"),
        tags=payload.get("tags", []),
        source=payload.get("source", "agent"),
    )
    rec["destination"] = str(dest_path.relative_to(BRAIN_PATH))
    return rec
