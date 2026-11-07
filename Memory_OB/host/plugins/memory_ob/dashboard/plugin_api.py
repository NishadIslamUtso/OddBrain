"""Memory_OB host shell — backend.

Mounted at ``/api/plugins/memory_ob/``. This is a thin adapter: it finds the
Memory_OB package, mounts the library's own FastAPI routes, and serves the
screens with the API base injected.

Nothing here reimplements Memory_OB. The plugin is a door, not a second brain.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

router = APIRouter()

_API_BASE = "/api/plugins/memory_ob"


def _find_memory_ob() -> Path | None:
    """Locate the Memory_OB project directory.

    Order: ``MEMORY_OB_HOME`` env var, then the owner's usual workspace, then
    a sibling of the plugin tree. Returns None when it isn't installed.
    """
    candidates: list[Path] = []
    env = os.environ.get("MEMORY_OB_HOME")
    if env:
        candidates.append(Path(env))
    candidates.append(Path.home() / "Documents" / "Hermes" / "Workspace" / "Memory_OB")
    try:
        candidates.append(Path(__file__).resolve().parents[5] / "Memory_OB")
    except (IndexError, OSError):
        pass
    for c in candidates:
        try:
            if (c / "memory_ob" / "__init__.py").is_file():
                return c
        except OSError:
            continue
    return None


def _load() -> tuple[Any, Path | None, str | None]:
    """Import Memory_OB and return (fastapi app, web/index.html, error)."""
    root = _find_memory_ob()
    if root is None:
        return None, None, "Memory_OB project not found (set MEMORY_OB_HOME)"
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from memory_ob import __file__ as memory_init  # noqa: PLC0415
        from memory_ob.api import app as memory_app  # noqa: PLC0415

        web = Path(memory_init).resolve().parent / "web" / "index.html"
        return memory_app, (web if web.is_file() else None), None
    except Exception as exc:  # pragma: no cover - surfaces in the UI
        return None, None, f"{type(exc).__name__}: {exc}"


_MEMORY_APP, _INDEX, _ERROR = _load()


@router.get("/ui")
def ui() -> HTMLResponse:
    """The screens, with the API base injected for this namespace."""
    return HTMLResponse(_render_html({}))


@router.get("/ui-html")
def ui_html(request: Request) -> dict[str, Any]:
    """The screens as a JSON string, for the host shell's ``srcdoc`` iframe.

    An iframe cannot carry the dashboard session token, so it may not load
    ``/ui`` directly; the host fetches the markup through its authenticated
    bridge instead and mounts it with ``srcDoc``. The theme values arrive as
    query parameters and are inlined, since ``srcdoc`` has no query string.

    The query string is INPUT. It is allow-listed by name and pattern-checked
    by value before anything reaches the ``<style>`` block — otherwise a
    crafted URL could close the style element and inject markup.
    """
    theme = _clean_theme(request.query_params)
    return {
        "ok": True,
        "base": _API_BASE,
        "theme": theme,
        "html": _render_html(theme),
    }


# Every theme name the shell sends (see THEME_VARS in plugin.js). Anything
# else is dropped — the query string is input, so it is allow-listed, not
# trusted.
_THEME_NAMES = {
    "accent", "background", "background-sidebar", "background-secondary",
    "background-elevated", "stroke-secondary", "stroke-tertiary",
    "text-primary", "text-secondary", "text-tertiary", "text-quaternary",
}

# A CSS colour: letters, digits and the separators that appear in #hex,
# rgb(…), oklch(…), color-mix(…). Deliberately no ';' '{' '}' '<' '>' quotes
# '\\' ':' or '@' — nothing that could close the declaration, close the
# <style> element, or pull in a URL.
_SAFE_CSS_VALUE = re.compile(r"^[#%(),./\w\s+-]{1,120}$")
_BANNED_CSS = ("url(", "expression", "@import", "javascript")


def _clean_theme(params: Any) -> dict[str, str]:
    """Theme query parameters, reduced to known names with safe values."""
    theme: dict[str, str] = {}
    for raw_name, raw_value in params.items():
        name = raw_name[5:] if raw_name.startswith("--ui-") else raw_name
        value = str(raw_value).strip()
        if name not in _THEME_NAMES:
            continue
        if not _SAFE_CSS_VALUE.match(value):
            continue
        if any(bad in value.lower() for bad in _BANNED_CSS):
            continue
        theme[name] = value
    return theme


def _render_html(theme: dict[str, str]) -> str:
    """The UI markup with the API base, theme, token and appearance injected.

    Delegates to memory_ob.webui so the engine's /ui route and this plugin's
    /ui-html route cannot drift apart.
    """
    if _INDEX is None:
        return f"<!doctype html><h2>Memory_OB is not installed</h2><p>{_ERROR or 'web/index.html not found'}</p>"
    try:
        from memory_ob.auth import load_or_create
        from memory_ob.config import Settings
        from memory_ob.webui import render

        s = Settings.resolve()
        return render(
            _INDEX, s,
            base=_API_BASE,
            theme=theme,
            token=load_or_create(s.token_path),
        )
    except Exception:
        # Last resort: serve the file untouched rather than a broken page.
        return _INDEX.read_text(encoding="utf-8")


# Mount the library's own routes under this namespace. Registered AFTER /ui so
# the injected-base version wins; everything else is passed through untouched.
if _MEMORY_APP is not None:
    router.include_router(_MEMORY_APP.router)


@router.get("/status")
def status() -> dict[str, Any]:
    """Liveness + where Memory_OB was found."""
    return {
        "ok": _MEMORY_APP is not None,
        "error": _ERROR,
        "root": str(_find_memory_ob()) if _find_memory_ob() else None,
        "api_base": _API_BASE,
        "ui": f"{_API_BASE}/ui",
    }
