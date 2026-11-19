"""Write-route authentication (§10, §15 rule 5).

The engine is local, but "local" is not "open". Every write route demands a
token that:

* is **generated at install**, never committed — no default anywhere;
* lives **outside git**, in the vault's private ``.brain`` directory;
* is **sent by the pages** — the backend injects it into the markup and the
  UI echoes it back on every write, so the screens authenticate by shape,
  not by a hand-typed curl header.

Read routes stay open: the owner browses freely, and recall has nothing to
do with writes.
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger(__name__)

TOKEN_HEADER = "x-memory-ob-token"
TOKEN_QUERY = "token"
_TOKEN_BYTES = 32


class TokenError(PermissionError):
    """Raised when a write arrives without a valid token."""


def generate_token() -> str:
    """A fresh random token."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def load_or_create(path: Path) -> str:
    """Read the token at *path*, creating it when absent.

    Creating on demand keeps the standalone engine usable; the install script
    calls this too, so the token exists before the first page load.
    """
    try:
        existing = path.read_text(encoding="utf-8").strip()
    except OSError:
        existing = ""
    if existing:
        return existing
    token = generate_token()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass  # Windows has no POSIX mode bits; the ACL is what matters
    logger.info("generated a new Memory_OB write token at %s", path)
    return token


def verify(path: Path, presented: str | None) -> bool:
    """True when *presented* matches the stored token."""
    if not presented:
        return False
    try:
        expected = path.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    if not expected:
        return False
    return secrets.compare_digest(expected, presented)
