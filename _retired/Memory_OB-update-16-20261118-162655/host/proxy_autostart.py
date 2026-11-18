#!/usr/bin/env python3
"""Logon prompt: should the Hermes memory proxy start with the computer?

Runs from the Startup folder, once per logon, with no console window. If the
owner asked to be remembered, it honours the stored choice without a dialog.

    pythonw.exe proxy_autostart.py

The preference lives in the vault's private .brain/proxy.json.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
def _project() -> Path | None:
    """Find the Memory_OB checkout, wherever this file was copied to.

    The logon prompt runs both from the repo and from the installed plugin
    copy, so the layout cannot be assumed. Walk up until a directory holding
    ``memory_ob/`` is found; the env var wins if it points at one.
    """
    env = os.environ.get("MEMORY_OB_HOME")
    if env:
        cand = Path(env).expanduser()
        if (cand / "memory_ob" / "__init__.py").is_file():
            return cand
    for cand in (HERE, *HERE.parents):
        if (cand / "memory_ob" / "__init__.py").is_file():
            return cand
    return None


PROJECT = _project()


def _vault() -> Path:
    env = os.environ.get("MEMORY_OB_VAULT")
    if env:
        return Path(env).expanduser()
    from memory_ob.config import default_vault

    return default_vault()


def main() -> int:
    if PROJECT is None:
        print("memory proxy prompt: cannot locate the Memory_OB checkout",
              file=sys.stderr)
        return 0
    if str(PROJECT) not in sys.path:
        sys.path.insert(0, str(PROJECT))
    try:
        from memory_ob import proxy
    except Exception as exc:  # noqa: BLE001 - a broken prompt must not block logon
        print(f"memory proxy prompt unavailable: {exc}", file=sys.stderr)
        return 0

    vault = _vault()
    try:
        if proxy.should_ask(vault):
            proxy.prompt_and_start(vault)
        else:
            pref = proxy.load_pref(vault)
            # A remembered "yes" still has to start it; a remembered "no" does not.
            if pref.last_choice == proxy.YES and not proxy.running():
                proxy.start()
    except Exception:  # noqa: BLE001 - never let a prompt break logon
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
