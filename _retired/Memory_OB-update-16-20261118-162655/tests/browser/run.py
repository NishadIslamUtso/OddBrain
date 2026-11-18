"""Run the browser checks: a fresh server and a fresh seeded vault for every script.

    python tests/browser/run.py              # all scripts
    python tests/browser/run.py ui_flow      # just one (name without .js)

Needs Node, Playwright and a Chromium for it:
    npm install -g playwright && npx playwright install chromium
Screenshots go to tests/browser/shots/ (ignored by the release).
This is not part of run_tests.py because it needs a browser.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = ["ui_flow", "ui_audit", "ui_race", "ui_vault", "ui_summary", "ui_checkup", "ui_owner", "ui_waiting", "ui_phone"]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def node_path() -> str:
    npm = shutil.which("npm")
    if not npm:
        return os.environ.get("NODE_PATH", "")
    root = subprocess.run([npm, "root", "-g"], capture_output=True, text=True, check=False).stdout.strip()
    return os.pathsep.join(p for p in (root, os.environ.get("NODE_PATH", "")) if p)


def run_one(name: str) -> bool:
    tmp = tempfile.mkdtemp(prefix="mo_browser_")
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    mode_file = os.path.join(tmp, "ai-mode")     # a script writes ok / down / junk here to change the stand-in AI
    server = subprocess.Popen([sys.executable, str(HERE / "server.py"), str(port), tmp],
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                              env=dict(os.environ, FAKE_AI_FILE=mode_file))
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/ui", timeout=1).read()
                break
            except Exception:  # noqa: BLE001
                if server.poll() is not None:
                    print(server.stderr.read().decode(errors="replace"))
                    return False
                time.sleep(0.2)
        token = os.path.join(tmp, "vault", ".brain", "token")
        subprocess.run([sys.executable, str(HERE / "seed.py"), token, base], check=True, stdout=subprocess.DEVNULL)
        shots = HERE / "shots"
        shots.mkdir(exist_ok=True)
        env = dict(os.environ, MO_BASE=base, MO_TOKEN_FILE=token, MO_AI_MODE_FILE=mode_file, MO_SHOTS=str(shots), NODE_PATH=node_path())
        done = subprocess.run(["node", str(HERE / f"{name}.js")], env=env, cwd=HERE, check=False)
        return done.returncode == 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    names = sys.argv[1:] or SCRIPTS
    bad = [n for n in names if not (print(f"\n=== {n}", flush=True) or run_one(n))]
    print("\nALL BROWSER CHECKS PASSED" if not bad else "\nFAILED: " + ", ".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
