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


def configure(s: Settings) -> None:
    """Point the app at a specific vault/db.

    ``create_app`` reads the module-level ``settings`` at request time, so
    rebinding it here is enough — this is what lets the CLI's ``--vault`` /
    ``--db`` flags apply to a served app.
    """
    global settings
    settings = s

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


def _caller(request: Request | None) -> str:
    """Who actually made this call.

    The activity log must not blame the owner for a machine. An explicit
    ``X-Memory-OB-Actor`` header wins (the pages send ``owner``, the agent
    tools send ``agent``); otherwise the peer address is recorded.
    """
    if request is None:
        return "owner"
    named = request.headers.get("x-memory-ob-actor")
    if named:
        return named.strip()
    host = getattr(request.client, "host", None)
    return f"api:{host}" if host else "api"


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
        from .webui import render

        return HTMLResponse(render(index, settings, token=load_or_create(settings.token_path)))

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

    @app.get("/api/records/{record_id}/history")
    def record_history(record_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Every version of a record, oldest first.

        The store has always kept the history; nothing exposed it. This is
        how the owner sees WHAT changed, WHO changed it and WHY — the audit
        trail behind a record.
        """
        r = st.get_record(record_id)
        if r is None or not exit.keep(r):
            raise HTTPException(status_code=404, detail="record not found")
        return {"id": record_id, "versions": st.get_history(record_id)}

    # -- the owner's signature ------------------------------------------------
    #
    # The agent's tools import the library directly and never see these routes,
    # so only the owner's own screens can call them. That is what makes a
    # "remember" button a signature rather than a shortcut.

    @app.get("/api/candidates")
    def list_candidates(st: Store = Depends(get_store)) -> dict[str, Any]:
        """Everything the assistant captured that is still waiting."""
        from .owner import candidates

        return {"candidates": candidates(st)}

    @app.post("/api/candidates/{fact_id}/remember")
    def remember_candidate(fact_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        """The owner signs a candidate into confirmed truth."""
        from .owner import remember_fact

        try:
            card = remember_fact(st, fact_id)
        except LookupError:
            raise HTTPException(status_code=404, detail="candidate not found")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return {"ok": True, "card": card.id, "title": card.title}

    @app.post("/api/candidates/{fact_id}/dismiss")
    def dismiss_candidate(fact_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        """The owner says a candidate is not true. The text is kept."""
        from .owner import dismiss_fact

        try:
            dismiss_fact(st, fact_id)
        except LookupError:
            raise HTTPException(status_code=404, detail="candidate not found")
        return {"ok": True}

    @app.post("/api/records")
    def create_record(
        payload: dict[str, Any],
        request: Request,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        rec = Record.from_payload(payload)
        st.add_record(rec, changed_by=_caller(request))
        return rec.to_dict()

    @app.delete("/api/records/{record_id}")
    def trash_record(
        record_id: str,
        reason: str = "deleted via api",
        request: Request = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        r = st.trash(record_id, reason=reason, by=_caller(request))
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
        from .models import ModelConfig, model_call, resolve_backend

        cfg = ModelConfig.load(settings.models_path)
        # §8: rerank is an optional slot; off unless the owner turns it on.
        rerank = model_call("rerank", cfg) if settings.rerank_enabled else None
        hits = st.search_all(
            q,
            limit=limit,
            backend=resolve_backend(cfg),
            slot=cfg.slot("embed"),
            rerank_call=rerank,
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
        edit: dict[str, Any] | None = None,
        request: Request = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        cs = CardStore(st)
        card = cs.resolve(card_id, action, by=_caller(request), note=note, edit=edit)
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
    def rebuild_graph(
        request: Request = None, st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        """Rebuild the disposable shared-tag edges (§1 living layer)."""
        n = st.rebuild_shared_edges()
        st.log_activity("graph_rebuild", f"{n} shared-tag edge(s)", actor=_caller(request))
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

    @app.get("/api/doctor")
    def doctor() -> dict[str, Any]:
        """Every health check in one call — the same ones the CLI runs."""
        from .doctor import doctor as run_doctor

        return run_doctor(settings)

    # -- nightly dream -----------------------------------------------------

    @app.post("/api/dream")
    def run_dream(
        payload: dict[str, Any] | None = None, st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        """The nightly consolidation. Uses the ``dream`` slot when configured."""
        from .dream import dream
        from .models import ModelConfig, model_call

        payload = payload or {}
        call = None
        if not payload.get("no_model"):
            call = model_call("dream", ModelConfig.load(settings.models_path))
        return dream(st, model_call=call)

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
        from .extract import extract_claims, extract_session
        from .models import ModelConfig, model_call

        source = payload.get("source") or {"origin": "api"}
        call = None
        if not payload.get("no_model"):
            cfg = ModelConfig.load(settings.models_path)
            call = model_call("extract", cfg)

        # A whole labelled conversation — what a browser addon sends when it
        # grabs a DM thread or a chat on another AI site. The extractor is told
        # which speaker is the owner, so the other person's words stay context.
        parts = payload.get("parts")
        if parts:
            cands = extract_session(
                [(str(p.get("role", "user")), str(p.get("content", "")))
                 for p in parts],
                source={**source, "speaker": "user"},
                model_call=call,
            )
        else:
            text = str(payload.get("text", ""))
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
    def run_sync(
        payload: dict[str, Any] | None = None,
        request: Request = None,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
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
            actor=_caller(request),
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
        file: UploadFile = File(...),
        request: Request = None,
        st: Store = Depends(get_store),
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
            actor=_caller(request),
        )
        return result

    @app.post("/api/intake/data")
    async def intake_data(payload: dict[str, Any]) -> dict[str, Any]:
        """Base64 intake for the host bridge, which cannot send multipart."""
        import base64

        from .intake import intake_bytes

        raw = payload.get("data_b64") or ""
        name = str(payload.get("name") or "upload")
        try:
            data = base64.b64decode(raw)
        except Exception:
            raise HTTPException(400, "data_b64 is not valid base64")
        return intake_bytes(
            data, vault=settings.vault, name=name, source={"origin": name}
        )

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

    # -- app settings + neverSend management --------------------------------

    @app.get("/api/app-settings")
    def app_settings() -> dict[str, Any]:
        """Everything the Settings page holds besides the model selector."""
        from .settings import load

        return load(settings.vault).to_dict()

    @app.post("/api/app-settings")
    def save_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
        from .settings import update

        allowed = {
            "brain_path", "semantic", "sweep_schedule",
            "checkpoint_required", "backup_dir", "demo_visible",
            # Appearance — validated inside update() before they are stored.
            "theme", "accent", "font_family", "font_size", "density",
        }
        saved = update(settings.vault, **{k: v for k, v in (payload or {}).items() if k in allowed})
        return saved.to_dict()

    @app.get("/api/appearance")
    def appearance() -> dict[str, Any]:
        """The appearance settings plus the CSS they resolve to.

        ``css`` is what the UI sets on its root element. Only validated values
        appear there, so the page can apply it without checking again.
        """
        from .appearance import Appearance
        from .settings import load

        app = load(settings.vault)
        current = Appearance.from_dict(app.to_dict())
        current.validate()
        return {**current.to_dict(), "errors": current.errors, "css": current.css()}

    @app.post("/api/appearance")
    def save_appearance(payload: dict[str, Any]) -> dict[str, Any]:
        """Set the appearance. Bad values are clamped, never stored raw."""
        from .appearance import Appearance
        from .settings import load, update

        payload = payload or {}
        app = load(settings.vault)
        merged = {**app.to_dict(), **payload}
        cleaned = Appearance.clean(merged)
        saved = update(settings.vault, **cleaned.to_dict())
        out = Appearance.from_dict(saved.to_dict())
        out.validate()
        return {**out.to_dict(), "errors": out.errors, "css": out.css()}

    # -- the Hermes proxy -----------------------------------------------------
    #
    # Without the proxy the model calls fall back to keyword matching and the
    # memory system stops judging. These routes let the owner see and control
    # that state.

    @app.get("/api/proxy")
    def proxy_status() -> dict[str, Any]:
        from . import proxy as px

        return px.status(settings.vault)

    @app.post("/api/proxy/start")
    def proxy_start() -> dict[str, Any]:
        from . import proxy as px

        ok = px.start()
        out = px.status(settings.vault)
        out["ok"] = ok
        return out

    @app.post("/api/proxy/stop")
    def proxy_stop() -> dict[str, Any]:
        from . import proxy as px

        ok = px.stop()
        out = px.status(settings.vault)
        out["ok"] = ok
        return out

    @app.post("/api/proxy/pref")
    def proxy_pref(payload: dict[str, Any]) -> dict[str, Any]:
        """Set the logon preference: ask, remember, or neither."""
        from . import proxy as px

        current = px.load_pref(settings.vault)
        ask = payload.get("ask_at_startup", current.ask_at_startup)
        remember = payload.get("remember", current.remember)
        new = px.ProxyPref(
            ask_at_startup=bool(ask),
            remember=bool(remember),
            last_choice=current.last_choice if remember else None,
        )
        px.save_pref(settings.vault, new)
        return px.status(settings.vault)

    @app.get("/api/neversend")
    def list_neversend() -> dict[str, Any]:
        """The ids of neverSend records — ids only, never text or counts.

        Law 2: the management surface proves the flag exists without
        revealing what it protects.
        """
        with Store(settings.db) as st:
            rows = st.conn.execute(
                "SELECT id FROM records WHERE never_send = 1 ORDER BY created DESC"
            ).fetchall()
        return {"ids": [r["id"] for r in rows]}

    @app.post("/api/neversend/{record_id}")
    def clear_neversend(record_id: str, request: Request = None) -> dict[str, Any]:
        """Clear the neverSend flag on a record (owner decision, logged)."""
        with Store(settings.db) as st:
            rec = st.get_record(record_id)
            if rec is None:
                raise HTTPException(404, "record not found")
            rec.never_send = False
            st.add_record(rec, changed_by=_caller(request))
            st.log_activity(
                "neversend_cleared",
                f"flag cleared on {record_id}",
                actor=_caller(request),
            )
        return {"ok": True}

    @app.post("/api/backup")
    def run_backup() -> dict[str, Any]:
        """Write a timestamped archive of the ledger and the export."""
        import sys
        from pathlib import Path as _Path

        host_dir = _Path(__file__).resolve().parent.parent / "host"
        if str(host_dir) not in sys.path:
            sys.path.insert(0, str(host_dir))
        try:
            from backup import create_backup
        except Exception as exc:
            raise HTTPException(500, f"backup unavailable: {exc}")
        path = create_backup(settings.vault)
        return {"backup": str(path)}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8770)
