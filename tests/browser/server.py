"""Start Memory_OB on a throw-away vault with no Hermes and no AI helper.

usage: python server.py <port> <temp dir>
"""
import os
import sys
from pathlib import Path

port, tmp = int(sys.argv[1]), sys.argv[2]
os.environ["MEMORY_OB_VAULT"] = os.path.join(tmp, "vault")
os.environ["HERMES_HOME"] = os.path.join(tmp, "nohermes")  # no Hermes, so no AI helper: simple rules
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import uvicorn  # noqa: E402

from memory_ob import api  # noqa: E402
from memory_ob.config import Settings  # noqa: E402

api.configure(Settings.resolve())
uvicorn.run(api.app, host="127.0.0.1", port=port, log_level="warning")
