"""Serve the dashboard markup with the runtime values injected.

Both the engine's ``/ui`` route and the host plugin's ``/ui-html`` route need
the same injection, so it lives in one place — a second copy is how they
drift, and the plugin had drifted (it injected the appearance, the engine did
not).

Nothing here trusts its input: the appearance values are re-validated before
they reach the page, and the theme values are pattern-checked by the caller.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .appearance import Appearance
from .config import Settings
from .settings import load

# The shell's theme names onto the stylesheet's own tokens.
THEME_TO_TOKEN = {
    "background": "--bg",
    "background-sidebar": "--bg",
    "background-secondary": "--bg-2",
    "background-elevated": "--bg-3",
    "stroke-secondary": "--stroke",
    "stroke-tertiary": "--stroke-2",
    "text-primary": "--text",
    "text-secondary": "--text-2",
    "text-tertiary": "--text-3",
    "text-quaternary": "--text-4",
    "accent": "--accent",
}


def appearance_payload(settings: Settings) -> dict[str, Any] | None:
    """The validated appearance, as JSON-serialisable data.

    Returns None when the settings cannot be read — a broken settings file must
    not take the dashboard down.
    """
    try:
        app = load(settings.vault)
        appearance = Appearance.from_dict(app.to_dict())
        appearance.validate()
        return {**appearance.to_dict(), "css": appearance.css()}
    except Exception:  # noqa: BLE001 - the page works with defaults
        return None


def render(index: Path, settings: Settings, *, base: str = "", theme: dict[str, str] | None = None,
           token: str = "") -> str:
    """The dashboard HTML with the API base, token, appearance and theme inlined."""
    html = index.read_text(encoding="utf-8")

    html = html.replace(
        'window.__MEMORY_OB_BASE__ = "";',
        f'window.__MEMORY_OB_BASE__ = "{base}";',
    )
    # The write token is injected so the pages can echo it back on every write
    # (§15 rule 5) — no default token is ever shipped.
    html = html.replace(
        'window.__MEMORY_OB_TOKEN__ = "";',
        f'window.__MEMORY_OB_TOKEN__ = "{token}";',
    )
    # Appearance settings, already validated by the backend.
    payload = appearance_payload(settings)
    html = html.replace(
        'window.__MEMORY_OB_APPEARANCE__ = null;',
        f'window.__MEMORY_OB_APPEARANCE__ = {json.dumps(payload)};',
    )
    if theme:
        # The shell sends the host's --ui-* names; the stylesheet reads its own
        # tokens, so map one onto the other. This is the fallback for when the
        # parent cannot be read (a standalone tab, or a cross-origin frame).
        rules = " ".join(
            f"{THEME_TO_TOKEN.get(name, '--ui-' + name)}: {value};"
            for name, value in theme.items()
        )
        html = html.replace("</head>", f"<style>:root {{ {rules} }}</style></head>", 1)
    return html
