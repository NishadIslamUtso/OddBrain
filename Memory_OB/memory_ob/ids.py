"""Collision-proof record identifiers.

IDs must be unique, URL-safe (they ride in URLs for approve/deny), and
unguessable. Format: ``<hex-ms-timestamp>-<8 hex random>``.
"""

from __future__ import annotations

import secrets
import time

_ALPHABET = "0123456789abcdef"


def new_id() -> str:
    """Return a new collision-proof, URL-safe record id."""
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"{ts:x}-{rand}"


def is_valid_id(value: str) -> bool:
    """True when *value* has the canonical id shape."""
    if not isinstance(value, str):
        return False
    parts = value.split("-")
    if len(parts) != 2:
        return False
    ts, rand = parts
    if not ts or not rand:
        return False
    return all(c in _ALPHABET for c in ts) and all(c in _ALPHABET for c in rand)
