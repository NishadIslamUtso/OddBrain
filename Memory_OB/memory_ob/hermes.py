"""Bridge to the Hermes host.

Memory_OB is a library, but when it runs beside Hermes it should use Hermes's
own model system — the same provider chain, the same credentials, the same
`auto` semantics as every other auxiliary task in the app.

Two bridges:

* **Config** — `hermes config get <key>` resolves any configuration value, so
  Memory_OB reads the *same* settings the app uses (main model, auxiliary
  blocks) instead of keeping a shadow copy.
* **Proxy** — `hermes proxy` (default ``127.0.0.1:8645``) is a local
  OpenAI-compatible server that forwards to the authenticated upstream. Point
  at it and `auto` behaves exactly like Hermes's other auxiliary calls.

Nothing here reimplements Hermes's provider resolution — that would drift the
moment Hermes changes. We ask Hermes.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

HERMES_HOME = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData/Local"))) / "hermes"
HERMES_EXE = HERMES_HOME / "bin" / "hermes.exe"
PROXY_HOST = "127.0.0.1"
PROXY_PORT = 8645
PROXY_BASE = f"http://{PROXY_HOST}:{PROXY_PORT}/v1"

# How long to wait for `hermes config get` before giving up.
_TIMEOUT = 10.0

_cache: dict[str, str | None] = {}


def available() -> bool:
    """True when a Hermes install is present."""
    return HERMES_EXE.exists()


def config_path() -> Path | None:
    p = HERMES_HOME / "config.yaml"
    return p if p.exists() else None


def hermes_memory_paths() -> tuple[Path | None, Path | None]:
    """Where Hermes keeps its standing memory files, if it is installed.

    ``MEMORY.md`` and ``USER.md`` live at the Hermes home. Both are returned
    even when absent — the sync writes them only when the owner opts in.
    """
    memory = HERMES_HOME / "MEMORY.md"
    user = HERMES_HOME / "USER.md"
    return (memory if memory.exists() else None, user if user.exists() else None)


def hermes_memory_dir() -> Path | None:
    """The Hermes home when it is installed (for the sync's backups)."""
    return HERMES_HOME if HERMES_HOME.is_dir() else None


def config_get(key: str) -> str | None:
    """Resolve a Hermes config value. Returns None when unset/unavailable."""
    if key in _cache:
        return _cache[key]
    if not available():
        _cache[key] = None
        return None
    try:
        proc = subprocess.run(
            [str(HERMES_EXE), "config", "get", key],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT,
        )
    except (OSError, subprocess.TimeoutExpired):
        _cache[key] = None
        return None
    out = (proc.stdout or "").strip()
    if proc.returncode != 0 or not out or out.startswith("Config key not set"):
        _cache[key] = None
        return None
    _cache[key] = out
    return out


def clear_cache() -> None:
    _cache.clear()


# --- Model slots -----------------------------------------------------------


def main_slot() -> dict[str, str]:
    """Hermes's main model as a slot dict."""
    return {
        "provider": config_get("model.provider") or "auto",
        "model": config_get("model.default") or "",
        "base_url": config_get("model.base_url") or "",
    }


def aux_slot(task: str) -> dict[str, str]:
    """A Hermes auxiliary block as a slot dict.

    Returns ``provider: auto`` with empty model/base_url when the block is not
    configured — which is exactly Hermes's own default.
    """
    return {
        "provider": config_get(f"auxiliary.{task}.provider") or "auto",
        "model": config_get(f"auxiliary.{task}.model") or "",
        "base_url": config_get(f"auxiliary.{task}.base_url") or "",
    }


# --- Proxy -----------------------------------------------------------------


def proxy_available() -> bool:
    """True when the Hermes proxy is accepting connections."""
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(f"http://{PROXY_HOST}:{PROXY_PORT}/health")
        with urllib.request.urlopen(req, timeout=2.0):
            return True
    except urllib.error.URLError:
        return False
    except Exception:
        return False


def proxy_base() -> str:
    return PROXY_BASE


def proxy_command() -> list[str]:
    """The command that starts the proxy (for the owner or the host shell)."""
    return [str(HERMES_EXE), "proxy", "start"]
