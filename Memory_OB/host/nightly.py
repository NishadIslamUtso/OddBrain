#!/usr/bin/env python3
"""The nightly run: dream, consistency sweep, vault export, sync.

One command, safe to schedule. Each step is independent — a failure in one
is reported and does not stop the others.

    python nightly.py            # everything
    python nightly.py --dry-run  # report what would run, change nothing

This is the job Windows Task Scheduler invokes (see schedule.py).
"""

from __future__ import annotations

import argparse
import sys
import traceback
from pathlib import Path

SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC.parent))

from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


def _step(name: str, fn) -> dict[str, str]:
    try:
        result = fn()
        return {"step": name, "ok": "yes", "detail": str(result)[:200]}
    except Exception as exc:  # one bad step must not stop the night
        traceback.print_exc()
        return {"step": name, "ok": "no", "detail": f"{type(exc).__name__}: {exc}"}


def run(*, dry_run: bool = False) -> list[dict[str, str]]:
    settings = Settings.resolve()
    settings.ensure_dirs()
    results: list[dict[str, str]] = []

    # dream
    def _dream() -> str:
        from memory_ob.dream import dream

        with Store(settings.db) as st:
            report = dream(st)
        return f"{len(report.get('cards', []))} card(s)"

    def _sweep() -> str:
        from memory_ob.consistency import sweep

        with Store(settings.db) as st:
            report = sweep(st)
        return (
            f"{report['links_checked']} link(s), "
            f"{len(report['dead_links'])} dead, "
            f"{len(report['contradictions'])} contradiction(s)"
        )

    def _export() -> str:
        from memory_ob.vault import export_all

        with Store(settings.db) as st:
            n = export_all(st, settings.vault)
        return f"{n} record(s)"

    def _sync() -> str:
        if not settings.sync_enabled:
            return "skipped (sync is off)"
        from memory_ob import sync
        from memory_ob.hermes import hermes_memory_paths

        memory_path, user_path = hermes_memory_paths()
        if not memory_path or not user_path:
            return "skipped (no Hermes memory files)"
        with Store(settings.db) as st:
            report = sync.sync_all(
                st,
                memory_path=memory_path,
                user_path=user_path,
                enabled=True,
            )
        return f"{report['synced']} confirmed record(s)"

    def _manifest() -> str:
        from memory_ob.manifest import write_manifest

        return f"{write_manifest(settings.vault)['count']} file(s)"

    steps = [("dream", _dream), ("sweep", _sweep), ("export", _export),
             ("manifest", _manifest), ("sync", _sync)]

    if dry_run:
        return [{"step": name, "ok": "dry", "detail": "would run"} for name, _ in steps]

    for name, fn in steps:
        results.append(_step(name, fn))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Nightly Memory_OB run")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    results = run(dry_run=args.dry_run)
    failed = [r for r in results if r["ok"] == "no"]
    for r in results:
        print(f"  {r['step']:8s} {r['ok']:4s} {r['detail']}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
