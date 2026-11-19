"""Stub of ``agent.memory_provider`` — see tests/_hermes_stub/agent/__init__.py."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Callable, Optional


@dataclass
class RecallStatus:
    provider_label: str = ""
    count: int = 0
    glyph: str = ""


def spawn_context_thread(
    target: Callable[..., Any], *, name: str, daemon: bool = True, **kwargs: Any
) -> threading.Thread:
    """An unstarted thread, matching Hermes's helper."""
    return threading.Thread(target=target, name=name, daemon=daemon)


class MemoryProvider:
    """The hooks Hermes calls. The stub defaults are inert."""

    name: str = "stub"

    def is_available(self) -> bool:
        return True

    def unavailable_reason(self) -> str:
        return ""

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        return None

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        return ""

    def recall_status(self) -> Optional[RecallStatus]:
        return None

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        return None

    def sync_turn(self, user_content: str, assistant_content: str, **kwargs: Any) -> None:
        return None

    def on_pre_compress(self, messages: list[dict[str, Any]]) -> str:
        return ""

    def on_session_end(self, messages: list[dict[str, Any]]) -> None:
        return None

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        return []

    def handle_tool_call(self, tool_name: str, args: dict[str, Any], **kwargs: Any) -> str:
        return "{}"

    def system_prompt_block(self) -> str:
        return ""

    def shutdown(self) -> None:
        return None
