"""The night shift: everything Memory_OB does by itself, in one pass.

It reads whatever was left waiting, looks for people who may be the same,
brings the notes in the vault and the biography up to date, refreshes the
integrity manifest and, if the owner turned that on, updates Hermes's own
memory notes. Each step stands alone: one failing does not stop the rest.

It never opens a question about old memories. The only questions Memory_OB
asks come from something the owner has just said.
"""

from __future__ import annotations

import logging
from typing import Any

from . import biography, manager, models
from .config import Settings
from .models import ModelConfig
from .settings import load as load_settings
from .store import Store

logger = logging.getLogger(__name__)


def _step(name: str, fn: Any) -> dict[str, str]:
    try:
        return {"step": name, "ok": "yes", "detail": str(fn())[:200]}
    except Exception as exc:  # noqa: BLE001 - one bad step must not stop the night
        logger.warning("night shift step %s failed", name, exc_info=True)
        return {"step": name, "ok": "no", "detail": f"{type(exc).__name__}: {exc}"}


def sync_hermes(store: Store, settings: Settings, *, enabled: bool) -> dict[str, Any] | None:
    """Update (or, when switched off, clean up) Hermes's own memory notes."""
    from . import sync
    from .hermes import hermes_memory_paths

    memory_path, user_path = hermes_memory_paths()
    if not memory_path or not user_path:
        return None
    return sync.sync_all(store, memory_path=memory_path, user_path=user_path, enabled=enabled)


def run(settings: Settings, *, dry_run: bool = False, skip: tuple[str, ...] = ()) -> list[dict[str, str]]:
    """Run every step. Returns one line per step.

    *skip* leaves named steps out (the "Tidy now" button reads waiting
    conversations in the background instead of making the owner wait).
    """
    settings.ensure_dirs()
    app = load_settings(settings.vault)
    cfg = ModelConfig.load(settings.models_path)
    call = models.helper(cfg, "extract")

    def read_waiting() -> str:
        with Store(settings.db) as st:
            if call is None:
                return f"{st.count_unprocessed_conversations()} waiting; no AI helper right now"
            out = manager.process_waiting(
                st, model_call=call, vault=settings.vault, guardrails=list(app.guardrails), limit=200,
            )
            return f"read {out.read} conversation(s); saved {out.saved}, asked {out.asked}"

    def same_people() -> str:
        with Store(settings.db) as st:
            return f"{manager.suggest_same_person(st)} new question(s)"

    def bio() -> str:
        with Store(settings.db) as st:
            data = biography.refresh(st, settings.vault, call, include_sensitive=app.bio_sensitive)
        return data["how"] or "nothing to write yet"

    def notes() -> str:
        from .vault import rebuild

        with Store(settings.db) as st:
            st.rebuild_shared_edges()
            result = rebuild(st, settings.vault)
        return f"{result['notes']} notes"

    def manifest() -> str:
        from .manifest import record_new, verify_manifest

        record_new(settings.vault)
        check = verify_manifest(settings.vault)
        bad = len(check["changed"]) + len(check["missing"])
        return "all originals unchanged" if not bad else f"{bad} original file(s) changed or missing"

    def hermes_sync() -> str:
        if not app.sync_hermes:
            return "off"
        with Store(settings.db) as st:
            report = sync_hermes(st, settings, enabled=True)
        return "Hermes memory files not found" if report is None else f"{report['synced']} memories"

    steps = [("read", read_waiting), ("people", same_people), ("biography", bio),
             ("notes", notes), ("manifest", manifest), ("hermes", hermes_sync)]
    steps = [(n, f) for n, f in steps if n not in skip]
    if dry_run:
        return [{"step": n, "ok": "dry", "detail": "would run"} for n, _ in steps]
    return [_step(n, f) for n, f in steps]
