"""Memory_OB command line interface.

    memory-ob init
    memory-ob capture "I prefer dark mode and I always use git"
    memory-ob search "dark mode"
    memory-ob list --kind note
    memory-ob show <id>
    memory-ob review                 # pending cards
    memory-ob approve <card-id>
    memory-ob deny <card-id> --note "not true"
    memory-ob graph
    memory-ob sweep
    memory-ob stats
    memory-ob activity
    memory-ob models
    memory-ob export
    memory-ob doctor                  # is this set up right?
    memory-ob serve                   # run the dashboard

The CLI is the owner's surface. Everything the agent does goes through the
same library calls — there is no back door.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from . import __version__
from .config import Settings
from .records import KINDS, STATUSES
from .store import Store


def _settings(args: argparse.Namespace) -> Settings:
    return Settings.resolve(vault=args.vault, db=args.db, models_path=args.models_path)


def _open(args: argparse.Namespace) -> Store:
    s = _settings(args)
    s.ensure_dirs()
    return Store(s.db)


def cmd_init(args: argparse.Namespace) -> int:
    s = _settings(args)
    s.ensure_dirs()
    st = Store(s.db)
    st.log_activity("init", f"vault={s.vault}", actor="owner")
    st.close()
    print(f"Memory_OB initialised")
    print(f"  vault: {s.vault}")
    print(f"  store: {s.db}")
    return 0


def cmd_capture(args: argparse.Namespace) -> int:
    from .extract import extract_claims
    from .models import ModelConfig, model_call

    st = _open(args)
    raw = args.text
    text = " ".join(raw) if isinstance(raw, list) else str(raw)
    source = {"input": text, "origin": args.origin or "cli"}

    call = None
    if not args.no_model:
        s = _settings(args)
        call = model_call("extract", ModelConfig.load(s.models_path))
    cands = extract_claims(text, source=source, model_call=call)
    if not cands:
        print("No claims extracted.")
        st.close()
        return 0
    for c in cands:
        st.add_fact(c.text, trust=c.trust, source=c.source)
    st.log_activity("capture", f"{len(cands)} candidate(s)", actor="owner")
    print(f"Captured {len(cands)} candidate fact(s):")
    for c in cands:
        print(f"  [{c.trust:.2f}] {c.kind_hint:8s} {c.text}")
    st.close()
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    from .models import ModelConfig, resolve_backend

    st = _open(args)
    cfg = ModelConfig.load(_settings(args).models_path)
    hits = st.search_all(
        args.query,
        limit=args.limit,
        backend=resolve_backend(cfg),
        slot=cfg.slot("embed"),
    )
    facts = st.search_facts(args.query, limit=args.limit)
    if not hits and not facts:
        print("No matches.")
        st.close()
        return 0
    if hits:
        print(f"{len(hits)} record(s) for {args.query!r}:")
        for r in hits:
            print(f"  [{r.id}] {r.kind}/{r.status} ({r.trust:.2f}) {r.title}")
            if r.body:
                print(f"      {r.body[:120]}")
    if facts:
        print(f"{len(facts)} candidate fact(s) (UNVERIFIED):")
        for f in facts:
            print(f"  [{f['trust']:.2f}] {f['text'][:120]}")
    st.close()
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    st = _open(args)
    recs = st.list_records(
        kind=args.kind, status=args.status, include_private=args.include_private
    )
    if not recs:
        print("No records.")
        st.close()
        return 0
    print(f"{len(recs)} record(s):")
    for r in recs:
        flag = " [private]" if r.never_send else ""
        print(f"  [{r.id}] {r.kind}/{r.status} ({r.trust:.2f}){flag} {r.title}")
    st.close()
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    st = _open(args)
    r = st.get_record(args.id)
    if r is None:
        print(f"No record {args.id!r}")
        st.close()
        return 1
    print(json.dumps(r.to_dict(), indent=2, ensure_ascii=False))
    hist = st.get_history(r.id)
    if len(hist) > 1:
        print(f"\nhistory: {len(hist)} version(s)")
        for h in hist:
            print(f"  v{h['version']} {h['changed_at']} {h['changed_by'] or '-'} {h['reason'] or ''}")
    st.close()
    return 0


def cmd_review(args: argparse.Namespace) -> int:
    from .review import CardStore

    st = _open(args)
    cs = CardStore(st)
    cards = cs.list(status=args.status, type=args.type)
    if not cards:
        print("No cards.")
        st.close()
        return 0
    print(f"{len(cards)} card(s):")
    for c in cards:
        speakers = f" speakers={','.join(c.speakers)}" if c.speakers else ""
        print(f"  [{c.id}] {c.type}/{c.status}{speakers} {c.title}")
        if c.body:
            print(f"      {c.body[:160]}")
    st.close()
    return 0


def cmd_resolve(args: argparse.Namespace, action: str) -> int:
    from .review import CardStore

    st = _open(args)
    cs = CardStore(st)
    card = cs.resolve(
        args.card_id, action, by="owner", note=args.note, edit=None
    )
    if card is None:
        print(f"No card {args.card_id!r}")
        st.close()
        return 1
    print(f"{card.type} card {card.id} → {card.resolution or 'pending'}")
    st.close()
    return 0


def cmd_graph(args: argparse.Namespace) -> int:
    st = _open(args)
    edges = st.edges(args.id)
    if not edges:
        print("No edges.")
        st.close()
        return 0
    print(f"{len(edges)} edge(s):")
    for src, dst, label in edges:
        print(f"  {src} --{label}--> {dst}")
    st.close()
    return 0


def cmd_sweep(args: argparse.Namespace) -> int:
    from .consistency import sweep

    st = _open(args)
    report = sweep(st)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    st.close()
    return 0


def cmd_dream(args: argparse.Namespace) -> int:
    """Run the nightly consolidation and open tomorrow's cards."""
    from .dream import dream

    st = _open(args)
    report = dream(st)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    st.close()
    return 0


def cmd_chapter(args: argparse.Namespace) -> int:
    """Draft a Life Story chapter from confirmed owner records."""
    from .journal import chapter_to_card, draft_chapter
    from .models import ModelConfig, model_call
    from .review import CardStore

    st = _open(args)
    call = None
    if not args.no_model:
        call = model_call("chapter", ModelConfig.load(_settings(args).models_path))
    chapter = draft_chapter(st, title=args.title, model_call=call)
    if chapter is None:
        print("No confirmed owner records yet — nothing to draft from.")
        st.close()
        return 0
    card = CardStore(st).propose_record(
        new=chapter_to_card(chapter), title=chapter.title, body=chapter.body
    )
    print(f"Drafted chapter: {chapter.title}")
    print(f"  cited records: {len(chapter.cited_ids)}")
    print(f"  quotation: {chapter.quotation or '(none)'}")
    print(f"  proposal card: {card.id}")
    st.close()
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    """Compute and cache embeddings for records that lack them."""
    from .embedder import ensure_embeddings
    from .models import ModelConfig, resolve_backend

    st = _open(args)
    cfg = ModelConfig.load(_settings(args).models_path)
    n = ensure_embeddings(
        st, backend=resolve_backend(cfg), slot=cfg.slot("embed"), limit=args.limit
    )
    print(f"Computed {n} embedding(s); {st.count_embeddings()} cached.")
    st.close()
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    st = _open(args)
    print(json.dumps(st.stats(), indent=2))
    st.close()
    return 0


def cmd_activity(args: argparse.Namespace) -> int:
    st = _open(args)
    for row in st.activity(limit=args.limit):
        who = row["actor"] or "-"
        print(f"  {row['at']} {who:10s} {row['action']:20s} {row['detail'] or ''}")
    st.close()
    return 0


def cmd_models(args: argparse.Namespace) -> int:
    from .models import ModelConfig, backend_name, is_available, resolve_backend

    s = _settings(args)
    cfg = ModelConfig.load(s.models_path)
    print(cfg.describe())
    print()
    backend = resolve_backend(cfg)
    print(f"backend: {backend.name}")
    if backend.name == "hermes":
        from . import hermes

        print(f"hermes proxy: {'up' if hermes.proxy_available() else 'down'}")
        print(f"hermes main model: {hermes.main_slot().get('model') or '(default)'}")
        print("  start the proxy with: hermes proxy start")
    else:
        print(f"local ollama: {'available' if is_available(cfg.slot('embed')) else 'not reachable'}")
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    from .vault import export_all

    st = _open(args)
    s = _settings(args)
    n = export_all(st, s.vault)
    print(f"Exported {n} record(s) to {s.vault}")
    st.close()
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """Every health check, in one pass."""
    from .doctor import run_checks

    s = _settings(args)
    report = run_checks(s)
    for c in report.checks:
        mark = "OK  " if c.ok else ("WARN" if c.severity == "warn" else "FAIL")
        print(f"  [{mark}] {c.name:12s} {c.detail}")
        if not c.ok and c.fix:
            print(f"         fix: {c.fix}")
    print()
    if report.ok:
        print(f"All {len(report.checks)} checks passed.")
        if report.warnings:
            print(f"{len(report.warnings)} note(s) above — nothing is wrong.")
        return 0
    print(f"{len(report.failures)} of {len(report.checks)} checks failed.")
    return 1


def cmd_serve(args: argparse.Namespace) -> int:
    """Run the dashboard."""
    import uvicorn

    from .api import configure, create_app

    configure(_settings(args))
    app = create_app()
    host = args.host
    port = args.port
    print(f"Memory_OB dashboard on http://{host}:{port}/ui")
    print("Press Ctrl+C to stop.")
    try:
        uvicorn.run(app, host=host, port=port, log_level=args.log_level)
    except KeyboardInterrupt:
        pass
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="memory-ob",
        description="Memory_OB — capture anything, trust as a score, truth by signature.",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    p.add_argument("--vault", help="vault folder (default: Documents/Hermes/Memory_OB)")
    p.add_argument("--db", help="SQLite store path")
    p.add_argument("--models-path", help="model selector JSON path")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create the vault folders and store").set_defaults(fn=cmd_init)

    c = sub.add_parser("capture", help="extract candidate facts from text")
    c.add_argument("text", nargs="+", help="text to capture")
    c.add_argument("--origin", help="where this text came from")
    c.add_argument(
        "--no-model",
        action="store_true",
        help="use the built-in heuristic instead of the configured model",
    )
    c.set_defaults(fn=cmd_capture)

    s = sub.add_parser("search", help="full-text search")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    l = sub.add_parser("list", help="list records")
    l.add_argument("--kind", choices=KINDS)
    l.add_argument("--status", choices=STATUSES)
    l.add_argument("--include-private", action="store_true")
    l.set_defaults(fn=cmd_list)

    sh = sub.add_parser("show", help="show one record")
    sh.add_argument("id")
    sh.set_defaults(fn=cmd_show)

    r = sub.add_parser("review", help="list review cards")
    r.add_argument("--type", choices=("diff", "proposal", "ask", "merge"))
    r.add_argument("--status", default="pending")
    r.set_defaults(fn=cmd_review)

    for name, help_text in (
        ("approve", "approve a card"),
        ("deny", "deny a card"),
        ("later", "leave a card pending"),
    ):
        a = sub.add_parser(name, help=help_text)
        a.add_argument("card_id")
        a.add_argument("--note")
        a.set_defaults(fn=lambda args, _n=name: cmd_resolve(args, _n))

    g = sub.add_parser("graph", help="show graph edges")
    g.add_argument("id", nargs="?")
    g.set_defaults(fn=cmd_graph)

    sw = sub.add_parser("sweep", help="run the consistency sweep")
    sw.set_defaults(fn=cmd_sweep)

    dr = sub.add_parser("dream", help="run the nightly consolidation")
    dr.set_defaults(fn=cmd_dream)

    ch = sub.add_parser("chapter", help="draft a Life Story chapter")
    ch.add_argument("--title", default="Untitled chapter")
    ch.add_argument(
        "--no-model",
        action="store_true",
        help="use the built-in chronology instead of the configured model",
    )
    ch.set_defaults(fn=cmd_chapter)

    em = sub.add_parser("embed", help="compute and cache embeddings")
    em.add_argument("--limit", type=int, default=200)
    em.set_defaults(fn=cmd_embed)

    st = sub.add_parser("stats", help="store statistics")
    st.set_defaults(fn=cmd_stats)

    ac = sub.add_parser("activity", help="activity log")
    ac.add_argument("--limit", type=int, default=30)
    ac.set_defaults(fn=cmd_activity)

    m = sub.add_parser("models", help="show the model selector")
    m.set_defaults(fn=cmd_models)

    e = sub.add_parser("export", help="export records to the vault")
    e.set_defaults(fn=cmd_export)

    doc = sub.add_parser("doctor", help="check that the setup is healthy")
    doc.set_defaults(fn=cmd_doctor)

    sv = sub.add_parser("serve", help="run the dashboard")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8770)
    sv.add_argument("--log-level", default="info")
    sv.set_defaults(fn=cmd_serve)

    return p


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.fn(args))
    except KeyboardInterrupt:
        return 130
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
