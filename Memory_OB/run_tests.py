#!/usr/bin/env python3
"""Run the whole Memory_OB test suite with one command.

    python run_tests.py            # everything
    python run_tests.py -v         # verbose

Runs the trap suite (the laws), the pipeline tests, and the whole-car
acceptance suite that drives the real CLI and HTTP surface end to end.
Exits non-zero if anything fails.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run_suite(pattern: str, verbosity: int) -> int:
    cmd = [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", pattern]
    if verbosity > 1:
        cmd.append("-v")
    print(f"\n=== {pattern} ===")
    proc = subprocess.run(cmd, cwd=str(ROOT))
    return proc.returncode


def lint() -> int:
    """Compile-check every module (no third-party linter needed)."""
    print("\n=== compile check ===")
    cmd = [sys.executable, "-m", "compileall", "-q", "memory_ob", "tests"]
    proc = subprocess.run(cmd, cwd=str(ROOT))
    if proc.returncode != 0:
        print("compile check FAILED")
    else:
        print("compile check OK")
    return proc.returncode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-v", "--verbose", action="count", default=1)
    args = ap.parse_args()

    os.chdir(ROOT)
    failures = 0
    failures += lint()
    failures += run_suite("test_laws.py", args.verbose)
    failures += run_suite("test_pipeline.py", args.verbose)
    failures += run_suite("test_hermes_bridge.py", args.verbose)
    failures += run_suite("test_search_and_wiring.py", args.verbose)
    failures += run_suite("test_end_to_end.py", args.verbose)

    print()
    if failures:
        print(f"FAILED ({failures} suite(s) failed)")
        return 1
    print("All suites green.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
