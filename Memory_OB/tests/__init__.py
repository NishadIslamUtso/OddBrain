"""Test package bootstrap.

Puts the Hermes stub on ``sys.path`` when the real ``agent`` / ``tools``
packages are absent, so the provider tests run on an ordinary machine
instead of only inside a Hermes install.

Importing this package is enough — ``unittest`` imports ``tests`` before it
imports any test module, so the stub is in place in time.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_STUB = Path(__file__).resolve().parent / "_hermes_stub"

if _STUB.is_dir():
    # Only stub what is genuinely missing; a real Hermes install wins.
    for _pkg in ("agent", "tools"):
        if importlib.util.find_spec(_pkg) is None:
            stub = str(_STUB)
            if stub not in sys.path:
                sys.path.insert(0, stub)
            break
