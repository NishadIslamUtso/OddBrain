"""Memory_OB command line.

    memory-ob init
    memory-ob capture "I prefer dark mode and I always use git"
    memory-ob search "dark mode"
    memory-ob list --kind note
    memory-ob show <id>
    memory-ob feed                    # what was remembered or changed lately
    memory-ob doubts                  # questions waiting for your answer
    memory-ob answer <id> <choice>    # e.g. new / old / both, yes / no
    memory-ob undo <number>           # take back one thing in the feed
    memory-ob graph                   # connections between memories
    memory-ob import <file>           # bring in ChatGPT / Claude / WhatsApp / notes
    memory-ob tidy                    # the nightly clean-up, right now
    memory-ob stats
    memory-ob activity
    memory-ob models
    memory-ob export                  # rewrite every note in the vault
    memory-ob doctor                  # is this set up right?
    memory-ob serve                   # run the dashboard

Everything here goes through the same library calls the dashboard uses, so a
memory saved from the command line is filed, checked for conflicts and
undoable exactly like one told to the app.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from . import __version__
from .config import Settings
from .records import KINDS, STATUSES
from .store import Store


def _settings(args: argparse.Namespace) -> Settings:
    return Settings.resolve(vault=args.vault, db=args.db, models_path=args.models_path)


def _open(args: argparse.Namespace) -> Store:
    from . import startup

    s = _settings(args)
    startup.prepare(s)
    return Store(s.db)


def _guardrails(s: Settings) -> list[str]:
    from . import settings as app_settings

    try:
        return list(app_settings.load(s.vault).guardrails or [])
    except Exception:  # noqa: BLE001
        return []


def cmd_init(args: argparse.Namespace) -> int:
    from . import startup

    s = _settings(args)
    startup.prepare(s)
    st = Store(s.db)
    st.log_activity("init", f"vault={s.vault}", actor="owner")
    st.close()
    print("Memory_OB is ready")
    print(f"  vault: {s.vault}")
    print(f"  store: {s.db}")
    return 0


def cmd_capture(args: argparse.Namespace) -> int:
    from . import anonymous, manager, models
    from .models import ModelConfig

    s = _settings(args)
    if anonymous.is_anonymous(s.vault):
        print("Memory is paused, so nothing was saved. Turn it back on in Settings.")
        return 1
    st = _open(args)
    raw = args.text
    text = " ".join(raw) if isinstance(raw, list) else str(raw)
    call = None if args.no_model else models.helper(ModelConfig.load(s.models_path), "extract")
    out = manager.capture(
        st, text=text, source={"origin": args.origin or "command line"}, model_call=call,
        vault=s.vault, guardrails=_guardrails(s), actor=manager.OWNER,
        reason="you told me on the command line",
    )
    print(manager.describe(out))
    for rid in out.record_ids:
        rec = st.get_record(rid)
        if rec is not None:
            print(f"  + {rec.title}")
    if out.asked:
        print(f"{out.asked} answer(s) changed from before — see: memory-ob doubts")
    st.close()
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    from . import exit as exit_gate
    from . import models
    from .models import ModelConfig

    s = _settings(args)
    st = _open(args)
    cfg = ModelConfig.load(s.models_path)
    hits = [
        r for r in st.search_all(
            args.query, limit=args.limit, backend=models.resolve_backend(cfg), slot=cfg.slot("embed"),
        )
        if exit_gate.keep(r)
    ]
    if not hits:
        print("Memory_OB has nothing on that.")
        st.close()
        return 0
    print(f"{len(hits)} match(es) for {args.query!r}:")
    for r in hits:
        print(f"  [{r.id}] {r.kind} {r.title}")
        if r.body:
            print(f"      {r.body[:120]}")
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
        print(f"  [{r.id}] {r.kind}/{r.status}{flag} {r.title}")
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


def cmd_feed(args: argparse.Namespace) -> int:
    from . import feed

    st = _open(args)
    items = feed.build(st, limit=args.limit)
    if not items:
        print("Nothing remembered yet.")
        st.close()
        return 0
    for it in items:
        mark = "  (undone)" if it["undone"] else ""
        print(f"  #{it['seq']:<4} {it['verb']}: {it['text'][:100]}{mark}")
        if it["was"]:
            print(f"         was: {it['was'][:100]}")
    st.close()
    return 0


def cmd_doubts(args: argparse.Namespace) -> int:
    from . import doubts

    st = _open(args)
    items = doubts.list_doubts(st)
    if not items:
        print("Nothing needs your answer.")
        st.close()
        return 0
    for d in items:
        print(f"  [{d['id']}] {d['title']}")
        if d.get("before"):
            print(f"      before: {d['before'][:120]}")
        if d.get("after"):
            print(f"      now:    {d['after'][:120]}")
        elif d.get("question"):
            print(f"      {d['question'][:160]}")
        print("      answer with: memory-ob answer " + d["id"] + " " + "|".join(o["key"] for o in d["options"]))
    st.close()
    return 0


def cmd_answer(args: argparse.Namespace) -> int:
    from . import doubts

    s = _settings(args)
    st = _open(args)
    try:
        result = doubts.answer(st, args.id, args.choice, vault=s.vault)
    except (LookupError, ValueError) as exc:
        print(str(exc))
        st.close()
        return 1
    print("That one was already answered." if result.get("result") == "gone" else "Done.")
    st.close()
    return 0


def cmd_undo(args: argparse.Namespace) -> int:
    from . import manager

    s = _settings(args)
    st = _open(args)
    try:
        result = manager.undo(st, args.number, vault=s.vault)
    except (LookupError, ValueError) as exc:
        print(str(exc))
        st.close()
        return 1
    said = {
        "undone": "Undone.",
        "already": "That was already undone.",
        "gone": "That memory is already gone, so there is nothing to undo.",
        "changed_since": "That has been changed again since, so it cannot be undone safely.",
    }
    print(said.get(result.get("result", ""), "Done."))
    st.close()
    return 0 if result.get("result") in ("undone", "already") else 1


def cmd_graph(args: argparse.Namespace) -> int:
    st = _open(args)
    edges = st.edges(args.id)
    if not edges:
        print("No connections.")
        st.close()
        return 0
    print(f"{len(edges)} connection(s):")
    for src, dst, label in edges:
        print(f"  {src} --{label}--> {dst}")
    st.close()
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    from . import importers, manager, models
    from .intake import intake_bytes
    from .models import ModelConfig

    s = _settings(args)
    path = Path(args.file).expanduser()
    if not path.is_file():
        print(f"I could not find {path}")
        return 1
    data = path.read_bytes()
    try:
        parsed = importers.parse(path.name, data, me=args.me or "")
    except importers.ImportError_ as exc:
        print(str(exc))
        return 1
    st = _open(args)
    intake_bytes(data, vault=s.vault, name=path.name, source={"origin": path.name})
    if parsed.notes:
        res = manager.import_notes(
            st, parsed.notes, source_name=path.name, vault=s.vault, guardrails=_guardrails(s),
        )
        print(f"Brought in {res['saved']} memories ({res['duplicates']} already known, "
              f"{res['asked']} need your answer, {res['skipped']} skipped).")
    if parsed.chats:
        res = manager.store_chats(st, parsed.chats, source_name=parsed.source, vault=s.vault)
        print(f"Kept {res['conversations']} conversations from {parsed.source} "
              f"({res['already']} were already here); {len(res['people'])} people found.")
        if models.helper(ModelConfig.load(s.models_path), "extract") is None:
            print("They will be read once an AI helper is available (memory-ob tidy).")
    st.close()
    return 0


def cmd_tidy(args: argparse.Namespace) -> int:
    from . import nightshift

    s = _settings(args)
    from . import startup

    startup.prepare(s)
    for row in nightshift.run(s, dry_run=args.dry_run):
        print(f"  {row['step']:10s} {row['ok']:4s} {row.get('detail', '')}")
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
    from .models import ModelConfig, is_available, resolve_backend

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
    from .vault import rebuild

    st = _open(args)
    s = _settings(args)
    result = rebuild(st, s.vault)
    print(f"Wrote {result['notes']} note(s) to {s.vault}")
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


def cmd_proxy(args: argparse.Namespace) -> int:
    """The Hermes proxy — the difference between a judge and a keyword matcher."""
    from . import proxy as px

    s = _settings(args)
    vault = s.vault

    if args.action == "status":
        st = px.status(vault)
        print(f"  proxy:      {'running' if st['running'] else 'stopped'}  ({st['url']})")
        print(f"  ask at logon: {'yes' if st['ask_at_startup'] else 'no'}"
              + (f", remembered: {st['last_choice']}" if st["remember"] else ""))
        if not st["proxy_available"]:
            print("  hermes:     not found — set HERMES_HOME or HERMES_EXE")
        return 0

    if args.action == "start":
        ok = px.start()
        print("proxy started." if ok else "could not start the proxy.")
        return 0 if ok else 1

    if args.action == "stop":
        ok = px.stop()
        print("proxy stopped." if ok else "could not stop the proxy.")
        return 0 if ok else 1

    if args.action == "prompt":
        choice = px.prompt_and_start(vault)
        print(f"choice: {choice}")
        return 0

    return 0


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
        description="Memory_OB — tell it anything; it files, checks and remembers.",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    p.add_argument("--vault", help="vault folder (default: Documents/Hermes/Memory_OB)")
    p.add_argument("--db", help="SQLite store path")
    p.add_argument("--models-path", help="model settings JSON path")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create the vault and store").set_defaults(fn=cmd_init)

    c = sub.add_parser("capture", help="tell Memory_OB something")
    c.add_argument("text", nargs="+", help="what to remember")
    c.add_argument("--origin", help="where this came from")
    c.add_argument(
        "--no-model",
        action="store_true",
        help="use the built-in rules instead of the AI helper",
    )
    c.set_defaults(fn=cmd_capture)

    s = sub.add_parser("search", help="search what is remembered")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    l = sub.add_parser("list", help="list memories")
    l.add_argument("--kind", choices=KINDS)
    l.add_argument("--status", choices=STATUSES)
    l.add_argument("--include-private", action="store_true")
    l.set_defaults(fn=cmd_list)

    sh = sub.add_parser("show", help="show one memory")
    sh.add_argument("id")
    sh.set_defaults(fn=cmd_show)

    fd = sub.add_parser("feed", help="what was remembered or changed lately")
    fd.add_argument("--limit", type=int, default=30)
    fd.set_defaults(fn=cmd_feed)

    d = sub.add_parser("doubts", help="questions waiting for your answer")
    d.set_defaults(fn=cmd_doubts)

    an = sub.add_parser("answer", help="answer one question")
    an.add_argument("id")
    an.add_argument("choice", help="new / old / both, yes / no, merge / dismiss ...")
    an.set_defaults(fn=cmd_answer)

    un = sub.add_parser("undo", help="take back one thing from the feed")
    un.add_argument("number", type=int, help="the # shown in the feed")
    un.set_defaults(fn=cmd_undo)

    g = sub.add_parser("graph", help="show the connections between memories")
    g.add_argument("id", nargs="?")
    g.set_defaults(fn=cmd_graph)

    im = sub.add_parser("import", help="bring in a ChatGPT, Claude or WhatsApp export, or a notes file")
    im.add_argument("file")
    im.add_argument("--me", help="your name as it appears in a WhatsApp export")
    im.set_defaults(fn=cmd_import)

    ti = sub.add_parser("tidy", help="run the nightly clean-up now")
    ti.add_argument("--dry-run", action="store_true")
    ti.set_defaults(fn=cmd_tidy)

    em = sub.add_parser("embed", help="compute and cache meaning-search data")
    em.add_argument("--limit", type=int, default=200)
    em.set_defaults(fn=cmd_embed)

    st = sub.add_parser("stats", help="store statistics")
    st.set_defaults(fn=cmd_stats)

    ac = sub.add_parser("activity", help="activity log")
    ac.add_argument("--limit", type=int, default=30)
    ac.set_defaults(fn=cmd_activity)

    m = sub.add_parser("models", help="show the AI helper settings")
    m.set_defaults(fn=cmd_models)

    e = sub.add_parser("export", help="rewrite every note in the vault")
    e.set_defaults(fn=cmd_export)

    doc = sub.add_parser("doctor", help="check that the setup is healthy")
    doc.set_defaults(fn=cmd_doctor)

    sv = sub.add_parser("serve", help="run the dashboard")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8770)
    sv.add_argument("--log-level", default="info")
    sv.set_defaults(fn=cmd_serve)

    px = sub.add_parser("proxy", help="the Hermes proxy the AI helper uses")
    px.add_argument(
        "action",
        choices=("status", "start", "stop", "prompt"),
        default="status",
        nargs="?",
    )
    px.set_defaults(fn=cmd_proxy)

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
