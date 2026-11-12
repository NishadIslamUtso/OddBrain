#!/usr/bin/env python3
"""The nightly run: read what is waiting, tidy the notes, refresh the biography.

One command, safe to schedule. Each step is independent — a failure in one
is reported and does not stop the others.

    python nightly.py            # everything
    python nightly.py --dry-run  # report what would run, change nothing

This is the job Windows Task Scheduler invokes (see schedule.py).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC.parent))

from memory_ob.config import Settings  # noqa: E402


def run(*, dry_run: bool = False) -> list[dict[str, str]]:
    """Run the night shift (see memory_ob.nightshift)."""
    from memory_ob import nightshift

    settings = Settings.resolve()
    return nightshift.run(settings, dry_run=dry_run)


def main() -> int:
    parser = argparse.ArgumentParser(description="Nightly Memory_OB run")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    results = run(dry_run=args.dry_run)
    failed = [r for r in results if r["ok"] == "no"]
    for r in results:
        print(f"  {r['step']:10s} {r['ok']:4s} {r['detail']}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
