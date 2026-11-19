"""Serve the dashboard markup with the runtime values injected.

Both the engine's ``/ui`` route and the host plugin's ``/ui-html`` route need
the same injection, so it lives in one place — a second copy is how they
drift.

Nothing here trusts its input: the theme values are pattern-checked by the
caller before they get here.
"""

from __future__ import annotations

from pathlib import Path

from .config import Settings

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


def render(index: Path, settings: Settings, *, base: str = "", theme: dict[str, str] | None = None,
           token: str = "") -> str:
    """The dashboard HTML with the API base, token and theme inlined."""
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
    if theme:
        # The shell sends the host's --ui-* names; the stylesheet reads its own
        # tokens, so map one onto the other. This is the fallback for when the
        # parent cannot be read (a standalone tab, or a cross-origin frame).
        # --bg-3 derives from --ui-bg-elevated, which not every host defines;
        # fall back to --ui-bg-secondary so button rows never keep a stale
        # dark surface in a light theme.
        theme = dict(theme)
        if "background-elevated" not in theme and "background-secondary" in theme:
            theme["background-elevated"] = theme["background-secondary"]
        elif "background-elevated" not in theme and "background" in theme:
            theme["background-elevated"] = theme["background"]
        rules = " ".join(
            f"{THEME_TO_TOKEN.get(name, '--ui-' + name)}: {value};"
            for name, value in theme.items()
        )
        html = html.replace("</head>", f"<style>:root {{ {rules} }}</style></head>", 1)
    return html
