"""The Hermes proxy — and whether the memory judge is awake.

The engine's model calls go through Hermes's local proxy. When it is down every
call silently falls back to keyword matching, and Memory_OB stops judging: it
grabs sentences, scores them all the same, and asks the owner to approve a
transcript. So the proxy is not a convenience — it is the difference between a
judge and a keyword matcher.

This module owns:
* starting and stopping the proxy (detached, so it survives the caller)
* the owner's preference about starting it at logon
* the logon prompt itself

The preference lives in the vault's private ``.brain/proxy.json``, outside git
and outside the export.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from . import hermes

PREF_FILE = "proxy.json"

YES = "yes"
NO = "no"


@dataclass(slots=True)
class ProxyPref:
    """What the owner wants to happen at logon."""

    ask_at_startup: bool = True
    remember: bool = False
    last_choice: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProxyPref":
        return cls(
            ask_at_startup=bool(data.get("ask_at_startup", True)),
            remember=bool(data.get("remember", False)),
            last_choice=data.get("last_choice"),
        )


def pref_path(vault: Path) -> Path:
    return Path(vault) / ".brain" / PREF_FILE


def load_pref(vault: Path) -> ProxyPref:
    p = pref_path(vault)
    if not p.is_file():
        return ProxyPref()
    try:
        return ProxyPref.from_dict(json.loads(p.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return ProxyPref()


def save_pref(vault: Path, pref: ProxyPref) -> Path:
    p = pref_path(vault)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(asdict(pref), indent=2), encoding="utf-8")
    return p


def should_ask(vault: Path) -> bool:
    """Whether the logon prompt should appear.

    Only ask when the owner has not told us to remember a choice — otherwise
    the prompt would come back at every logon and become wallpaper.
    """
    pref = load_pref(vault)
    if not pref.ask_at_startup:
        return False
    if pref.remember and pref.last_choice in (YES, NO):
        return False
    return True


def running() -> bool:
    return hermes.proxy_available(timeout=1.5)


def start(*, wait: bool = True, timeout: float = 15.0) -> bool:
    """Start the proxy, detached, so it outlives this process."""
    if running():
        return True
    exe = hermes.HERMES_EXE
    if not exe.exists():
        return False
    kwargs: dict[str, Any] = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL,
                              "stdin": subprocess.DEVNULL, "close_fds": True}
    if sys.platform == "win32":
        kwargs["creationflags"] = (
            getattr(subprocess, "DETACHED_PROCESS", 0x8)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200)
        )
    try:
        subprocess.Popen([str(exe), "proxy", "start"], **kwargs)
    except OSError:
        return False
    if not wait:
        return True
    deadline = time.time() + timeout
    while time.time() < deadline:
        if running():
            return True
        time.sleep(0.5)
    return False


def stop() -> bool:
    """Stop the proxy by ending whatever holds its port."""
    if not running():
        return True
    port = hermes.PROXY_PORT
    killed = False
    try:
        out = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True, timeout=15
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    pids: set[str] = set()
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        parts = line.split()
        if len(parts) >= 5 and parts[1].endswith(f":{port}"):
            pids.add(parts[-1])
    for pid in pids:
        try:
            subprocess.run(
                ["taskkill", "-F", "-PID", pid],
                capture_output=True, text=True, timeout=15,
            )
            killed = True
        except (OSError, subprocess.TimeoutExpired):
            continue
    if killed:
        deadline = time.time() + 10
        while time.time() < deadline:
            if not running():
                return True
            time.sleep(0.4)
    return not running()


def status(vault: Path | None = None) -> dict[str, Any]:
    """Everything the settings screen needs."""
    up = running()
    pref = load_pref(vault) if vault else ProxyPref()
    return {
        "running": up,
        "url": hermes.proxy_base(),
        "ask_at_startup": pref.ask_at_startup,
        "remember": pref.remember,
        "last_choice": pref.last_choice,
        "should_ask": should_ask(vault) if vault else True,
        "proxy_available": hermes.available(),
    }


def prompt_and_start(vault: Path) -> str:
    """The logon dialog. Returns 'yes', 'no' or 'unavailable'."""
    try:
        import tkinter as tk
        from tkinter import ttk
    except Exception:
        return "unavailable"

    result: dict[str, str] = {"choice": NO}

    root = tk.Tk()
    root.title("Memory_OB")
    root.attributes("-topmost", True)
    try:
        root.tk.call("tk", "scaling", 1.5)
    except Exception:
        pass

    pref = load_pref(vault)
    frame = ttk.Frame(root, padding=18)
    frame.grid(sticky="nsew")

    ttk.Label(
        frame, text="Start the Hermes memory proxy?",
        font=("Segoe UI", 12, "bold"), wraplength=340, justify="left",
    ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 6))

    ttk.Label(
        frame,
        text=(
            "Memory_OB uses it to judge what is worth remembering. "
            "Without it, everything is captured unfiltered.\n\n"
            "It runs locally and only while you are logged in."
        ),
        wraplength=340, justify="left",
    ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 12))

    remember = tk.BooleanVar(value=pref.remember)
    ttk.Checkbutton(
        frame, text="Remember my choice and do not ask again", variable=remember
    ).grid(row=2, column=0, columnspan=2, sticky="w", pady=(0, 14))

    def choose(value: str) -> None:
        result["choice"] = value
        root.destroy()

    btns = ttk.Frame(frame)
    btns.grid(row=3, column=0, columnspan=2, sticky="e")
    ttk.Button(btns, text="No", width=10,
               command=lambda: choose(NO)).pack(side="right", padx=(8, 0))
    ttk.Button(btns, text="Yes", width=10,
               command=lambda: choose(YES)).pack(side="right")

    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)
    root.resizable(False, False)
    root.protocol("WM_DELETE_WINDOW", lambda: choose(NO))
    root.mainloop()

    choice = result["choice"]
    new_pref = ProxyPref(
        ask_at_startup=True,
        remember=remember.get(),
        last_choice=choice if remember.get() else None,
    )
    save_pref(vault, new_pref)
    if choice == YES:
        start()
    return choice
