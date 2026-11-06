"""Memory_OB HTTP API (FastAPI).

This is the surface the screens and the host plugin talk to. Every write
goes through the library's pipeline — there is no direct store access here.

Run:
    uvicorn memory_ob.api:app --host 127.0.0.1 --port 8770
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Iterator

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse

from . import exit, hazards
from .auth import TOKEN_HEADER, load_or_create, verify
from .config import Settings
from .records import Record
from .review import CardStore
from .store import GRAPH_LABELS, Store

logger = logging.getLogger(__name__)

settings = Settings.resolve()

WEB_DIR = Path(__file__).resolve().parent / "web"

# Every method that can change the store. Reads stay open — the owner browses
# freely, and recall has nothing to do with writes.
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_store() -> Iterator[Store]:
    """Open a store for the duration of one request."""
    settings.ensure_dirs()
    st = Store(settings.db)
    try:
        yield st
    finally:
        st.close()


def _receipt(
    store: Store,
    recipient: str,
    records: list[Any],
    *,
    basis: str = "allowed",
    purpose: str = "",
) -> None:
    """Write a sharing receipt. Never blocks and never fails the request."""
    try:
        from .receipts import ReceiptLog

        ReceiptLog(settings.vault).record(
            recipient, records, basis=basis, purpose=purpose
        )
        store.log_activity(
            "receipt",
            f"{len(records)} record(s) → {recipient}",
            actor="memory_ob",
        )
    except Exception as exc:  # a receipt must never break a recall
        logger.debug("receipt failed: %s", exc)


def create_app() -> FastAPI:
    app = FastAPI(title="Memory_OB", version="0.1.0")

    @app.middleware("http")
    async def gate_writes(request: Request, call_next):
        """Write routes demand the install-generated token.

        The pages receive the token in their markup and echo it back, so the
        screens authenticate by shape. A curl with a hand-typed header works
        too, but nothing ships with a default token to type.
        """
        if request.method in WRITE_METHODS:
            settings.ensure_dirs()
            presented = request.headers.get(TOKEN_HEADER) or request.query_params.get(
                "token", ""
            )
            if not verify(settings.token_path, presented):
                # Create the token on first sight so an install that predates
                # the gate can still boot; the first page load then works.
                load_or_create(settings.token_path)
                return JSONResponse(
                    status_code=401,
                    content={"detail": "a valid write token is required"},
                )
        return await call_next(request)

    # -- the screens --------------------------------------------------------

    @app.get("/ui")
    def ui() -> HTMLResponse:
        index = WEB_DIR / "index.html"
        if not index.exists():
            raise HTTPException(status_code=404, detail="ui not built")
        token = load_or_create(settings.token_path)
        html = index.read_text(encoding="utf-8")
        html = html.replace(
            'window.__MEMORY_OB_TOKEN__ = "";',
            f'window.__MEMORY_OB_TOKEN__ = "{token}";',
        )
        return HTMLResponse(html)

    @app.get("/")
    def root() -> HTMLResponse:
        return ui()

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
        include_demo: bool = False,
        st: Store = Depends(get_store),
    ) -> list[dict[str, Any]]:
        # The exit gate: neverSend and hazardous records never leave (§7).
        # The list length is the SHOWN count — it never reveals how many
        # were withheld (law 2). Demo records stay quarantined unless the
        # owner asks for them explicitly (§15 rule 7).
        return exit.dicts_out(
            r.to_dict()
            for r in st.list_records(
                kind=kind, status=status, include_demo=include_demo, limit=limit
            )
        )

    @app.get("/api/records/{record_id}")
    def get_record(record_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        r = st.get_record(record_id)
        # A withheld record is indistinguishable from a missing one — the
        # owner cannot probe for its existence (law 2: never leaks counts).
        if r is None or not exit.keep(r):
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
        results = exit.dicts_out(r.to_dict() for r in hits)
        candidates = [
            {"text": f["text"], "trust": f["trust"]}
            for f in facts
            if not hazards.is_hazardous(str(f.get("text") or ""))
        ]
        # §7 sharing receipts: every time memory leaves, a receipt lands in
        # folder 07 — who, what (ids + hashes), when, and the basis.
        records = [h for h in hits if exit.keep(h)]
        if records:
            _receipt(st, "ai:recall", records, purpose=f"search: {q[:80]}")
        return {
            "query": q,
            "count": len(results),
            "results": results,
            "candidates": candidates,
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
        return exit.cards_out(
            c.to_dict() for c in cs.list(type=type, status=status, limit=limit)
        )

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
        data = st.graph(record_id=record_id)
        # The exit gate: an edge to a withheld record would reveal that it
        # exists (law 2), so edges are dropped when either end is withheld.
        visible = {n["id"] for n in data["nodes"]}
        edges = [
            e for e in data["edges"] if e["src"] in visible and e["dst"] in visible
        ]
        return {
            "nodes": exit.dicts_out(data["nodes"]),
            "edges": edges,
            "count": len(edges),
        }

    @app.post("/api/graph/link")
    def link_records(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """Owner-curated link between two records (§6)."""
        src = str(payload.get("src") or "")
        dst = str(payload.get("dst") or "")
        label = str(payload.get("label") or "supports")
        if not src or not dst:
            raise HTTPException(status_code=400, detail="src and dst are required")
        if label not in GRAPH_LABELS:
            raise HTTPException(
                status_code=400, detail=f"label must be one of {sorted(GRAPH_LABELS)}"
            )
        if st.get_record(src) is None or st.get_record(dst) is None:
            raise HTTPException(status_code=404, detail="record not found")
        st.link(src, dst, label)
        return {"ok": True, "src": src, "dst": dst, "label": label}

    @app.post("/api/graph/unlink")
    def unlink_records(
        payload: dict[str, Any], st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        src = str(payload.get("src") or "")
        dst = str(payload.get("dst") or "")
        if not src or not dst:
            raise HTTPException(status_code=400, detail="src and dst are required")
        st.unlink(src, dst)
        return {"ok": True}

    @app.post("/api/graph/rebuild")
    def rebuild_graph(st: Store = Depends(get_store)) -> dict[str, Any]:
        """Rebuild the disposable shared-tag edges (§1 living layer)."""
        n = st.rebuild_shared_edges()
        st.log_activity("graph_rebuild", f"{n} shared-tag edge(s)", actor="owner")
        return {"rebuilt": n}

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

        return exit.dicts_out(r.to_dict() for r in journal_entries(st, limit=limit))

    # -- anonymous mode ----------------------------------------------------

    @app.get("/api/anonymous")
    def anonymous_status() -> dict[str, Any]:
        from . import anonymous

        return {
            "anonymous": anonymous.is_anonymous(settings.vault),
            "state": anonymous.describe(settings.vault),
        }

    @app.post("/api/anonymous")
    def anonymous_set(payload: dict[str, Any]) -> dict[str, Any]:
        """Turn anonymous mode on or off (§7). Owner-run only."""
        from . import anonymous

        want = payload.get("anonymous")
        if want is None:
            return {"anonymous": anonymous.toggle(settings.vault)}
        anonymous.set_anonymous(settings.vault, bool(want))
        return {
            "anonymous": anonymous.is_anonymous(settings.vault),
            "state": anonymous.describe(settings.vault),
        }

    # -- standing-layer sync ----------------------------------------------

    @app.get("/api/sync")
    def sync_status() -> dict[str, Any]:
        """Is standing-layer sync on, and where would it write?"""
        from .hermes import hermes_memory_paths

        memory_path, user_path = hermes_memory_paths()
        return {
            "enabled": settings.sync_enabled,
            "memory_path": str(memory_path),
            "user_path": str(user_path),
            "confirmed": 0,
            "note": (
                "OFF by default. Confirmed records only; hand-written text "
                "outside the marked block never moves."
            ),
        }

    @app.post("/api/sync")
    def run_sync(payload: dict[str, Any] | None = None, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Sync confirmed truth into Hermes's MEMORY.md / USER.md (§7)."""
        from . import sync
        from .hermes import hermes_memory_paths

        payload = payload or {}
        enabled = (
            settings.sync_enabled
            if payload.get("anonymous") is None and "enabled" not in payload
            else bool(payload.get("enabled"))
        )
        memory_path, user_path = hermes_memory_paths()
        if not memory_path or not user_path:
            raise HTTPException(400, "Hermes memory files not found")
        result = sync.sync_all(
            st,
            memory_path=memory_path,
            user_path=user_path,
            enabled=enabled,
        )
        st.log_activity(
            "sync",
            f"{result['synced']} confirmed record(s) → Hermes memory",
            actor="owner",
        )
        return result

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

    @app.post("/api/settings")
    def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
        """Save the model selector."""
        from .models import ModelConfig

        cfg = ModelConfig.from_dict(payload)
        settings.ensure_dirs()
        cfg.save(settings.models_path)
        return {"ok": True, "path": str(settings.models_path)}

    @app.post("/api/export")
    def export_vault() -> dict[str, Any]:
        """Render the markdown vault from the store."""
        from .vault import export_all

        with Store(settings.db) as st:
            n = export_all(st, settings.vault)
        # Re-exporting changes the vault, so refresh the manifest too.
        from .manifest import write_manifest

        manifest = write_manifest(settings.vault)
        return {"exported": n, "vault": str(settings.vault), "manifest": manifest}

    # -- intake door ---------------------------------------------------------

    @app.get("/api/intake")
    def intake_list() -> dict[str, Any]:
        """What is sitting in the inbox, with its fingerprint."""
        from .intake import describe

        files = describe(settings.vault)
        return {"count": len(files), "files": files}

    @app.post("/api/intake")
    async def intake_upload(
        file: UploadFile = File(...), st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        """Byte-preserving intake: the raw file is copied unchanged (§10)."""
        from .intake import intake_bytes

        data = await file.read()
        result = intake_bytes(
            data,
            vault=settings.vault,
            name=file.filename or "upload",
            source={"origin": file.filename or "upload"},
        )
        st.log_activity(
            "intake",
            f"{result['bytes']} bytes → {result['name']}",
            actor="owner",
        )
        return result

    # -- integrity ----------------------------------------------------------

    @app.get("/api/manifest")
    def manifest_status() -> dict[str, Any]:
        """Verify every vault file against its recorded fingerprint."""
        from .manifest import verify_manifest

        return verify_manifest(settings.vault)

    @app.post("/api/manifest")
    def manifest_rebuild() -> dict[str, Any]:
        """Rebuild the manifest from the files currently on disk."""
        from .manifest import write_manifest

        return write_manifest(settings.vault)

    @app.get("/api/receipts")
    def list_receipts(limit: int = 50) -> dict[str, Any]:
        """Sharing receipts — who received what, when, and on what basis."""
        from .receipts import ReceiptLog

        paths = ReceiptLog(settings.vault).list(limit=limit)
        return {
            "count": len(paths),
            "receipts": [
                {"file": p.name, "text": p.read_text(encoding="utf-8")}
                for p in paths
            ],
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8770)
