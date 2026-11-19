"""Start Memory_OB on a throw-away vault with no Hermes and a stand-in AI helper (see fake_ai.py).

usage: python server.py <port> <temp dir>
"""
import os
import sys
from pathlib import Path

port, tmp = int(sys.argv[1]), sys.argv[2]
os.environ["MEMORY_OB_VAULT"] = os.path.join(tmp, "vault")
os.environ["HERMES_HOME"] = os.path.join(tmp, "nohermes")  # no real Hermes: the stand-in helper answers
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import uvicorn  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fake_ai  # noqa: E402

from memory_ob import api  # noqa: E402
from memory_ob.config import Settings  # noqa: E402

if os.environ.get("FAKE_AI", "ok") != "none":
    fake_ai.install()
api.configure(Settings.resolve())
uvicorn.run(api.app, host="127.0.0.1", port=port, log_level="warning")
