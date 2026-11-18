"""Remember "is it there?" answers for a little while.

Several screens ask whether an AI is reachable: the Hermes connection, or a
model running on this computer. Asking means opening a network connection, and
on Windows a connection to something that is not running can take a couple of
seconds to fail. Done on every click, that made every screen slow.

So an answer is kept for a while. When it gets old the old answer is used right
away and a fresh one is fetched in the background, so a click never waits for a
probe it has already paid for once. The very first question is asked for real.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Callable

# How long a "yes" and a "no" stay fresh. A "no" is rechecked sooner so an AI
# that was just started is noticed quickly.
TTL_YES = 30.0
TTL_NO = 8.0

_LOCK = threading.Lock()
_ANSWERS: dict[str, list] = {}  # key -> [answer, when it was asked, a refresh is running]


def enabled() -> bool:
    """Off only for the test suite, which flips availability on purpose."""
    return os.environ.get("MEMORY_OB_NO_PROBE_CACHE", "") not in ("1", "true", "yes")


def remembered(key: str, ask: Callable[[], bool]) -> bool:
    """The answer to *ask*, from memory when it is recent enough."""
    if not enabled():
        return bool(ask())
    with _LOCK:
        entry = _ANSWERS.get(key)
    if entry is None:
        answer = bool(ask())
        with _LOCK:
            _ANSWERS[key] = [answer, time.monotonic(), False]
        return answer
    answer, asked_at, busy = entry
    if time.monotonic() - asked_at < (TTL_YES if answer else TTL_NO):
        return answer
    with _LOCK:
        if entry[2]:
            return answer
        entry[2] = True
    threading.Thread(target=_refresh, args=(key, ask, entry), name="memory-ob-probe", daemon=True).start()
    return answer


def _refresh(key: str, ask: Callable[[], bool], entry: list) -> None:
    try:
        answer = bool(ask())
    except Exception:  # noqa: BLE001 - a failed probe just means "not there"
        answer = False
    with _LOCK:
        if _ANSWERS.get(key) is entry:
            entry[0], entry[1] = answer, time.monotonic()
        entry[2] = False


def forget(*keys: str) -> None:
    """Throw away what is remembered (after the owner changes a setting, or starts or stops the connection)."""
    with _LOCK:
        if keys:
            for key in keys:
                _ANSWERS.pop(key, None)
        else:
            _ANSWERS.clear()
