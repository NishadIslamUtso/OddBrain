"""The background reader: the AI reading what is waiting.

Conversations that arrive while no AI helper is running (or that were imported
in bulk) are kept exactly as they came and read later. This module reads them
one at a time in the background, so the screens never freeze, and keeps a live
account of what it is doing, so the owner can tell "reading" from "stuck":

* which message it is on, out of how many, and a preview of it;
* how many times the AI helper has answered, and how long ago the last answer was;
* how long it has been waiting on the current answer (and a plain warning when that is long);
* what the AI decided about each thing it read (kept, already known, left out, and why);
* a Stop button (``stop``), and a hard time limit on every single AI call.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Callable

from . import manager
from .config import Settings

logger = logging.getLogger(__name__)

STUCK_AFTER = 45        # seconds waiting on one answer before the screen says it looks stuck
CALL_LIMIT = 150        # seconds. One AI call is given up after this, whatever the network does
EVENTS_KEPT = 40        # the activity list is short on purpose: it is a window, not a log
EVENTS_SHOWN = 14

_lock = threading.Lock()
_state: dict[str, Any] = {}
_events: deque[dict[str, Any]] = deque(maxlen=EVENTS_KEPT)


def _fresh() -> dict[str, Any]:
    return {
        "running": False, "read": 0, "error": "", "total": 0, "left": 0,
        "current": "", "current_id": "", "calls": 0, "last_answer": 0.0, "asking_since": 0.0,
        "started": 0.0, "stopping": False, "stopped": False, "failed": 0, "detail": "", "part": 0, "parts": 0,
    }


_state.update(_fresh())


class Stopped(Exception):
    """The owner pressed Stop."""


def progress() -> dict[str, Any]:
    """A snapshot of the reader's progress (safe to call from any thread)."""
    now = time.time()
    s = dict(_state)
    running = bool(s["running"])
    asking = int(now - s["asking_since"]) if running and s["asking_since"] else 0
    s["asking_for"] = asking
    s["stuck"] = asking >= STUCK_AFTER
    s["last_answer_ago"] = int(now - s["last_answer"]) if s["last_answer"] else None
    s["elapsed"] = int(now - s["started"]) if running and s["started"] else 0
    for private in ("asking_since", "last_answer", "started"):
        s.pop(private, None)
    s["events"] = list(_events)[:EVENTS_SHOWN]
    return s


def events() -> list[dict[str, Any]]:
    """What the AI helper did most recently, newest first."""
    return list(_events)


def _note(kind: str, **data: Any) -> None:
    _events.appendleft({"at": time.time(), "kind": kind, **data})


def stop() -> bool:
    """Ask the reader to stop after the message it is on. True when something was running."""
    with _lock:
        if not _state["running"]:
            return False
        _state["stopping"] = True
        return True


def watched(call: Callable[[str], str]) -> Callable[[str], str]:
    """The AI helper's call, counted, timed, and given up after :data:`CALL_LIMIT` seconds.

    The network layer already times out on a silent server, but a server that trickles bytes
    can hold one call for much longer. The call runs on its own thread; if it has not answered
    in time the reader stops waiting for it and treats it as "did not answer".
    """

    def run(prompt: str) -> str:
        if _state["stopping"]:
            raise Stopped("stopped")
        box: dict[str, Any] = {}

        def go() -> None:
            try:
                box["answer"] = call(prompt)
            except BaseException as exc:  # noqa: BLE001 - handed back to the caller below
                box["error"] = exc

        _state["asking_since"] = time.time()
        worker = threading.Thread(target=go, name="memory-ob-ai-call", daemon=True)
        worker.start()
        worker.join(CALL_LIMIT)
        _state["asking_since"] = 0.0
        if worker.is_alive():
            raise TimeoutError(f"The AI helper did not answer within {CALL_LIMIT} seconds.")
        if "error" in box:
            raise box["error"]
        _state["calls"] += 1
        _state["last_answer"] = time.time()
        return box["answer"]

    return run


def _run(settings: Settings) -> None:
    from . import models
    from .models import ModelConfig
    from .settings import load
    from .store import Store

    try:
        cfg = ModelConfig.load(settings.models_path)
        guardrails = list(load(settings.vault).guardrails or [])
        with Store(settings.db) as st:
            _state["total"] = _state["left"] = st.count_unprocessed_conversations()
            failed: set[str] = set()

            def on_event(kind: str, data: dict[str, Any]) -> None:
                if kind == "piece":
                    _state["part"], _state["parts"] = data.get("part", 0), data.get("parts", 0)
                    return                      # a progress tick, not something to list
                if kind == "start":
                    _state["current"] = data.get("preview", "")
                    _state["current_id"] = data.get("id", "")
                    _state["part"] = _state["parts"] = 0
                elif kind == "done":
                    _state["read"] += 1
                    _state["left"] = st.count_unprocessed_conversations()
                    _state["total"] = max(_state["total"], _state["read"] + _state["left"])
                    _state["current"] = _state["current_id"] = ""
                    _state["part"] = _state["parts"] = 0
                elif kind == "failed":
                    _state["failed"] += 1
                    _state["current"] = _state["current_id"] = ""
                    _state["part"] = _state["parts"] = 0
                _note(kind, **data)

            while True:
                if _state["stopping"]:
                    break
                call = models.helper(cfg, "extract")
                if call is None:
                    _state["error"] = "no AI helper"
                    break
                out = manager.process_waiting(
                    st, model_call=watched(call), vault=settings.vault, guardrails=guardrails, limit=5,
                    skip=failed, on_event=on_event, should_stop=lambda: bool(_state["stopping"]),
                )
                failed.update(out.failed_ids)
                if out.read == 0:
                    break
                _state["error"] = ""
            left = st.count_unprocessed_conversations()
            _state["left"] = left
            if _state["stopping"]:
                _state["stopped"] = True
            elif left and not _state["error"]:
                # it ran, yet messages are still here: the helper is connected but did not read them
                _state["error"] = ("The AI helper did not answer." if not _state["read"]
                                   else f"The AI helper could not read {left} of them.")
                _state["detail"] = _failure_detail()
            try:
                manager.suggest_same_person(st)
            except Exception:  # noqa: BLE001
                logger.warning("same-person check failed", exc_info=True)
    except Exception as exc:  # noqa: BLE001 - a background job must never take the app down
        logger.warning("reader stopped", exc_info=True)
        _state["error"] = str(exc)
    finally:
        _state["running"] = False
        _state["asking_since"] = 0.0
        _state["stopping"] = False
        _state["current"] = _state["current_id"] = ""


def _failure_detail() -> str:
    """The last reason a message could not be read, for the screen."""
    for e in _events:
        if e["kind"] == "failed":
            return str(e.get("why") or "")
    return ""


def kick(settings: Settings) -> bool:
    """Start reading what is waiting, if nothing is already reading. True if started."""
    with _lock:
        if _state["running"]:
            return False
        _events.clear()
        _state.update(_fresh())
        try:
            from .store import Store

            with Store(settings.db) as st:
                _state["total"] = _state["left"] = st.count_unprocessed_conversations()
        except Exception:  # noqa: BLE001 - the count is only for the screen; the reader counts again itself
            pass
        _state["running"] = True
        _state["started"] = time.time()
        thread = threading.Thread(target=_run, args=(settings,), name="memory-ob-reader", daemon=True)
        thread.start()
        return True
