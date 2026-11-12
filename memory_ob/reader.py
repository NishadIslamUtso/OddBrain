"""The background reader: the AI reading what is waiting.

Conversations that arrive while no AI helper is running (or that were imported
in bulk) are kept exactly as they came and read later. This module reads them
one at a time in the background, so the screens never freeze, and keeps a
small progress count the Settings and Review screens can show.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

from . import manager
from .config import Settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_state: dict[str, Any] = {"running": False, "read": 0, "error": ""}


def progress() -> dict[str, Any]:
    """A snapshot of the reader's progress (safe to call from any thread)."""
    return dict(_state)


def _run(settings: Settings) -> None:
    from . import models
    from .models import ModelConfig
    from .settings import load
    from .store import Store

    try:
        cfg = ModelConfig.load(settings.models_path)
        guardrails = list(load(settings.vault).guardrails or [])
        with Store(settings.db) as st:
            while True:
                call = models.helper(cfg, "extract")
                if call is None:
                    _state["error"] = "no AI helper"
                    break
                out = manager.process_waiting(
                    st, model_call=call, vault=settings.vault, guardrails=guardrails, limit=5,
                )
                if out.read == 0:
                    break
                _state["read"] += out.read
                _state["error"] = ""
            try:
                manager.suggest_same_person(st)
            except Exception:  # noqa: BLE001
                logger.warning("same-person check failed", exc_info=True)
    except Exception as exc:  # noqa: BLE001 - a background job must never take the app down
        logger.warning("reader stopped", exc_info=True)
        _state["error"] = str(exc)
    finally:
        _state["running"] = False


def kick(settings: Settings) -> bool:
    """Start reading what is waiting, if nothing is already reading. True if started."""
    with _lock:
        if _state["running"]:
            return False
        _state["running"] = True
        _state["read"] = 0
        thread = threading.Thread(target=_run, args=(settings,), name="memory-ob-reader", daemon=True)
        thread.start()
        return True
