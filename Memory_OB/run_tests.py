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
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_modules() -> list[str]:
    """Every ``test_*.py`` under tests/, sorted for a stable order.

    A test file that exists but is not listed is a test file that does not
    run — that is how the provider, anonymous, exit, graph, integrity, demo,
    sync and model-slot suites went unnoticed for a whole round.
    """
    tests = ROOT / "tests"
    if not tests.is_dir():
        return []
    return sorted(p.name for p in tests.glob("test_*.py"))


def run_suite(pattern: str, verbosity: int) -> int:
    # ``-t .`` makes ``tests`` a package, so ``tests/__init__.py`` is imported
    # before any test module. That matters: it installs the Hermes stub on
    # sys.path, and without it the provider tests fail on any machine that is
    # not itself a Hermes install.
    cmd = [
        sys.executable, "-m", "unittest", "discover",
        "-s", "tests", "-t", ".", "-p", pattern,
    ]
    if verbosity > 1:
        cmd.append("-v")
    print(f"\n=== {pattern} ===")
    proc = subprocess.run(cmd, cwd=str(ROOT))
    return proc.returncode


def lint() -> int:
    """Compile-check every module (no third-party linter needed)."""
    print("\n=== compile check ===")
    cmd = [
        sys.executable, "-m", "compileall", "-q",
        "memory_ob", "provider", "host", "tests",
    ]
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

    # Point the settings layer at a throwaway vault and database for the whole
    # run. Individual tests set their own, but this is the belt to their braces:
    # a test that forgets to isolate can never reach the owner's real memory.
    scratch = Path(os.environ.get("MEMORY_OB_TEST_HOME", "")) or (
        Path(tempfile.gettempdir()) / "memory-ob-tests"
    )
    scratch.mkdir(parents=True, exist_ok=True)
    os.environ["MEMORY_OB_VAULT"] = str(scratch / "vault")
    os.environ["MEMORY_OB_DB"] = str(scratch / "mob.db")

    modules = test_modules()
    if not modules:
        print("no test modules found under tests/")
        return 1

    failures = 0
    failures += lint()
    for name in modules:
        failures += run_suite(name, args.verbose)

    print()
    print(f"{len(modules)} suite(s) run")
    if failures:
        print(f"FAILED ({failures} suite(s) failed)")
        return 1
    print("All suites green.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
