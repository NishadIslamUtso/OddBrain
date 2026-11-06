"""Checksummed vault manifest (§10 integrity).

Every file in the vault gets a fingerprint. The manifest is what makes a
silent edit detectable: a record whose bytes no longer match its hash was
changed outside Memory_OB, and law 1 says evidence may never quote a
changed source.

The manifest covers the *export* (the markdown the owner can read). The
SQLite ledger has its own history table; the two are checked separately.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MANIFEST_NAME = "MANIFEST.json"
# The vault's private settings (token, anonymous flag, model config) are not
# part of the human-readable export and must never be fingerprinted.
PRIVATE_DIR = ".brain"
_DIGEST = hashlib.sha256


def file_hash(path: Path) -> str:
    """The sha256 of a file's exact bytes."""
    h = _DIGEST()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(vault: Path) -> dict[str, str]:
    """Fingerprint every file in the vault, relative paths as keys."""
    vault = Path(vault)
    out: dict[str, str] = {}
    if not vault.is_dir():
        return out
    for path in sorted(vault.rglob("*")):
        if not path.is_file() or path.name == MANIFEST_NAME:
            continue
        rel = path.relative_to(vault).as_posix()
        if rel.split("/", 1)[0] == PRIVATE_DIR:
            continue
        try:
            out[rel] = file_hash(path)
        except OSError:
            continue
    return out


def manifest_path(vault: Path) -> Path:
    return Path(vault) / MANIFEST_NAME


def write_manifest(vault: Path) -> dict[str, Any]:
    """Write (or refresh) the manifest. Returns a small report."""
    vault = Path(vault)
    vault.mkdir(parents=True, exist_ok=True)
    files = build_manifest(vault)
    path = manifest_path(vault)
    payload = {
        "version": 1,
        "count": len(files),
        "files": files,
    }
    existed = path.exists()
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return {"count": len(files), "path": str(path), "already_existed": existed}


def verify_manifest(vault: Path) -> dict[str, Any]:
    """Check every manifest entry against the file on disk.

    A missing file, an extra file, or a changed hash is reported — never
    silently absorbed.
    """
    vault = Path(vault)
    path = manifest_path(vault)
    if not path.exists():
        return {"ok": False, "reason": "no manifest", "changed": [], "missing": [], "extra": []}
    try:
        recorded = json.loads(path.read_text(encoding="utf-8")).get("files", {})
    except (OSError, ValueError):
        return {"ok": False, "reason": "unreadable manifest", "changed": [], "missing": [], "extra": []}

    current = build_manifest(vault)
    changed = [
        rel for rel, digest in recorded.items()
        if rel in current and current[rel] != digest
    ]
    missing = [rel for rel in recorded if rel not in current]
    extra = [rel for rel in current if rel not in recorded]
    return {
        "ok": not (changed or missing or extra),
        "changed": sorted(changed),
        "missing": sorted(missing),
        "extra": sorted(extra),
        "checked": len(recorded),
    }


def verify_file(vault: Path, rel: str) -> bool:
    """True when one file still matches its manifest hash."""
    vault = Path(vault)
    path = manifest_path(vault)
    if not path.exists():
        return False
    try:
        recorded = json.loads(path.read_text(encoding="utf-8")).get("files", {})
    except (OSError, ValueError):
        return False
    target = vault / rel
    if not target.is_file():
        return False
    return recorded.get(rel) == file_hash(target)
