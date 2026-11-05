"""Safe path handling.

Every path that touches the vault goes through :func:`safe_path`. It rejects
traversal, absolute escapes, and anything that resolves outside the base.
Vault folder names contain spaces and ``&`` (``09 Activity & Undo``), so paths
are handled as strings until resolved.
"""

from __future__ import annotations

from pathlib import Path


class UnsafePath(ValueError):
    """Raised when a path escapes the allowed base."""


def safe_path(base: str | Path, rel: str | Path) -> Path:
    """Resolve *rel* under *base*, refusing anything that escapes.

    Raises :class:`UnsafePath` for traversal, absolute paths that point
    outside *base*, and non-path junk.
    """
    base_p = Path(base).expanduser().resolve()
    rel_s = str(rel).strip()
    if not rel_s:
        raise UnsafePath("empty path")
    rel_p = Path(rel_s)
    if rel_p.is_absolute():
        raise UnsafePath(f"absolute path not allowed: {rel_s}")
    target = (base_p / rel_p).resolve()
    try:
        target.relative_to(base_p)
    except ValueError as exc:
        raise UnsafePath(f"path escapes base: {rel_s}") from exc
    return target


def is_within(base: str | Path, candidate: str | Path) -> bool:
    """True when *candidate* resolves inside *base*."""
    try:
        safe_path(base, candidate)
    except UnsafePath:
        return False
    return True
