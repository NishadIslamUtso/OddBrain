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

import math
import re
from typing import Any, Iterable

from . import models

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


def embedding_text(record: Any) -> str:
    """The text a record is embedded from."""
    return f"{record.title}\n{record.body}".strip()


def ensure_embeddings(
    store: Any,
    *,
    backend: models.ModelBackend | None = None,
    slot: models.ModelSlot | None = None,
    limit: int = 200,
    model_name: str = "",
) -> int:
    """Compute and cache embeddings for records that lack them.

    Stops at the first failure (model unavailable) rather than hammering a
    dead endpoint. Returns how many were written.
    """
    backend = backend or models.resolve_backend()
    slot = slot or models.ModelConfig().slot("embed")
    written = 0
    for rid in store.missing_embeddings(limit=limit):
        rec = store.get_record(rid)
        if rec is None:
            continue
        try:
            vec = backend.embed(slot, embedding_text(rec))
        except Exception:
            break
        if not vec:
            continue
        store.set_embedding(rid, vec, model=model_name or slot.model or backend.name)
        written += 1
    if written:
        store.log_activity("embed", f"{written} embedding(s)", actor="memory_ob")
    return written


def _all_embeddings(store: Any) -> Iterable[tuple[str, list[float]]]:
    for rid in store.embedding_ids():
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
        vec = backend.embed(slot, query)
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
) -> list[Any]:
    """Three-leg search: words + meaning + entities, merged and ranked."""
    if not query.strip():
        return []

    scores: dict[str, float] = {}

    # Leg 1 — words (FTS5)
    try:
        for r in store.search(query, limit=limit * 4):
            scores[r.id] = scores.get(r.id, 0.0) + 1.0
    except Exception:
        pass

    # Leg 2 — meaning (embeddings)
    if store.count_embeddings() > 0:
        qv = _query_vector(query, backend, slot)
        if qv is not None:
            for rid, vec in _all_embeddings(store):
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


def semantic_available(store: Any, *, backend: models.ModelBackend | None = None) -> bool:
    """True when the meaning leg can actually run."""
    return store.count_embeddings() > 0 and _query_vector("probe", backend) is not None
