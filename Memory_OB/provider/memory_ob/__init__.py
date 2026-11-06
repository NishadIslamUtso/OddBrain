"""Memory_OB memory provider — the Hermes `MemoryProvider` interface.

This is the pipe between Hermes and the Memory_OB engine. Hermes calls these
hooks every turn; the provider translates them into the engine's own store
calls. Nothing here reimplements a law — the engine owns records, trust, cards
and neverSend.

What each hook does:

* ``prefetch``     — recall before a turn: confirmed records first, candidate
                     facts labelled UNVERIFIED, neverSend records never leave.
* ``sync_turn``    — after a turn, extract candidate facts in the background.
* ``on_pre_compress`` — capture what is about to be squashed, and return a
                     short digest for the summary prompt.
* ``tools``        — ``memory_ob_search`` / ``_capture`` / ``_review`` /
                     ``_stats`` so the agent can work the memory directly.

User plugin: ``$HERMES_HOME/plugins/memory_ob/``, activated with
``memory.provider: memory_ob``.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Any, Optional

from agent.memory_provider import MemoryProvider, RecallStatus, spawn_context_thread
from tools.registry import tool_error

logger = logging.getLogger(__name__)

PROVIDER_NAME = "memory_ob"

_MIN_QUERY_LEN = 8       # shorter queries are noise; skip the recall round-trip
_MIN_OUTPUT_LEN = 20     # below this the block is not worth a prompt slot
_MAX_RECORDS = 6
_MAX_FACTS = 4
_MAX_SNIPPET = 320
_MAX_CAPTURE_CHARS = 12_000

# The Review card actions the agent may take. `confirm`/`deny` are the owner's
# signature — the agent may PROPOSE, never sign; `later` defers.
_CARD_ACTIONS = ("later",)


# --------------------------------------------------------------------------
# Engine location + config
# --------------------------------------------------------------------------


def _candidate_roots() -> list[Path]:
    roots: list[Path] = []
    env = os.environ.get("MEMORY_OB_HOME")
    if env:
        roots.append(Path(env))
    home = Path.home()
    roots.append(home / "Documents" / "Hermes" / "Workspace" / "Memory_OB")
    roots.append(home / "Documents" / "Hermes" / "Memory_OB")
    return roots


def find_engine() -> Optional[Path]:
    """The Memory_OB project directory, or None when it is not installed."""
    for root in _candidate_roots():
        try:
            if (root / "memory_ob" / "__init__.py").is_file():
                return root
        except OSError:
            continue
    return None


def _load_plugin_config() -> dict[str, Any]:
    try:
        from hermes_cli.config import load_config

        memory = load_config().get("memory", {})
    except Exception:
        return {}
    block = memory.get(PROVIDER_NAME, {}) if isinstance(memory, dict) else {}
    return dict(block) if isinstance(block, dict) else {}


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


# --------------------------------------------------------------------------
# Tool schemas
# --------------------------------------------------------------------------


def _schema(name: str, description: str, *required: tuple[str, str]) -> dict[str, Any]:
    properties = {
        key: {"type": "string", "description": desc} for key, desc in required
    }
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": [key for key, _ in required],
        },
    }


SEARCH_SCHEMA = _schema(
    "memory_ob_search",
    "Search the Memory_OB vault for records and candidate facts. Returns confirmed records first "
    "(each labelled with its trust tier and speaker), then candidate facts marked UNVERIFIED. "
    "Use whenever past context would change the answer.",
    ("query", "What to look for."),
)
CAPTURE_SCHEMA = _schema(
    "memory_ob_capture",
    "Capture text into Memory_OB as candidate facts. The owner confirms anything that becomes "
    "truth in the Review panel; capture is the raw intake door.",
    ("text", "The text to capture."),
)
REVIEW_SCHEMA = _schema(
    "memory_ob_review",
    "List Memory_OB Review cards, or defer one. Cards are the owner's decision surface — the "
    "agent may read them and mark one `later`, never confirm or deny.",
    ("action", "omit to list; or 'later' to defer a card."),
    ("card_id", "Required when action is 'later'."),
)
STATS_SCHEMA = _schema(
    "memory_ob_stats",
    "Memory_OB health: record counts by status, trust distribution, pending cards.",
)
ANONYMOUS_SCHEMA = _schema(
    "memory_ob_anonymous",
    "Anonymous mode: no recall is injected and nothing is saved as personal "
    "memory. Check the state, turn it on, or turn it off. Off restores normal "
    "memory immediately.",
    ("action", "'status', 'on' or 'off'."),
)


# --------------------------------------------------------------------------
# Provider
# --------------------------------------------------------------------------


class MemoryOBProvider(MemoryProvider):
    """Memory_OB as Hermes's external memory provider."""

    def __init__(self, config: Optional[dict[str, Any]] = None):
        self._config = dict(config) if config is not None else _load_plugin_config()
        self._auto_extract = _coerce_bool(self._config.get("auto_extract"), True)
        self._engine: Optional[Path] = None
        self._session_id = ""
        self._sync_thread: Optional[threading.Thread] = None
        self._last_recall: Optional[RecallStatus] = None

    # -- identity -------------------------------------------------------

    @property
    def name(self) -> str:
        return PROVIDER_NAME

    def is_available(self) -> bool:
        return find_engine() is not None

    def unavailable_reason(self) -> str:
        return (
            "Memory_OB engine not found. Set MEMORY_OB_HOME to the Memory_OB project "
            "directory, or place it at ~/Documents/Hermes/Workspace/Memory_OB."
        )

    def initialize(self, session_id: str, **kwargs) -> None:
        self._engine = find_engine()
        self._session_id = session_id

    # -- store plumbing -------------------------------------------------

    def _import_engine(self) -> Optional[Any]:
        """Import the engine package, adding its root to sys.path once."""
        if self._engine is None:
            return None
        root = str(self._engine)
        if root not in sys.path:
            sys.path.insert(0, root)
        try:
            import memory_ob  # noqa: PLC0415
        except Exception as exc:
            logger.warning("Memory_OB engine import failed: %s", exc)
            return None
        return memory_ob

    def _db_path(self) -> Path:
        """The database this provider writes to, bound at call time."""
        from memory_ob.config import Settings

        return Settings.resolve().db

    def _anonymous(self) -> bool:
        """True while the owner's anonymous-mode toggle is on (§7)."""
        try:
            from memory_ob import anonymous
            from memory_ob.config import Settings

            return anonymous.is_anonymous(Settings.resolve().vault)
        except Exception:
            return False

    def _store(self) -> Any:
        """A fresh store bound to the configured vault (one per call)."""
        memory_ob = self._import_engine()
        if memory_ob is None:
            raise RuntimeError("engine unavailable")
        from memory_ob.config import Settings  # noqa: PLC0415
        from memory_ob.store import Store  # noqa: PLC0415

        settings = Settings.resolve()
        settings.ensure_dirs()
        return Store(settings.db)

    # -- recall ---------------------------------------------------------

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Recall context for the upcoming turn. Fast, bounded, never blocking."""
        if not self._auto_extract or not query or len(query.strip()) < _MIN_QUERY_LEN:
            return ""
        if self._anonymous():
            # §7: anonymous mode injects nothing at all.
            return ""
        try:
            block, count = self._recall(query)
        except Exception as exc:
            logger.warning("Memory_OB prefetch failed: %s", exc)
            return ""
        self._last_recall = RecallStatus(
            provider_label=PROVIDER_NAME, count=count, glyph="Memory_OB"
        )
        return block

    def recall_status(self) -> Optional[RecallStatus]:
        return self._last_recall

    def _recall(self, query: str) -> tuple[str, int]:
        store = self._store()
        try:
            search = getattr(store, "search_all", None) or store.search
            records = [
                r for r in search(query, limit=_MAX_RECORDS * 2)
                if r.status == "active" and not r.never_send
            ]
            facts = store.search_facts(query, limit=_MAX_FACTS)
        finally:
            store.close()

        records.sort(key=lambda r: r.trust, reverse=True)
        records = records[:_MAX_RECORDS]

        if not records and not facts:
            return "", 0

        lines = ["## Memory_OB recall", ""]
        for r in records:
            tier = "confirmed" if r.trust >= 0.8 else ("candidate" if r.trust >= 0.3 else "raw")
            snippet = (r.body or r.title or "").strip().replace("\n", " ")
            if len(snippet) > _MAX_SNIPPET:
                snippet = snippet[: _MAX_SNIPPET - 1] + "…"
            who = f"{r.kind} · {tier} · {r.speaker}"
            lines.append(f"- [{who}] {snippet}" if snippet else f"- [{who}] {r.title}")

        if facts:
            lines.append("")
            lines.append("Candidate facts (UNVERIFIED — do not state as fact):")
            for f in facts[:_MAX_FACTS]:
                text = str(f.get("text", "")).strip().replace("\n", " ")
                if len(text) > _MAX_SNIPPET:
                    text = text[: _MAX_SNIPPET - 1] + "…"
                if text:
                    lines.append(f"- {text}")

        return "\n".join(lines), len(records)

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        """No-op: ``prefetch`` is synchronous, so there is nothing to queue."""

    # -- capture --------------------------------------------------------

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        turn_author: Optional[dict[str, Any]] = None,
    ) -> None:
        """Extract candidate facts from a finished turn, in the background."""
        if not self._auto_extract:
            return
        if self._anonymous():
            # §7: anonymous mode saves nothing as personal memory.
            return
        parts: list[tuple[str, str]] = []
        if user_content and user_content.strip():
            parts.append(("user", user_content.strip()))
        if assistant_content and assistant_content.strip():
            parts.append(("assistant", assistant_content.strip()))
        if not parts:
            return
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=5.0)
        self._sync_thread = spawn_context_thread(
            self._capture(parts, self._db_path()), name="memory-ob-sync"
        )
        self._sync_thread.start()

    def on_pre_compress(self, messages: list[dict[str, Any]]) -> str:
        """Capture what compression is about to discard, and digest it."""
        if not self._auto_extract or not messages:
            return ""
        if self._anonymous():
            return ""
        parts: list[tuple[str, str]] = [
            (str(m.get("role", "user")), str(m.get("content", "")).strip())
            for m in messages[-10:]
            if m.get("role") in {"user", "assistant"}
            and isinstance(m.get("content"), str)
            and m.get("content", "").strip()
        ]
        if not parts:
            return ""
        thread = spawn_context_thread(self._capture(parts, self._db_path()), name="memory-ob-precompress")
        thread.start()
        joined = " ".join(text for _, text in parts[-4:])
        return f"[Memory_OB pre-compression capture: {len(parts)} messages] {joined[:400]}"

    def on_session_end(self, messages: list[dict[str, Any]]) -> None:
        self.on_pre_compress(messages)

    def _capture(self, parts: list[tuple[str, str]], db_path: Path) -> Any:
        """Background work: extract candidates from each speaker's part.

        *db_path* is bound now, not looked up inside the thread: a thread
        that outlives the turn must not land in whatever database a later
        turn happens to point at.
        """

        def work() -> None:
            try:
                memory_ob = self._import_engine()
                if memory_ob is None:
                    return
                from memory_ob.extract import extract_claims  # noqa: PLC0415
                from memory_ob.models import ModelConfig, model_call  # noqa: PLC0415
                from memory_ob.store import Store  # noqa: PLC0415

                call = None
                try:
                    from memory_ob import hermes  # noqa: PLC0415

                    # Only pay for the model when the Hermes proxy is actually
                    # up; otherwise the engine's offline heuristic does the
                    # extraction and the background capture returns at once.
                    if hermes.proxy_available():
                        from memory_ob.config import Settings  # noqa: PLC0415

                        call = model_call(
                            "extract", ModelConfig.load(Settings.resolve().models_path)
                        )
                except Exception:
                    call = None

                store = Store(db_path)
                added = 0
                try:
                    for speaker, text in parts:
                        text = (text or "").strip()
                        if len(text) < _MIN_QUERY_LEN:
                            continue
                        candidates = extract_claims(
                            text[:_MAX_CAPTURE_CHARS],
                            source={
                                "origin": "hermes",
                                "session": self._session_id,
                                "speaker": speaker,
                            },
                            model_call=call,
                        )
                        for c in candidates:
                            store.add_fact(c.text, trust=c.trust, source=c.source)
                            added += 1
                    if added:
                        store.log_activity(
                            "capture",
                            f"{added} candidate(s) from Hermes turn",
                            actor="hermes",
                        )
                finally:
                    store.close()
            except Exception as exc:
                logger.debug("Memory_OB capture failed: %s", exc)

        return work

    # -- agent tools ----------------------------------------------------

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        return [
            SEARCH_SCHEMA,
            CAPTURE_SCHEMA,
            REVIEW_SCHEMA,
            STATS_SCHEMA,
            ANONYMOUS_SCHEMA,
        ]

    def handle_tool_call(self, tool_name: str, args: dict[str, Any], **kwargs) -> str:
        try:
            if tool_name == "memory_ob_search":
                query = str(args.get("query", "")).strip()
                if not query:
                    return tool_error("query is required")
                block, count = self._recall(query)
                return json.dumps({"count": count, "context": block or "(no matches)"})

            if tool_name == "memory_ob_capture":
                text = str(args.get("text", "")).strip()
                if not text:
                    return tool_error("text is required")
                thread = spawn_context_thread(
                    self._capture([("user", text)], self._db_path()), name="memory-ob-tool"
                )
                thread.start()
                return json.dumps({"ok": True, "queued": True})

            if tool_name == "memory_ob_review":
                return self._review(args)

            if tool_name == "memory_ob_stats":
                return self._stats()

            if tool_name == "memory_ob_anonymous":
                return self._anonymous_tool(args)

            return tool_error(f"Unknown tool: {tool_name}")
        except Exception as exc:
            logger.warning("Memory_OB tool %s failed: %s", tool_name, exc)
            return tool_error(str(exc))

    def _review(self, args: dict[str, Any]) -> str:
        memory_ob = self._import_engine()
        if memory_ob is None:
            return tool_error("engine unavailable")
        from memory_ob.review import CardStore  # noqa: PLC0415

        store = self._store()
        try:
            cards = CardStore(store).list(status="pending", limit=20)
        finally:
            store.close()

        action = str(args.get("action") or "").strip()
        if not action:
            items = [
                {
                    "id": c.id,
                    "type": c.type,
                    "title": c.title,
                    "speakers": getattr(c, "speakers", None),
                }
                for c in cards
            ]
            return json.dumps({"pending": len(items), "cards": items})

        card_id = str(args.get("card_id") or "").strip()
        if not card_id:
            return tool_error("card_id is required when action is given")
        if action not in _CARD_ACTIONS:
            return tool_error(
                f"action must be one of {_CARD_ACTIONS} — the agent never confirms or denies"
            )
        store = self._store()
        try:
            CardStore(store).resolve(card_id, action, by="agent")
        finally:
            store.close()
        return json.dumps({"ok": True, "card": card_id, "action": action})

    def _anonymous_tool(self, args: dict[str, Any]) -> str:
        from memory_ob import anonymous
        from memory_ob.config import Settings

        vault = Settings.resolve().vault
        action = str(args.get("action") or "status").strip().lower()
        if action in {"on", "enable", "true"}:
            anonymous.set_anonymous(vault, True)
        elif action in {"off", "disable", "false"}:
            anonymous.set_anonymous(vault, False)
        elif action != "status":
            return tool_error("action must be 'status', 'on' or 'off'")
        return json.dumps(
            {"anonymous": anonymous.is_anonymous(vault), "state": anonymous.describe(vault)}
        )

    def _stats(self) -> str:
        store = self._store()
        try:
            stats = store.stats()
            from memory_ob.review import CardStore  # noqa: PLC0415

            pending = len(CardStore(store).list(status="pending", limit=50))
        finally:
            store.close()
        return json.dumps({"stats": stats, "pending_cards": pending})

    # -- prompt + lifecycle ---------------------------------------------

    def system_prompt_block(self) -> str:
        base = (
            "# Memory_OB\n"
            "Active. Evidence-first memory: everything is captured as candidates, and only the "
            "owner signs a record into truth in the Review panel.\n"
            "Use memory_ob_search before answering when past context would change it. "
            "Use memory_ob_capture for anything worth keeping. Never state a candidate fact as "
            "truth — it is labelled UNVERIFIED until the owner confirms it."
        )
        if self._anonymous():
            return (
                "# Memory_OB\n"
                "ANONYMOUS MODE IS ON at the owner's request. No memory is recalled and nothing "
                "is captured. Answer from the current conversation only — do not use "
                "memory_ob_search, and do not mention that memory exists."
            )
        return base

    def shutdown(self) -> None:
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=10.0)


_SKILL_DESCRIPTIONS = {
    "brain": (
        "Recall the owner's memory, search the vault, capture a record, or work the "
        "Review panel. The AI proposes; the owner signs."
    ),
    "memory-full-recall": (
        "Load the whole Memory_OB vault before answering — every confirmed record and "
        "candidate fact, not just the top matches."
    ),
    "anonymous-mode": (
        "Run a session with no recall injected and nothing captured as personal memory."
    ),
}


def _skill_path(name: str) -> Optional[Path]:
    """Find an installed SKILL.md for *name*.

    The provider lives at ``plugins/memory_ob/`` when installed and at
    ``provider/memory_ob/`` in the source tree, so the skills sit a different
    number of levels up. Try both.
    """
    here = Path(__file__).resolve()
    for parent in (here.parent, *here.parents):
        candidate = parent / "skills" / name / "SKILL.md"
        if candidate.is_file():
            return candidate
    return None


def register(ctx) -> None:
    """Plugin entry point: hand Hermes the provider and register the skills."""
    ctx.register_memory_provider(MemoryOBProvider())
    try:
        for name, description in _SKILL_DESCRIPTIONS.items():
            path = _skill_path(name)
            if path is None:
                logger.debug("skill %s not found on disk; skipping", name)
                continue
            ctx.register_skill(name, path, description)
    except Exception as exc:  # skills are a bonus; the provider must still load
        logger.debug("Memory_OB skill registration failed: %s", exc)
