"""The intake door (§10) — one contract for every future module.

Video, documents, browser history: whatever arrives, the raw bytes are copied
unchanged into ``01 Inbox`` and fingerprinted. Memory_OB never parses or
rewrites the original — the raw stays raw, and the hash is what makes that
provable later.

The candidate extraction happens separately, from the copy, and lands in the
living index like any other capture.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

INBOX = "01 Inbox"
_DIGEST = hashlib.sha256


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")


def content_hash(data: bytes) -> str:
    return _DIGEST(data).hexdigest()


def intake_bytes(
    data: bytes,
    *,
    vault: Path,
    name: str,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Store *data* unchanged in the inbox and describe it.

    The bytes are written exactly as given. The hash is over those bytes, so
    any later change is detectable.
    """
    if not name:
        name = f"intake-{_now()}.bin"
    inbox = Path(vault) / INBOX
    inbox.mkdir(parents=True, exist_ok=True)

    digest = content_hash(data)
    target = inbox / f"{digest[:12]}-{name}"
    target.write_bytes(data)

    return {
        "path": str(target),
        "name": name,
        "bytes": len(data),
        "sha256": digest,
        "source": source or {},
    }


def intake_file(
    path: Path | str,
    *,
    vault: Path,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Copy a file byte-for-byte into the inbox."""
    src = Path(path)
    if not src.is_file():
        raise FileNotFoundError(src)
    data = src.read_bytes()
    return intake_bytes(
        data,
        vault=vault,
        name=src.name,
        source={"origin_path": str(src), **(source or {})},
    )


def describe(vault: Path) -> list[dict[str, Any]]:
    """List what is sitting in the inbox, with its fingerprint."""
    inbox = Path(vault) / INBOX
    if not inbox.is_dir():
        return []
    out = []
    for path in sorted(inbox.iterdir()):
        if path.is_file():
            data = path.read_bytes()
            out.append(
                {
                    "name": path.name,
                    "bytes": len(data),
                    "sha256": content_hash(data),
                }
            )
    return out
