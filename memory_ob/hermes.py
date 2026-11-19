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
import re
import subprocess
import sys
from pathlib import Path


def _hermes_home() -> Path:
    """Where Hermes keeps its config and binaries.

    Overridable so a test (or a portable install) can point at a Hermes that
    is not in the platform default location.
    """
    override = os.environ.get("HERMES_HOME")
    if override:
        return Path(override)
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            return Path(local) / "hermes"
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "hermes"
    return Path.home() / ".hermes"


_DEFAULT_HOME = _hermes_home()
HERMES_HOME = _DEFAULT_HOME
if os.environ.get("HERMES_EXE"):
    HERMES_EXE = Path(os.environ["HERMES_EXE"])
elif sys.platform == "win32":
    HERMES_EXE = HERMES_HOME / "bin" / "hermes.exe"
else:
    HERMES_EXE = HERMES_HOME / "bin" / "hermes"
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


# What Hermes allows in each notes file unless its own config says otherwise.
DEFAULT_MEMORY_LIMIT = 2200
DEFAULT_USER_LIMIT = 1375


def _home_candidates() -> list[Path]:
    """Folders Hermes may live in. A test (or a portable install) that points
    HERMES_HOME somewhere else is believed and nothing else is searched."""
    homes = [HERMES_HOME]
    if HERMES_HOME is _DEFAULT_HOME and not os.environ.get("HERMES_HOME"):
        alt = Path.home() / ".hermes"
        if alt != HERMES_HOME:
            homes.append(alt)
    return homes


def hermes_memory_dir() -> Path | None:
    """The folder where Hermes keeps MEMORY.md and USER.md, if Hermes is here.

    Hermes keeps them in a ``memories`` folder inside its home. Hermes only
    makes the folder the first time it saves something, so a Hermes that is
    installed but has not saved anything yet still gets one.
    """
    homes = _home_candidates()
    for home in homes:
        if (home / "memories").is_dir():
            return home / "memories"
    for home in homes:  # older layout: the files straight in the home folder
        if (home / "MEMORY.md").is_file() or (home / "USER.md").is_file():
            return home
    for home in homes:
        if home.is_dir():
            return home / "memories"
    return None


def hermes_memory_paths() -> tuple[Path | None, Path | None]:
    """Where Hermes keeps its standing memory notes, if Hermes is installed.

    Both paths come back even when the files are not made yet: the sync makes
    them, and only when the owner switched it on.
    """
    folder = hermes_memory_dir()
    if folder is None:
        return None, None
    return folder / "MEMORY.md", folder / "USER.md"


def memory_limits() -> tuple[int, int]:
    """How many characters Hermes allows in MEMORY.md and USER.md."""
    memory, user = DEFAULT_MEMORY_LIMIT, DEFAULT_USER_LIMIT
    for home in _home_candidates():
        try:
            text = (home / "config.yaml").read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        found = re.search(r"^\s*memory_char_limit:\s*(\d+)", text, re.M)
        if found:
            memory = int(found.group(1))
        found = re.search(r"^\s*user_char_limit:\s*(\d+)", text, re.M)
        if found:
            user = int(found.group(1))
        break
    return memory, user


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
            check=False,
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


def proxy_available(timeout: float = 2.0) -> bool:
    """True when the Hermes proxy is accepting connections.

    The answer is remembered for a short while (see :mod:`memory_ob.probe`).
    """
    from . import probe

    return probe.remembered("hermes-proxy", lambda: _proxy_up(timeout))


def _proxy_up(timeout: float) -> bool:
    """True when the proxy answers ``/v1/models`` (the address Hermes documents) like a model server."""
    return proxy_models(timeout) is not None


def proxy_models(timeout: float = 3.0) -> list[str] | None:
    """The model names the proxy lists, or None when nothing there answers like a model server.

    ``/health`` is not one of the addresses ``hermes proxy`` forwards, so it is not trusted: something
    else on the same port can answer it and then refuse every real request.
    """
    import json
    import urllib.request

    try:
        req = urllib.request.Request(f"{PROXY_BASE}/models", headers={"Authorization": "Bearer sk-unused"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        items = data.get("data") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return None
        return [str(i["id"]) for i in items if isinstance(i, dict) and i.get("id")]
    except Exception:  # noqa: BLE001 - not reachable, not JSON, not a model server: all the same answer
        return None


_working_model = ""


def working_model() -> str:
    """A model name the proxy has already answered with, so it is not guessed again."""
    return _working_model


def remember_model(name: str) -> None:
    global _working_model
    _working_model = name


def pick_proxy_model(avoid: str = "") -> str:
    """A chat model the proxy lists (not the one that just failed, not an embedding model), or ''."""
    for name in proxy_models() or []:
        if name != avoid and "embed" not in name.lower():
            return name
    return ""


def proxy_base() -> str:
    return PROXY_BASE


def proxy_command() -> list[str]:
    """The command that starts the proxy (for the owner or the host shell)."""
    return [str(HERMES_EXE), "proxy", "start"]
