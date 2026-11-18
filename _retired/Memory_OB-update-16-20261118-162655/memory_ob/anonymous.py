"""Anonymous mode (§7).

A session toggle with two guarantees:

* **no recall is injected** — the model answers without the owner's memory;
* **nothing is captured** — the turn is not written into the attic as
  personal memory.

The flag lives in the vault's private ``.brain/`` directory: outside git,
outside the export, and gone when the vault is. Turning it off restores
normal behaviour immediately.

The AI may *offer* anonymous mode; only the owner's command turns it on.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_FLAG = "anonymous"


def flag_path(vault: Path) -> Path:
    return Path(vault) / ".brain" / _FLAG


def is_anonymous(vault: Path) -> bool:
    """True while anonymous mode is on."""
    try:
        return flag_path(vault).read_text(encoding="utf-8").strip() == "on"
    except OSError:
        return False


def set_anonymous(vault: Path, on: bool) -> bool:
    """Turn anonymous mode on or off. Returns the new state."""
    path = flag_path(vault)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("on" if on else "off", encoding="utf-8")
    logger.info("anonymous mode %s", "on" if on else "off")
    return on


def toggle(vault: Path) -> bool:
    """Flip the flag and return the new state."""
    return set_anonymous(vault, not is_anonymous(vault))


def describe(vault: Path) -> str:
    return (
        "Anonymous mode is ON — no recall is injected and nothing is captured."
        if is_anonymous(vault)
        else "Anonymous mode is off — memory works normally."
    )
