"""Memory_OB HTTP API (FastAPI).

This is the surface the screens and the host plugin talk to. Every write
goes through the library's pipeline — there is no direct store access here.

Run:
    uvicorn memory_ob.api:app --host 127.0.0.1 --port 8770
"""

from __future__ import annotations

from typing import Any, Iterator

from fastapi import Depends, FastAPI, HTTPException, Query

from .config import Settings
from .records import Record
from .review import CardStore
from .store import Store

settings = Settings.resolve()


def get_store() -> Iterator[Store]:
    """Open a store for the duration of one request."""
    settings.ensure_dirs()
    st = Store(settings.db)
    try:
        yield st
    finally:
        st.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Memory_OB", version="0.1.0")

    # -- records -----------------------------------------------------------

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        with Store(settings.db) as st:
            return {"ok": True, "app": "Memory_OB", "stats": st.stats()}

    @app.get("/api/records")
    def list_records(
        kind: str | None = None,
        status: str | None = None,
        limit: int = 200,
        include_private: bool = False,
        st: Store = Depends(get_store),
    ) -> list[dict[str, Any]]:
        return [
            r.to_dict()
            for r in st.list_records(
                kind=kind, status=status, include_private=include_private, limit=limit
            )
        ]

    @app.get("/api/records/{record_id}")
    def get_record(record_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        r = st.get_record(record_id)
        if r is None:
            raise HTTPException(status_code=404, detail="record not found")
        return r.to_dict()

    @app.post("/api/records")
    def create_record(
        payload: dict[str, Any], st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        rec = Record.from_payload(payload)
        st.add_record(rec, changed_by="owner")
        return rec.to_dict()

    @app.delete("/api/records/{record_id}")
    def trash_record(
        record_id: str,
        reason: str = "deleted via api",
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        r = st.trash(record_id, reason=reason, by="owner")
        if r is None:
            raise HTTPException(status_code=404, detail="record not found")
        return {"ok": True, "status": r.status}

    # -- search ------------------------------------------------------------

    @app.get("/api/search")
    def search(
        q: str = Query(..., min_length=1),
        limit: int = 20,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        from .models import ModelConfig, resolve_backend

        cfg = ModelConfig.load(settings.models_path)
        hits = st.search_all(
            q, limit=limit, backend=resolve_backend(cfg), slot=cfg.slot("embed")
        )
        facts = st.search_facts(q, limit=limit)
        return {
            "query": q,
            "count": len(hits),
            "results": [r.to_dict() for r in hits],
            "candidates": [
                {"text": f["text"], "trust": f["trust"]} for f in facts
            ],
        }

    # -- review ------------------------------------------------------------

    @app.get("/api/cards")
    def list_cards(
        type: str | None = None,
        status: str = "pending",
        limit: int = 200,
        st: Store = Depends(get_store),
    ) -> list[dict[str, Any]]:
        cs = CardStore(st)
        return [c.to_dict() for c in cs.list(type=type, status=status, limit=limit)]

    @app.post("/api/cards/{card_id}/{action}")
    def resolve_card(
        card_id: str,
        action: str,
        note: str | None = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        cs = CardStore(st)
        card = cs.resolve(card_id, action, by="owner", note=note)
        if card is None:
            raise HTTPException(status_code=404, detail="card not found")
        return card.to_dict()

    # -- graph -------------------------------------------------------------

    @app.get("/api/graph")
    def graph(
        record_id: str | None = None, st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        edges = st.edges(record_id)
        return {
            "edges": [{"src": s, "dst": d, "label": l} for s, d, l in edges],
            "count": len(edges),
        }

    # -- consistency -------------------------------------------------------

    @app.post("/api/sweep")
    def run_sweep(st: Store = Depends(get_store)) -> dict[str, Any]:
        from .consistency import sweep

        return sweep(st)

    @app.get("/api/audit")
    def audit(st: Store = Depends(get_store)) -> dict[str, Any]:
        from .consistency import monthly_audit

        return monthly_audit(st)

    # -- nightly dream -----------------------------------------------------

    @app.post("/api/dream")
    def run_dream(st: Store = Depends(get_store)) -> dict[str, Any]:
        from .dream import dream

        return dream(st)

    # -- life story --------------------------------------------------------

    @app.post("/api/chapter")
    def draft_chapter(
        payload: dict[str, Any] | None = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        from .journal import chapter_to_card, draft_chapter
        from .models import ModelConfig, model_call
        from .review import CardStore

        payload = payload or {}
        call = None
        if not payload.get("no_model"):
            call = model_call("chapter", ModelConfig.load(settings.models_path))
        chapter = draft_chapter(
            st, title=str(payload.get("title") or "Untitled chapter"), model_call=call
        )
        if chapter is None:
            return {"drafted": False, "reason": "no confirmed owner records"}
        card = CardStore(st).propose_record(
            new=chapter_to_card(chapter), title=chapter.title, body=chapter.body
        )
        return {
            "drafted": True,
            "card_id": card.id,
            "cited": len(chapter.cited_ids),
            "quotation": chapter.quotation,
        }

    # -- embeddings --------------------------------------------------------

    @app.post("/api/embed")
    def embed(
        payload: dict[str, Any] | None = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        from .embedder import ensure_embeddings
        from .models import ModelConfig, resolve_backend

        payload = payload or {}
        cfg = ModelConfig.load(settings.models_path)
        n = ensure_embeddings(
            st,
            backend=resolve_backend(cfg),
            slot=cfg.slot("embed"),
            limit=int(payload.get("limit", 200)),
        )
        return {"computed": n, "cached": st.count_embeddings()}

    # -- capture -----------------------------------------------------------

    @app.post("/api/capture")
    def capture(
        payload: dict[str, Any], st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        from .extract import extract_claims
        from .models import ModelConfig, model_call

        text = str(payload.get("text", ""))
        source = payload.get("source") or {"origin": "api"}
        call = None
        if not payload.get("no_model"):
            cfg = ModelConfig.load(settings.models_path)
            call = model_call("extract", cfg)
        cands = extract_claims(text, source=source, model_call=call)
        for c in cands:
            st.add_fact(c.text, trust=c.trust, source=c.source)
        return {
            "candidates": len(cands),
            "facts": [
                {"text": c.text, "trust": c.trust, "kind": c.kind_hint}
                for c in cands
            ],
        }

    # -- activity ----------------------------------------------------------

    @app.get("/api/activity")
    def activity(
        limit: int = 50, st: Store = Depends(get_store)
    ) -> list[dict[str, Any]]:
        return st.activity(limit=limit)

    # -- journal -----------------------------------------------------------

    @app.get("/api/journal")
    def journal(
        limit: int = 100, st: Store = Depends(get_store)
    ) -> list[dict[str, Any]]:
        from .journal import journal_entries

        return [r.to_dict() for r in journal_entries(st, limit=limit)]

    # -- models ------------------------------------------------------------

    @app.get("/api/models")
    def models() -> dict[str, Any]:
        from .models import SLOTS, ModelConfig, resolve_backend

        cfg = ModelConfig.load(settings.models_path)
        backend = resolve_backend(cfg)
        return {
            "config": cfg.to_dict(),
            "backend": backend.name,
            "slots": {name: cfg.slot(name).to_dict() for name in SLOTS},
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8770)
