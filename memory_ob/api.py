"""Memory_OB HTTP API (FastAPI).

This is the surface the screens and the host plugin talk to. Every write goes
through :mod:`memory_ob.manager`, which files what the owner says, asks only
when something contradicts what is already saved, and logs every change so it
can be undone.

Run:
    uvicorn memory_ob.api:app --host 127.0.0.1 --port 8770
"""

from __future__ import annotations

import base64
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse

from . import (
    biography as bio_mod,
    doubts as doubts_mod,
    exit,
    feed as feed_mod,
    hazards,
    importers,
    manager,
    me as me_mod,
    models,
    reader,
    startup,
    topics,
    vaultview,
)
from . import settings as settings_mod
from .auth import TOKEN_HEADER, load_or_create, verify
from .config import Settings
from .models import ModelConfig, ModelSlot
from .store import GRAPH_LABELS, Store

logger = logging.getLogger(__name__)

settings = Settings.resolve()

# Kept under the old names for the provider and the tests.
_blocked_by_guardrails = manager.blocked_by_guardrails


def _app_settings() -> settings_mod.AppSettings:
    return settings_mod.load(settings.vault)


def _guardrails(cfg: Settings) -> list[str]:
    try:
        return list(settings_mod.load(cfg.vault).guardrails or [])
    except Exception:  # noqa: BLE001
        return []


def _app_semantic(cfg: Settings) -> bool:
    try:
        return bool(settings_mod.load(cfg.vault).semantic)
    except Exception:  # noqa: BLE001
        return True


def configure(s: Settings) -> None:
    """Point the app at a specific vault/db.

    ``create_app`` reads the module-level ``settings`` at request time, so
    rebinding it here is enough — this is what lets the CLI's ``--vault`` /
    ``--db`` flags apply to a served app.
    """
    global settings
    settings = s
    models.configure_local_only(s.vault)


WEB_DIR = Path(__file__).resolve().parent / "web"

# Every method that can change the store. Reads stay open — the owner browses
# freely, and recall has nothing to do with writes.
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_store() -> Iterator[Store]:
    """Open a store for the duration of one request."""
    settings.ensure_dirs()
    startup.prepare(settings)
    st = Store(settings.db)
    try:
        yield st
    finally:
        st.close()


def _caller(request: Request | None) -> str:
    """Who actually made this call.

    An explicit ``X-Memory-OB-Actor`` header wins (the pages send ``owner``,
    the agent tools send ``agent``); otherwise the peer address is recorded.
    """
    if request is None:
        return "owner"
    named = request.headers.get("x-memory-ob-actor")
    if named:
        return named.strip()
    host = getattr(request.client, "host", None)
    return f"api:{host}" if host else "api"


def _receipt(
    store: Store, recipient: str, records: list[Any], *, basis: str = "allowed", purpose: str = "",
) -> None:
    """Write a sharing receipt. Never blocks and never fails the request."""
    try:
        from .receipts import ReceiptLog

        ReceiptLog(settings.vault).record(recipient, records, basis=basis, purpose=purpose)
        store.log_activity("receipt", f"{len(records)} record(s) → {recipient}", actor="memory_ob")
    except Exception as exc:  # a receipt must never break a recall
        logger.debug("receipt failed: %s", exc)


def _helper() -> Any | None:
    """The AI helper's callable, or None when there is none right now."""
    return models.helper(ModelConfig.load(settings.models_path), "extract")


def _paused() -> bool:
    from . import anonymous

    return anonymous.is_anonymous(settings.vault)


def _after_change(st: Store) -> None:
    """Keep Hermes's own memory notes current when the owner asked for that."""
    try:
        if _app_settings().sync_hermes:
            from . import nightshift

            nightshift.sync_hermes(st, settings, enabled=True)
    except Exception:  # noqa: BLE001 - never fail a save over a notes file
        logger.warning("could not update Hermes memory files", exc_info=True)


def _fail(status: int, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=message)


# -- views ---------------------------------------------------------------------


def _helper_status(cfg: ModelConfig) -> dict[str, Any]:
    state = models.helper_state(cfg)
    kind = state["kind"]
    slot = cfg.slot("extract")
    label = {
        "hermes": "Connected through Hermes",
        "local": "Using a model on this computer" + (f" ({slot.model})" if slot.model else ""),
        "online": "Using the online model you chose",
        "none": "No AI helper found",
    }[kind]
    return {"kind": kind, "ready": state["ready"] == "yes", "label": label}


def _status(st: Store) -> dict[str, Any]:
    cfg = ModelConfig.load(settings.models_path)
    app = _app_settings()
    stats = st.stats()
    indexed = st.count_embeddings()
    if not app.semantic:
        meaning = "off"
    elif indexed > 0:
        meaning = "working"
    else:
        meaning = "not_set_up"
    return {
        "helper": _helper_status(cfg),
        "meaning_search": {"state": meaning, "indexed": indexed, "memories": stats["active"]},
        "waiting": st.count_unprocessed_conversations(),
        "reading": reader.progress(),
        "paused": _paused(),
        "categories": list(topics.CATEGORIES),
        "memories": stats["active"],
        "people": len(st.list_people(limit=100000)),
    }


def _unsure(st: Store) -> list[dict[str, Any]]:
    out = []
    for f in st.list_facts(status="unsure", limit=100):
        if f.get("demo") or hazards.is_hazardous(str(f.get("text") or "")):
            continue                      # sample data and unsafe text never reach the screen
        out.append({"id": f["id"], "text": f["text"], "at": f.get("created", "")})
    return out


def _people_index(st: Store) -> list[dict[str, Any]]:
    """Every person with how often they come up, in one pass over the data."""
    people = st.list_people(limit=100000)
    by_name: dict[str, dict[str, Any]] = {}
    for p in people:
        entry = {**p, "conversations": [], "memories": []}
        for n in [p["name"], *p["aliases"]]:
            by_name[n.lower()] = entry
    seen_conv: set[tuple[str, str]] = set()
    for conv in st.list_conversations(limit=100000):
        for n in conv.get("people") or []:
            entry = by_name.get(str(n).lower())
            if entry is not None and (entry["id"], conv["id"]) not in seen_conv:
                seen_conv.add((entry["id"], conv["id"]))
                entry["conversations"].append({
                    "id": conv["id"], "origin": conv.get("origin") or "", "created": conv.get("created") or "",
                    "preview": (conv.get("text") or "")[:160],
                })
    from .records import ACTIVE

    seen_rec: set[tuple[str, str]] = set()
    for rec in st.list_records(status=ACTIVE, limit=100000):
        for n in (rec.source or {}).get("people", []):
            entry = by_name.get(str(n).lower())
            if entry is not None and (entry["id"], rec.id) not in seen_rec:
                seen_rec.add((entry["id"], rec.id))
                entry["memories"].append(rec)
    return list({id(v): v for v in by_name.values()}.values())


def _platform(origin: str) -> str:
    return vaultview.platform_name(origin)


def _person_card(entry: dict[str, Any]) -> dict[str, Any]:
    dates = [c["created"] for c in entry["conversations"] if c["created"]]
    return {
        "id": entry["id"], "name": entry["name"], "aliases": entry["aliases"],
        "relation": entry["relation"], "notes": entry["notes"],
        "conversations": len(entry["conversations"]), "memories": len(entry["memories"]),
        "platforms": sorted({_platform(c["origin"]) for c in entry["conversations"]}),
        "last": max(dates) if dates else (entry.get("modified") or ""),
    }


def create_app() -> FastAPI:
    app = FastAPI(title="Memory_OB", version="0.2.0")

    @app.middleware("http")
    async def gate_writes(request: Request, call_next):
        """Write routes demand the install-generated token.

        The pages receive the token in their markup and echo it back, so the
        screens authenticate by shape. A curl with a hand-typed header works
        too, but nothing ships with a default token to type.
        """
        if request.method in WRITE_METHODS:
            settings.ensure_dirs()
            presented = request.headers.get(TOKEN_HEADER) or request.query_params.get("token", "")
            if not verify(settings.token_path, presented):
                # Create the token on first sight so an install that predates
                # the gate can still boot; the first page load then works.
                load_or_create(settings.token_path)
                return JSONResponse(status_code=401, content={"detail": "a valid write token is required"})
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

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        with Store(settings.db) as st:
            return {"ok": True, "app": "Memory_OB", "stats": st.stats()}

    # -- the home screen --------------------------------------------------------

    @app.get("/api/status")
    def status(st: Store = Depends(get_store)) -> dict[str, Any]:
        return _status(st)

    @app.get("/api/home")
    def home(st: Store = Depends(get_store)) -> dict[str, Any]:
        me = me_mod.build(st)
        due = [i for s in me["sections"] if s["key"] == "coming" for i in s["items"] if i.get("due")]
        return {
            "doubts": doubts_mod.list_doubts(st),
            "unsure": _unsure(st),
            "feed": feed_mod.build(st, limit=40),
            "due": due,
            "status": _status(st),
        }

    @app.get("/api/doubts")
    def list_doubts(st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"doubts": doubts_mod.list_doubts(st)}

    @app.post("/api/doubts/{doubt_id}/answer")
    def answer_doubt(
        doubt_id: str, payload: dict[str, Any], st: Store = Depends(get_store)
    ) -> dict[str, Any]:
        try:
            result = doubts_mod.answer(st, doubt_id, str(payload.get("answer") or ""), vault=settings.vault)
        except LookupError:
            raise _fail(404, "That question no longer exists.")
        except ValueError as exc:
            raise _fail(400, str(exc))
        _after_change(st)
        return result

    @app.get("/api/unsure")
    def list_unsure(st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"unsure": _unsure(st)}

    @app.post("/api/unsure/{fact_id}/keep")
    def keep_unsure(fact_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        result = manager.keep_unsure(st, fact_id, vault=settings.vault)
        _after_change(st)
        return result

    @app.post("/api/unsure/{fact_id}/skip")
    def skip_unsure(fact_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        return manager.skip_unsure(st, fact_id)

    @app.get("/api/feed")
    def feed(limit: int = 60, st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"feed": feed_mod.build(st, limit=max(1, min(limit, 500)))}

    @app.post("/api/undo/{seq}")
    def undo(seq: int, st: Store = Depends(get_store)) -> dict[str, Any]:
        try:
            result = manager.undo(st, seq, vault=settings.vault)
        except LookupError:
            raise _fail(404, "That change no longer exists.")
        _after_change(st)
        return result

    # -- telling Memory_OB things --------------------------------------------------

    def _do_capture(payload: dict[str, Any], st: Store, request: Request | None) -> dict[str, Any]:
        if _paused():
            return {"ok": False, "paused": True, "candidates": 0,
                    "message": "Memory is paused, so nothing was saved. Turn it back on in Settings."}
        text = str(payload.get("text") or "").strip()
        parts = payload.get("parts") or None
        if parts is not None:
            parts = [{"role": str(p.get("role", "user")), "content": str(p.get("content", ""))}
                     for p in parts if isinstance(p, dict)]
        if not text and not parts:
            raise _fail(400, "There is nothing to remember in that.")
        source = dict(payload.get("source") or {})
        source.setdefault("origin", str(payload.get("origin") or "api"))
        if payload.get("session"):
            source.setdefault("session", str(payload["session"]))
        out = manager.capture(
            st, text=text, parts=parts, source=source, model_call=_helper(), vault=settings.vault,
            guardrails=_guardrails(settings),
            actor=manager.AI,
        )
        if st.count_unprocessed_conversations() and _helper() is not None:
            reader.kick(settings)
        _after_change(st)
        total = out.saved + out.asked + out.unsure + out.waiting + out.duplicates
        return {"ok": True, "candidates": total, "message": manager.describe(out), **out.to_dict()}

    @app.post("/api/tell")
    def tell(payload: dict[str, Any], request: Request, st: Store = Depends(get_store)) -> dict[str, Any]:
        """The "tell me something" box: type anything and the AI files it."""
        return _do_capture({"text": payload.get("text"), "origin": "tell"}, st, request)

    @app.post("/api/capture")
    def capture(payload: dict[str, Any], request: Request, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Intake for the browser add-on and the Hermes plugin."""
        return _do_capture(payload, st, request)

    # -- memories ------------------------------------------------------------------

    @app.get("/api/records")
    def list_records(
        kind: str | None = None, status: str = "active", limit: int = 200,
        include_demo: bool = False, st: Store = Depends(get_store),
    ) -> list[dict[str, Any]]:
        # Forgotten memories stay out unless asked for (status=all). The exit
        # gate: neverSend and hazardous records never leave (§7).
        return exit.dicts_out(
            r.to_dict() for r in st.list_records(
                kind=kind, status=None if status == "all" else status, include_demo=include_demo, limit=limit,
            )
        )

    @app.get("/api/records/at")
    def records_at(when: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        """What was true at a point in time — the temporal query."""
        return {"when": when, "records": [r.to_dict() for r in st.records_valid_at(when)]}

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
        """Every version of a record, oldest first: what changed, who changed it, and why."""
        r = st.get_record(record_id)
        if r is None or not exit.keep(r):
            raise HTTPException(status_code=404, detail="record not found")
        return {"id": record_id, "versions": st.get_history(record_id)}

    @app.put("/api/records/{record_id}")
    def edit_record(record_id: str, payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        r = st.get_record(record_id)
        if r is None or not exit.keep(r):
            raise HTTPException(status_code=404, detail="That memory no longer exists.")
        body = payload.get("body")
        if body is not None and not str(body).strip():
            raise _fail(400, "A memory cannot be empty. Use Forget to remove it.")
        from . import topics

        category = payload.get("category")
        if category is not None and category not in topics.CATEGORIES:
            raise _fail(400, "That is not one of the categories.")
        saved = manager.edit_record(
            st, record_id, body=None if body is None else str(body), category=category, vault=settings.vault,
        )
        _after_change(st)
        return saved.to_dict() if saved else {}

    @app.delete("/api/records/{record_id}")
    def forget_record(record_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        r = st.get_record(record_id)
        if r is None or not exit.keep(r):
            raise HTTPException(status_code=404, detail="That memory no longer exists.")
        manager.forget_record(st, record_id, vault=settings.vault)
        _after_change(st)
        return {"ok": True}

    # -- search ------------------------------------------------------------

    @app.get("/api/search")
    def search(
        request: Request, q: str = Query(..., min_length=1), limit: int = 20, st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        cfg = ModelConfig.load(settings.models_path)
        hits = st.search_all(
            q, limit=limit, backend=models.resolve_backend(cfg), slot=cfg.slot("embed"),
            semantic=_app_semantic(settings),
        )
        results = exit.dicts_out(r.to_dict() for r in hits)
        low = q.lower()
        people = [
            {"id": p["id"], "name": p["name"], "relation": p["relation"]}
            for p in st.list_people(limit=100000)
            if low in p["name"].lower() or any(low in a.lower() for a in p["aliases"])
        ][:10]
        # §7: every time memory leaves for the AI, a receipt is kept. The
        # owner searching their own memory is not that.
        records = [h for h in hits if exit.keep(h)]
        if records and _caller(request) != "owner":
            _receipt(st, "ai:recall", records, purpose=f"search: {q[:80]}")
        if not results and not people:
            return {"query": q, "count": 0, "results": [], "people": [], "found": False,
                    "abstention": "Memory_OB has nothing on this. Say so rather than guessing."}
        return {"query": q, "count": len(results), "results": results, "people": people, "found": True}

    # -- the Vault screen ------------------------------------------------------------

    @app.get("/api/vault/notes")
    def vault_notes(q: str = "", st: Store = Depends(get_store)) -> dict[str, Any]:
        notes = vaultview.list_notes(st, settings.vault)
        linked_edges = vaultview.links(st, notes)
        linked = {e["source"] for e in linked_edges} | {e["target"] for e in linked_edges}
        shown = vaultview.filter_notes(notes, q, linked=linked)
        return {
            "notes": shown, "total": len(notes), "shown": len(shown),
            "tags": vaultview.tag_counts(notes), "folders": vaultview.folder_counts(notes),
            "categories": list(topics.CATEGORIES),
        }

    @app.get("/api/vault/note")
    def vault_note(path: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        try:
            return vaultview.read_note(st, settings.vault, path)
        except vaultview.NoteError as exc:
            raise _fail(404, str(exc))

    @app.put("/api/vault/note")
    def vault_save_note(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """Edit a note: a memory's words or category, or a person's profile."""
        path = str(payload.get("path") or "")
        try:
            note = vaultview.read_note(st, settings.vault, path)
        except vaultview.NoteError as exc:
            raise _fail(404, str(exc))
        if not note["editable"]:
            raise _fail(400, "This note is written automatically. Change the memories it is made from instead.")
        if note["type"] == vaultview.TYPE_MEMORY:
            body = payload.get("body")
            if body is not None and not str(body).strip():
                raise _fail(400, "A memory cannot be empty. Use Forget to remove it.")
            category = payload.get("category")
            if category is not None and category not in topics.CATEGORIES:
                raise _fail(400, "That is not one of the categories.")
            manager.edit_record(st, note["id"], body=None if body is None else str(body),
                                category=category, vault=settings.vault)
        else:
            manager.update_person(
                st, note["id"], vault=settings.vault,
                **{k: payload[k] for k in ("name", "relation", "notes") if k in payload},
            )
        _after_change(st)
        fresh = next((n for n in vaultview.list_notes(st, settings.vault) if n["id"] == note["id"]), None)
        return vaultview.read_note(st, settings.vault, fresh["path"]) if fresh else {}

    @app.get("/api/vault/graph")
    def vault_graph(
        q: str = "", tags: bool = False, people: bool = True, sources: bool = True, orphans: bool = True,
        st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        return vaultview.graph(
            st, settings.vault, q=q, show_tags=tags, show_people=people, show_sources=sources, show_orphans=orphans,
        )

    # -- connections the agent or owner draws between memories -----------------------

    @app.get("/api/graph")
    def graph(record_id: str | None = None, st: Store = Depends(get_store)) -> dict[str, Any]:
        data = st.graph(record_id=record_id)
        # The exit gate: an edge to a withheld record would reveal that it
        # exists (law 2), so edges are dropped when either end is withheld.
        visible = {n["id"] for n in data["nodes"]}
        edges = [e for e in data["edges"] if e["src"] in visible and e["dst"] in visible]
        return {"nodes": exit.dicts_out(data["nodes"]), "edges": edges, "count": len(edges)}

    @app.post("/api/graph/link")
    def link_records(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """A typed connection between two memories (supports, cites, ...)."""
        src, dst = str(payload.get("src") or ""), str(payload.get("dst") or "")
        label = str(payload.get("label") or "supports")
        if not src or not dst:
            raise _fail(400, "src and dst are required")
        if label not in GRAPH_LABELS:
            raise _fail(400, f"label must be one of {sorted(GRAPH_LABELS)}")
        if st.get_record(src) is None or st.get_record(dst) is None:
            raise _fail(404, "record not found")
        st.link(src, dst, label)
        return {"ok": True, "src": src, "dst": dst, "label": label}

    @app.post("/api/graph/unlink")
    def unlink_records(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        src, dst = str(payload.get("src") or ""), str(payload.get("dst") or "")
        if not src or not dst:
            raise _fail(400, "src and dst are required")
        st.unlink(src, dst)
        return {"ok": True}

    @app.post("/api/graph/rebuild")
    def rebuild_graph(request: Request = None, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Rebuild the disposable shared-tag connections."""
        n = st.rebuild_shared_edges()
        st.log_activity("graph_rebuild", f"{n} shared-tag edge(s)", actor=_caller(request))
        return {"rebuilt": n}

    # -- people ------------------------------------------------------------

    @app.get("/api/people")
    def list_people(st: Store = Depends(get_store)) -> dict[str, Any]:
        cards = sorted((_person_card(e) for e in _people_index(st)), key=lambda c: c["last"], reverse=True)
        return {"people": cards}

    @app.post("/api/people")
    def add_person(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise _fail(400, "A person needs a name.")
        person = manager.add_person(
            st, name, relation=str(payload.get("relation") or ""), notes=str(payload.get("notes") or ""),
            vault=settings.vault,
        )
        return person

    @app.get("/api/people/{person_id}")
    def get_person(person_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        index = _people_index(st)
        entry = next((e for e in index if e["id"] == person_id), None)
        if entry is None:
            raise _fail(404, "That person no longer exists.")
        from . import topics

        memories = [
            {"id": r.id, "text": r.body or r.title, "category": topics.category_of(r.tags, r.body or r.title),
             "created": r.created}
            for r in entry["memories"] if exit.keep(r)
        ]
        convs = sorted(entry["conversations"], key=lambda c: c["created"], reverse=True)
        for c in convs:
            c["platform"] = _platform(c["origin"])
        return {
            **_person_card(entry), "memory_list": memories, "conversation_list": convs,
            "others": [{"id": e["id"], "name": e["name"]} for e in index if e["id"] != person_id],
        }

    @app.put("/api/people/{person_id}")
    def edit_person(person_id: str, payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        fields: dict[str, Any] = {k: payload[k] for k in ("name", "relation", "notes") if k in payload}
        if "aliases" in payload:
            fields["aliases"] = [str(a) for a in (payload["aliases"] or [])]
        if "name" in fields and not str(fields["name"]).strip():
            raise _fail(400, "A person needs a name.")
        person = manager.update_person(st, person_id, vault=settings.vault, **fields)
        if person is None:
            raise _fail(404, "That person no longer exists.")
        return person

    @app.delete("/api/people/{person_id}")
    def remove_person(person_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        person = manager.delete_person(st, person_id, vault=settings.vault)
        if person is None:
            raise _fail(404, "That person no longer exists.")
        return {"ok": True}

    @app.post("/api/people/merge")
    def merge_people(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        keep_id, other_id = str(payload.get("keep_id") or ""), str(payload.get("other_id") or "")
        if not keep_id or not other_id or keep_id == other_id:
            raise _fail(400, "Pick two different people.")
        info = manager.merge_people(st, keep_id, other_id, vault=settings.vault)
        if info is None:
            raise _fail(404, "One of those people no longer exists.")
        return {"ok": True, "person": info["keep_after"]}

    @app.get("/api/conversations")
    def list_conversations(limit: int = 200, offset: int = 0, st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"conversations": st.list_conversations(limit=limit, offset=offset),
                "total": st.count_conversations(), "limit": limit, "offset": offset}

    @app.get("/api/conversations/{conv_id}")
    def get_conversation(conv_id: str, st: Store = Depends(get_store)) -> dict[str, Any]:
        c = st.get_conversation(conv_id)
        if c is None:
            raise HTTPException(status_code=404, detail="That conversation no longer exists.")
        c["platform"] = _platform(c.get("origin") or "")
        return c

    # -- me and the journal ------------------------------------------------------------

    @app.get("/api/me")
    def me(st: Store = Depends(get_store)) -> dict[str, Any]:
        return me_mod.build(st)

    def _entries(st: Store) -> list[dict[str, Any]]:
        from .journal import journal_entries

        out = []
        for r in journal_entries(st, limit=500):
            if not exit.keep(r):
                continue
            out.append({
                "id": r.id, "text": r.body or r.title, "day": (r.event_time or r.created or "")[:10],
                "by": "AI" if str(r.confirmed_by or "").startswith("ai@") else "you",
            })
        out.sort(key=lambda e: e["day"], reverse=True)
        return out

    def _bio_view(st: Store) -> dict[str, Any]:
        data = bio_mod.load(settings.vault)
        return {**data, "helper": _helper() is not None, "sensitive": _app_settings().bio_sensitive,
                "memories": st.stats()["active"]}

    @app.get("/api/journal")
    def journal(st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"biography": _bio_view(st), "entries": _entries(st)}

    @app.post("/api/journal/entry")
    def journal_entry(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        text = str(payload.get("text") or "").strip()
        if not text:
            raise _fail(400, "Write something first.")
        day = str(payload.get("day") or "").strip() or None
        if day is not None and (len(day) != 10 or day[4] != "-" or day[7] != "-"):
            raise _fail(400, "Use a date like 2026-03-14.")
        manager.add_journal_entry(st, text, day=day, vault=settings.vault)
        return {"entries": _entries(st)}

    @app.post("/api/journal/biography")
    def journal_biography(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        action = str(payload.get("action") or "rewrite")
        if action == "save":
            text = str(payload.get("text") or "").strip()
            if not text:
                raise _fail(400, "The biography cannot be empty. Use “Rewrite” to have it written again.")
            bio_mod.edit(settings.vault, text)
        elif action == "unlock":
            bio_mod.unlock(settings.vault)
        elif action == "rewrite":
            bio_mod.refresh(st, settings.vault, _helper(), include_sensitive=_app_settings().bio_sensitive, force=True)
        else:
            raise _fail(400, "Unknown action.")
        manager.refresh_vault(st, settings.vault)
        return _bio_view(st)

    # -- bringing things in -------------------------------------------------------------

    @app.post("/api/import")
    def import_memories(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """Bring in a file or pasted text. Files are copied untouched into Sources/Files first."""
        if _paused():
            raise _fail(409, "Memory is paused. Turn it back on in Settings first.")
        name = str(payload.get("name") or "pasted text")
        try:
            if payload.get("text"):
                parsed = importers.parse_text(str(payload["text"]))
            else:
                try:
                    data = base64.b64decode(str(payload.get("data_b64") or ""), validate=True)
                except Exception:
                    raise _fail(400, "I could not read that file.")
                parsed = importers.parse(name, data, me=str(payload.get("me") or ""))
                from .intake import intake_bytes

                intake_bytes(data, vault=settings.vault, name=name, source={"origin": name})
        except importers.ImportError_ as exc:
            raise _fail(400, str(exc))
        result: dict[str, Any] = {"source": parsed.source}
        notes_text = chats_text = ""
        if parsed.notes:
            res = manager.import_notes(
                st, parsed.notes, source_name=name, vault=settings.vault, guardrails=_guardrails(settings),
            )
            result["notes"] = res
            notes_text = (
                f"Brought in {res['saved']} memories"
                + (f", {res['duplicates']} were already known" if res["duplicates"] else "")
                + (f", {res['asked']} need your answer" if res["asked"] else "")
                + (f", {res['skipped']} skipped" if res["skipped"] else "") + "."
            )
        if parsed.chats:
            res = manager.store_chats(st, parsed.chats, source_name=parsed.source, vault=settings.vault)
            result["chats"] = res
            helper_on = _helper() is not None
            if helper_on:
                reader.kick(settings)
            people_note = f" {len(res['people'])} people found." if res["people"] else ""
            again = f" {res['already']} were already here." if res["already"] else ""
            chats_text = (
                f"Kept {res['conversations']} conversations from {parsed.source}.{again}{people_note} "
                + ("The AI is reading them now; this can take a while." if helper_on
                   else "They will be read once an AI helper is available.")
            )
        _after_change(st)
        result["message"] = " ".join(t for t in (notes_text, chats_text) if t)
        return result

    # -- settings -----------------------------------------------------------------

    def _ai_settings() -> dict[str, Any]:
        cfg = ModelConfig.load(settings.models_path)
        custom = cfg.main.provider not in ("auto", "", "hermes")
        from . import hermes as hermes_mod

        return {
            "mode": "custom" if custom else "auto",
            "address": cfg.main.base_url or models.DEFAULT_OLLAMA_URL,
            "reading_model": cfg.main.model if custom else "",
            "meaning_model": cfg.auxiliary.get("embed", ModelSlot()).model,
            "hermes_found": hermes_mod.available(),
            "status": _helper_status(cfg),
        }

    @app.get("/api/settings")
    def get_settings(st: Store = Depends(get_store)) -> dict[str, Any]:
        from . import hermes as hermes_mod, proxy as px

        app_s = _app_settings()
        try:
            backup_dir = Path(settings.vault) / ".brain" / "backups"
            backups = sorted((p.name for p in backup_dir.glob("*.zip")), reverse=True)[:5]
        except OSError:
            backups = []
        memory_path, user_path = hermes_mod.hermes_memory_paths()
        from .manifest import verify_manifest

        check = verify_manifest(settings.vault)
        return {
            "integrity": {"changed": check.get("changed", []), "missing": check.get("missing", [])},
            "ai": _ai_settings(),
            "options": {
                "semantic": app_s.semantic, "local_only": app_s.local_only,
                "sync_hermes": app_s.sync_hermes, "bio_sensitive": app_s.bio_sensitive,
            },
            "never_remember": app_s.guardrails,
            "paused": _paused(),
            "status": _status(st),
            "bridge": px.status(settings.vault) if hermes_mod.available() else None,
            "hermes_files": bool(memory_path and user_path),
            "vault": str(settings.vault),
            "backups": backups,
        }

    @app.post("/api/settings")
    def save_settings(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """Change one or more switches, or the "never remember" list."""
        from .nightshift import sync_hermes

        changes: dict[str, Any] = {}
        for key in ("semantic", "local_only", "bio_sensitive"):
            if key in payload:
                changes[key] = bool(payload[key])
        if "never_remember" in payload:
            if not isinstance(payload["never_remember"], list):
                raise _fail(400, "That is not a list of words.")
            changes["guardrails"] = payload["never_remember"]
        warning = ""
        if "sync_hermes" in payload:
            want = bool(payload["sync_hermes"])
            report = sync_hermes(st, settings, enabled=want)
            if report is None:
                if want:
                    raise _fail(400, "I could not find Hermes's memory files on this computer, so this cannot be turned on.")
                warning = "Hermes's memory files were not found, so there was nothing to clean up."
            changes["sync_hermes"] = want
        settings_mod.update(settings.vault, **changes)
        models.configure_local_only(settings.vault)
        out = get_settings(st)
        if warning:
            out["warning"] = warning
        return out

    @app.get("/api/settings/ai/models")
    def ai_models(address: str = "") -> dict[str, Any]:
        """The models installed on an Ollama server, so they can be picked rather than typed."""
        found = models.ollama_models(address.strip())
        return {"address": address.strip() or models.DEFAULT_OLLAMA_URL, "reachable": bool(found), "models": found}

    @app.post("/api/settings/ai")
    def save_ai(payload: dict[str, Any], st: Store = Depends(get_store)) -> dict[str, Any]:
        """Use Hermes's model automatically, or a model of the owner's own."""
        mode = str(payload.get("mode") or "auto")
        cfg = ModelConfig.load(settings.models_path)
        if mode == "auto":
            cfg.main = ModelSlot()
            cfg.auxiliary["embed"] = ModelSlot(model=str(payload.get("meaning_model") or "").strip())
        elif mode == "custom":
            model = str(payload.get("reading_model") or "").strip()
            address = str(payload.get("address") or "").strip() or models.DEFAULT_OLLAMA_URL
            if not model:
                raise _fail(400, "Pick which model to use.")
            if not address.startswith(("http://", "https://")):
                raise _fail(400, "The address should start with http:// or https://")
            cfg.main = ModelSlot(provider="ollama", model=model, base_url=address)
            cfg.auxiliary["embed"] = ModelSlot(provider="ollama", model=str(payload.get("meaning_model") or "").strip(),
                                               base_url=address)
        else:
            raise _fail(400, "Unknown choice.")
        settings.ensure_dirs()
        cfg.save(settings.models_path)
        return {"ai": _ai_settings(), "status": _status(st)}

    @app.post("/api/embed")
    def embed(payload: dict[str, Any] | None = None, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Prepare meaning search. Says plainly when no embedding model can be reached."""
        from .embedder import ensure_embeddings

        cfg = ModelConfig.load(settings.models_path)
        try:
            n = ensure_embeddings(
                st, backend=models.resolve_backend(cfg), slot=cfg.slot("embed"),
                limit=int((payload or {}).get("limit", 500)),
            )
        except Exception as exc:  # noqa: BLE001
            logger.info("embedding failed: %s", exc)
            n = 0
        cached = st.count_embeddings()
        if cached:
            message = f"Meaning search is ready for {cached} memories."
        else:
            message = ("I could not reach an embedding model, so search still works by words only. "
                       "Install one with “ollama pull nomic-embed-text” and try again.")
        return {"computed": n, "cached": cached, "message": message}

    @app.post("/api/tidy")
    def tidy(st: Store = Depends(get_store)) -> dict[str, Any]:
        """Do the night shift now: tidy the notes, refresh the biography, read what is waiting."""
        from . import nightshift

        steps = nightshift.run(settings, skip=("read",))
        started = bool(reader.kick(settings)) if _helper() is not None else False
        _after_change(st)
        return {"steps": steps, "reading": started, "status": _status(st)}

    @app.get("/api/anonymous")
    def anonymous_status() -> dict[str, Any]:
        from . import anonymous

        return {"anonymous": anonymous.is_anonymous(settings.vault), "state": anonymous.describe(settings.vault)}

    @app.post("/api/anonymous")
    def anonymous_set(payload: dict[str, Any]) -> dict[str, Any]:
        """Pause or resume memory (§7). Owner-run only."""
        from . import anonymous

        want = payload.get("anonymous")
        if want is None:
            return {"anonymous": anonymous.toggle(settings.vault)}
        anonymous.set_anonymous(settings.vault, bool(want))
        return {"anonymous": anonymous.is_anonymous(settings.vault), "state": anonymous.describe(settings.vault)}

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

    @app.post("/api/backup")
    def run_backup() -> dict[str, Any]:
        """Write a timestamped archive of the ledger and the notes."""
        import sys

        host_dir = Path(__file__).resolve().parent.parent / "host"
        if str(host_dir) not in sys.path:
            sys.path.insert(0, str(host_dir))
        try:
            from backup import create_backup
        except Exception as exc:
            raise HTTPException(500, f"Backup is not available: {exc}")
        path = create_backup(settings.vault)
        return {"backup": str(path), "name": path.name}

    # -- things the agent and the machinery use -----------------------------------------

    @app.get("/api/changes")
    def list_changes(limit: int = 100, st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"changes": st.list_changes(limit=limit)}

    @app.get("/api/activity")
    def activity(limit: int = 50, st: Store = Depends(get_store)) -> list[dict[str, Any]]:
        return st.activity(limit=limit)

    @app.get("/api/confirmations")
    def list_confirmations(st: Store = Depends(get_store)) -> dict[str, Any]:
        return {"confirmations": st.list_confirmations(status="pending", limit=50)}

    @app.post("/api/confirmations")
    def ask_confirmation(payload: dict[str, Any], request: Request, st: Store = Depends(get_store)) -> dict[str, Any]:
        """Raise a doubt: the agent asks the owner a yes/no question."""
        question = str(payload.get("question") or "").strip()
        if not question:
            raise _fail(400, "A question is needed.")
        return st.ask_confirmation(question=question, context=str(payload.get("context") or ""),
                                   created_by=_caller(request))

    @app.get("/api/intake")
    def intake_list() -> dict[str, Any]:
        """What is sitting in the intake folder, with its fingerprint."""
        from .intake import describe

        files = describe(settings.vault)
        return {"count": len(files), "files": files}

    @app.post("/api/intake")
    async def intake_upload(
        file: UploadFile = File(...), request: Request = None, st: Store = Depends(get_store),
    ) -> dict[str, Any]:
        """Byte-preserving intake: the raw file is copied unchanged (§10)."""
        from .intake import intake_bytes

        data = await file.read()
        result = intake_bytes(
            data, vault=settings.vault, name=file.filename or "upload",
            source={"origin": file.filename or "upload"},
        )
        st.log_activity("intake", f"{result['bytes']} bytes → {result['name']}", actor=_caller(request))
        return result

    @app.post("/api/intake/data")
    async def intake_data(payload: dict[str, Any]) -> dict[str, Any]:
        """Base64 intake for the host bridge, which cannot send multipart."""
        from .intake import intake_bytes

        name = str(payload.get("name") or "upload")
        try:
            data = base64.b64decode(payload.get("data_b64") or "")
        except Exception:
            raise HTTPException(400, "data_b64 is not valid base64")
        return intake_bytes(data, vault=settings.vault, name=name, source={"origin": name})

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
        return {"count": len(paths),
                "receipts": [{"file": p.name, "text": p.read_text(encoding="utf-8")} for p in paths]}

    @app.get("/api/doctor")
    def doctor() -> dict[str, Any]:
        """Every health check in one call — the same ones the CLI runs."""
        from .doctor import doctor as run_doctor

        return run_doctor(settings)

    @app.get("/api/neversend")
    def list_neversend() -> dict[str, Any]:
        """The ids of neverSend records — ids only, never text or counts (law 2)."""
        with Store(settings.db) as st:
            rows = st.conn.execute("SELECT id FROM records WHERE never_send = 1 ORDER BY created DESC").fetchall()
        return {"ids": [r["id"] for r in rows]}

    @app.post("/api/neversend/{record_id}")
    def clear_neversend(record_id: str, request: Request = None) -> dict[str, Any]:
        """Clear the neverSend flag on a record (owner decision, logged)."""
        with Store(settings.db) as st:
            rec = st.set_never_send(record_id, value=False, changed_by=_caller(request), reason="neversend_cleared")
            if rec is None:
                raise HTTPException(404, "record not found")
            st.log_activity("neversend_cleared", f"flag cleared on {record_id}", actor=_caller(request))
        return {"ok": True}

    return app


app = create_app()
