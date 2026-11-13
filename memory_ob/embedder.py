"""The meaning leg: embeddings, cached, plus the combined 3-leg search.

Search is three legs, as specified:

1. **words**   — FTS5 over title/body/tags
2. **meaning** — cosine similarity over cached embeddings (local model)
3. **entities**— tag / subject / speaker matches

Embeddings are computed on demand and cached in SQLite. When the embedding
model is unavailable the search silently degrades to words + entities — it
never claims to be semantic when it is not.
"""

from __future__ import annotations

import logging
import math
import re
import threading
from collections.abc import Iterable
from typing import Any

from . import models

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[a-z0-9]+")

# Below this cosine similarity a "meaning" hit is noise.
_MIN_SIMILARITY = 0.30


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _tokens(text: str) -> set[str]:
    return {t for t in _WORD_RE.findall((text or "").lower()) if len(t) > 1}


# Embedding models read a limited window (512 tokens for nomic v2); longer text is cut
# here instead of failing or being cut silently by the server.
_MAX_EMBED_CHARS = 1500


def embedding_text(record: Any) -> str:
    """The text a record is embedded from."""
    return f"{record.title}\n{record.body}".strip()[:_MAX_EMBED_CHARS]


def ensure_embeddings(
    store: Any,
    *,
    backend: models.ModelBackend | None = None,
    slot: models.ModelSlot | None = None,
    limit: int = 200,
    model_name: str = "",
) -> int:
    """Compute and cache embeddings for records that lack them.

    Also redoes those embedded by a different model (after the owner changes the
    embedding model) and those whose memory was edited since. Stops at the first
    failure (model unavailable) rather than hammering a dead endpoint. Returns how
    many were written.
    """
    backend = backend or models.resolve_backend()
    slot = slot or models.ModelConfig().slot("embed")
    name = model_name or models.embed_model_name(slot)
    prefix = models.embed_prefix(name, "document")
    written = 0
    for rid in store.missing_embeddings(limit=limit, model=name):
        rec = store.get_record(rid)
        if rec is None:
            continue
        try:
            vec = backend.embed(slot, prefix + embedding_text(rec))
        except Exception:
            break
        if not vec:
            continue
        store.set_embedding(rid, vec, model=name)
        written += 1
    if written:
        store.log_activity("embed", f"{written} embedding(s)", actor="memory_ob")
    return written


def _all_embeddings(store: Any, model: str | None = None) -> Iterable[tuple[str, list[float]]]:
    for rid in store.embedding_ids(model):
        vec = store.get_embedding(rid)
        if vec:
            yield rid, vec


def _query_vector(
    query: str,
    backend: models.ModelBackend | None = None,
    slot: models.ModelSlot | None = None,
) -> list[float] | None:
    if not query.strip():
        return None
    backend = backend or models.resolve_backend()
    slot = slot or models.ModelConfig().slot("embed")
    try:
        vec = backend.embed(slot, models.embed_prefix(models.embed_model_name(slot), "query") + query)
    except Exception:
        return None
    return vec or None


def combined_search(
    store: Any,
    query: str,
    *,
    limit: int = 20,
    backend: models.ModelBackend | None = None,
    slot: models.ModelSlot | None = None,
    semantic: bool = True,
) -> list[Any]:
    """Three-leg search: words + meaning + entities, merged and ranked."""
    if not query.strip():
        return []

    scores: dict[str, float] = {}

    # Leg 1 — words (FTS5)
    try:
        for r in store.search(query, limit=limit * 4):
            scores[r.id] = scores.get(r.id, 0.0) + 1.0
    except Exception:  # noqa: BLE001, S110
        pass

    # Leg 2 — meaning (embeddings)
    # Only vectors from the model in use are compared: another model's numbers mean nothing here.
    in_use = models.embed_model_name(slot or models.ModelConfig().slot("embed"))
    if semantic and store.count_embeddings(in_use) > 0:
        qv = _query_vector(query, backend, slot)
        if qv is not None:
            for rid, vec in _all_embeddings(store, in_use):
                sim = _cosine(qv, vec)
                if sim >= _MIN_SIMILARITY:
                    scores[rid] = scores.get(rid, 0.0) + sim

    # Leg 3 — entities (tags / subject / speaker)
    qtokens = _tokens(query)
    if qtokens:
        for r in store.list_records(limit=10000):
            if r.never_send or r.status == "trash":
                continue
            etoks = _tokens(" ".join([r.subject, r.speaker, *r.tags]))
            overlap = qtokens & etoks
            if overlap:
                scores[r.id] = scores.get(r.id, 0.0) + 0.5 * len(overlap)

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    out = []
    for rid, _ in ranked:
        r = store.get_record(rid)
        if r is None or r.never_send or r.status == "trash":
            continue
        out.append(r)
    return out


def semantic_available(
    store: Any, *, backend: models.ModelBackend | None = None, slot: models.ModelSlot | None = None,
) -> bool:
    """True when the meaning leg can actually run."""
    in_use = models.embed_model_name(slot or models.ModelConfig().slot("embed"))
    return store.count_embeddings(in_use) > 0 and _query_vector("probe", backend, slot) is not None


# -- background preparation ---------------------------------------------------------

_lock = threading.Lock()
_state: dict[str, Any] = {"running": False, "done": 0, "error": ""}


def progress() -> dict[str, Any]:
    """A snapshot of the background preparation (safe to call from any thread)."""
    return dict(_state)


def _run(settings: Any) -> None:
    from .store import Store

    try:
        cfg = models.ModelConfig.load(settings.models_path)
        backend, slot = models.resolve_backend(cfg), cfg.slot("embed")
        with Store(settings.db) as st:
            while True:
                n = ensure_embeddings(st, backend=backend, slot=slot, limit=50)
                if n == 0:
                    break
                _state["done"] += n
        _state["error"] = ""
    except Exception as exc:  # noqa: BLE001 - a background job must never take the app down
        logger.info("background embedding stopped: %s", exc)
        _state["error"] = str(exc)
    finally:
        _state["running"] = False


def kick(settings: Any) -> bool:
    """Prepare meaning search for every memory that needs it, in the background.

    Used after the owner picks another embedding model. True if it started.
    """
    with _lock:
        if _state["running"]:
            return False
        _state.update(running=True, done=0, error="")
        threading.Thread(target=_run, args=(settings,), name="memory-ob-embed", daemon=True).start()
        return True
