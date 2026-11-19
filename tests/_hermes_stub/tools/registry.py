"""Stub of ``tools.registry`` — see tests/_hermes_stub/agent/__init__.py."""

from __future__ import annotations

import json
from typing import Any


def tool_error(message: str, **extra: Any) -> str:
    """Match Hermes's shape: ``{"error": "..."}``."""
    return json.dumps({"error": str(message), **extra}, ensure_ascii=False)
