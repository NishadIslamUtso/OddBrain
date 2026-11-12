"""One-time upgrades, run the first time the app opens a vault.

* An old numbered-folder vault is moved to the Obsidian layout (a verified
  backup is written first; if it cannot be verified, nothing moves).
* Questions left pending by the old, review-everything version are retired.
  Only the genuine "your answer changed" questions are kept.
* A vault with memories but no notes gets its notes written.

Every step is safe to run again and does nothing the second time.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

from .config import Settings
from .store import Store

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_done: set[str] = set()

STATE_FILE = ".brain/state.json"
_RETIRED_NOTE = "retired when Memory_OB started filing memories by itself"


def _state(vault: Path) -> dict[str, Any]:
    try:
        data = json.loads((vault / STATE_FILE).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_state(vault: Path, data: dict[str, Any]) -> None:
    p = vault / STATE_FILE
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def retire_old_cards(store: Store) -> int:
    """Close pending questions the old version left that are not real conflicts."""
    from .review import CardStore

    CardStore(store)  # makes sure the questions table exists on a brand-new vault
    rows = store.conn.execute(
        "SELECT id FROM cards WHERE status = 'pending' AND type IN ('ask','merge','proposal')"
    ).fetchall()
    for row in rows:
        store.conn.execute(
            "UPDATE cards SET status='resolved', resolution='dismiss', resolved_by='memory_ob', note=? WHERE id=?",
            (_RETIRED_NOTE, row["id"]),
        )
    store.conn.commit()
    return len(rows)


def prepare(settings: Settings) -> dict[str, Any]:
    """Make the vault ready for the current version. Idempotent and cached per process."""
    key = str(Path(settings.vault).resolve())
    if key in _done:
        return {}
    with _lock:
        if key in _done:
            return {}
        report: dict[str, Any] = {}
        settings.ensure_dirs()
        vault = Path(settings.vault)
        from . import vault as vault_mod

        with Store(settings.db) as st:
            if vault_mod.is_legacy(vault):
                try:
                    st.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                except Exception:  # noqa: BLE001
                    pass
                report["layout"] = vault_mod.migrate_legacy(st, vault)
            state = _state(vault)
            if not state.get("cards_retired"):
                report["retired_cards"] = retire_old_cards(st)
                state["cards_retired"] = True
                _save_state(vault, state)
            vault_mod.ensure_layout(vault)
            if not (vault / vault_mod.INDEX_FILE).is_file() and st.stats()["records"]:
                report["notes"] = vault_mod.rebuild(st, vault)
        _done.add(key)
        if report:
            logger.info("Memory_OB upgrade: %s", report)
        return report
