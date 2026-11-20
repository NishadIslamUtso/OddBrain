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
import time
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
    if proc.returncode != 0:
        print(f"FAILED SUITE: {pattern}")
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
    scratch = Path(os.environ.get("MEMORY_OB_TEST_HOME", ""))
    if scratch:
        scratch.mkdir(parents=True, exist_ok=True)
    else:
        # A fresh scratch every run: leftovers from an earlier run can never
        # change what this run sees (owner item E4).
        scratch = Path(tempfile.mkdtemp(prefix="memory-ob-tests-"))
    os.environ["MEMORY_OB_VAULT"] = str(scratch / "vault")
    os.environ["MEMORY_OB_DB"] = str(scratch / "mob.db")
    os.environ["MEMORY_OB_NO_PROBE_CACHE"] = "1"   # tests flip "is an AI there?" on purpose

    modules = test_modules()
    if not modules:
        print("no test modules found under tests/")
        return 1

    failures = 0
    failures += lint()
    # Every run leaves one plain line per suite in test-runs.log (next to this
    # file), so when a suite fails once in a while, the log names which one
    # (owner item E4).
    log = ROOT / "test-runs.log"
    for name in modules:
        started = time.monotonic()
        rc = run_suite(name, args.verbose)
        seconds = time.monotonic() - started
        with log.open("a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} "
                     f"{'ok  ' if rc == 0 else 'FAIL'} {seconds:6.1f}s {name}\n")
        failures += rc

    print()
    print(f"{len(modules)} suite(s) run")
    if failures:
        print(f"FAILED ({failures} suite(s) failed)")
        return 1
    print("All suites green.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
