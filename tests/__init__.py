"""Test package bootstrap.

Puts the Hermes stub on ``sys.path`` when the real ``agent`` / ``tools``
packages are absent, so the provider tests run on an ordinary machine
instead of only inside a Hermes install.

Importing this package is enough — ``unittest`` imports ``tests`` before it
imports any test module, so the stub is in place in time.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

_CHECKOUT = Path(__file__).resolve().parent.parent

# The provider finds the engine through MEMORY_OB_HOME, then a short list of
# guessed locations. Without this default the suite only ever passed on the
# machine the code was written on, because only that machine matched a guess.
os.environ.setdefault("MEMORY_OB_HOME", str(_CHECKOUT))
# Tests flip "is an AI there?" on and off on purpose, so they must not be handed a remembered answer.
os.environ.setdefault("MEMORY_OB_NO_PROBE_CACHE", "1")

_STUB = Path(__file__).resolve().parent / "_hermes_stub"

if _STUB.is_dir():
    # Only stub what is genuinely missing; a real Hermes install wins.
    for _pkg in ("agent", "tools"):
        if importlib.util.find_spec(_pkg) is None:
            stub = str(_STUB)
            if stub not in sys.path:
                sys.path.insert(0, stub)
            break


def _no_ai_on_this_machine() -> None:
    """Whatever AI the machine running the tests happens to have must not change a result.

    On a computer with Ollama running, or Hermes with its helper, "is an AI
    there?" would be yes and tests that expect "no AI, simple rules" would fail
    there while passing everywhere else. They could also read, or write into,
    the real Hermes notes. So every test starts from "there is no Hermes here"
    (an empty folder) and "nothing is listening"; a test that wants an AI says so
    with ``mock.patch``.
    """
    import tempfile

    if "HERMES_HOME" not in os.environ:
        os.environ["HERMES_HOME"] = tempfile.mkdtemp(prefix="no-hermes-")
    os.environ.pop("HERMES_EXE", None)
    os.environ.setdefault("MEMORY_OB_NO_PROXY_PROBE", "1")
    try:
        from memory_ob import hermes, models
    except Exception:  # noqa: BLE001 - a broken checkout fails loudly in the tests themselves
        return
    hermes._proxy_up = lambda *a, **k: False
    models._server_up = lambda base, timeout=3.0: False


_no_ai_on_this_machine()
