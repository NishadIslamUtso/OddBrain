#!/usr/bin/env python3
"""Start the llama.cpp embedding server Memory_OB uses, if it is not already up.

Memory_OB's meaning search needs a local embedding model. Hermes downloads the
GGUF into its own models folder and manages a llama.cpp runtime, but that server
is started for chat and does not carry ``--embeddings``. This launcher starts a
second, dedicated ``llama-server`` with embeddings enabled on its own port, so
the two never fight over one process.

    pythonw.exe llamacpp_embed.py          (from the Startup folder)

It is idempotent: if something already answers on the port, it does nothing.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
from pathlib import Path

PORT = 18435
HOST = "127.0.0.1"


def hermes_home() -> Path:
    env = os.environ.get("HERMES_HOME")
    if env:
        return Path(env).expanduser()
    return Path.home() / "AppData" / "Local" / "hermes"


def find_server() -> Path | None:
    """The llama.cpp build Hermes installed (newest first)."""
    tools = hermes_home() / "tools"
    if not tools.is_dir():
        return None
    found = sorted(tools.glob("llamacpp-*/llama-server.exe"), reverse=True)
    return found[0] if found else None


def find_embedding_model() -> Path | None:
    """The embedding GGUF Hermes downloaded, if any."""
    models = hermes_home() / "models"
    if not models.is_dir():
        return None
    found = sorted(models.glob("*embed*.gguf"))
    return found[0] if found else None


def already_serving() -> bool:
    sock = socket.socket()
    sock.settimeout(1.0)
    try:
        sock.connect((HOST, PORT))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def main() -> int:
    if already_serving():
        return 0
    exe, gguf = find_server(), find_embedding_model()
    if exe is None or gguf is None:
        print("Memory_OB embedding server: no llama.cpp build or embedding model found.")
        return 0

    args = [
        str(exe),
        "--host", HOST,
        "--port", str(PORT),
        "-c", "512",
        "-b", "2048",
        "-ub", "2048",
        "-ctk", "q8_0",
        "-ctv", "q8_0",
        "-fa", "on",
        "--model", str(gguf),
        "--embeddings",
    ]
    # Mixture-of-experts embedding models keep their expert weights on CPU;
    # without this they are placed on the GPU and the server runs out of VRAM.
    if "moe" in gguf.name.lower():
        args += [r"--override-tensor", r"blk\.\d+\.ffn_.*_exps\.weight=CPU"]

    subprocess.Popen(
        args,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
    )
    print(f"Memory_OB embedding server started on {HOST}:{PORT} ({gguf.name}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
