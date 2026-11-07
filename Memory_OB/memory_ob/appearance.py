"""Appearance settings — theme, accent, font, density.

These values reach the UI as CSS custom properties, so every one is validated
here before it is stored. A hostile value must never survive into the markup:
the same rule that guards the theme query string guards what we persist.

``theme: auto`` follows the host. ``font_family: ""`` means "use the host's
font" rather than imposing one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

THEMES = ("light", "dark", "auto")
DENSITIES = ("comfortable", "compact")

# A CSS colour: #hex, or a functional notation whose arguments are the usual
# colour characters. No ';' '{' '}' '<' '>' quotes '\\' ':' or '@'.
_SAFE_COLOUR = re.compile(
    r"^(?:#[0-9a-fA-F]{3,8}|(?:rgb|oklch|oklab|hsl|color-mix)\([#%(),./\w\s+-]{1,80}\))$"
)
# A font stack: family names, quoted or bare, comma-separated.
_SAFE_FONT = re.compile(r"^[-\w\s'\".,]{1,80}$")

DEFAULT_ACCENT = "#d4a74a"
MIN_FONT_SIZE = 11
MAX_FONT_SIZE = 22


@dataclass(slots=True)
class Appearance:
    # font_size is typed loosely because from_dict() feeds it raw JSON; clean()
    # is what coerces it to an int in range.
    theme: str = "auto"
    accent: str = DEFAULT_ACCENT
    font_family: str = ""
    font_size: int | str = 14
    density: str = "comfortable"
    errors: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Appearance:
        return cls(
            theme=str(data.get("theme") or "auto"),
            accent=str(data.get("accent") or DEFAULT_ACCENT),
            font_family=str(data.get("font_family") or ""),
            font_size=data.get("font_size", 14),
            density=str(data.get("density") or "comfortable"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "theme": self.theme,
            "accent": self.accent,
            "font_family": self.font_family,
            "font_size": self.font_size,
            "density": self.density,
        }

    def validate(self) -> list[str]:
        """Every problem with the current values, in a stable order."""
        errors: list[str] = []
        if self.theme not in THEMES:
            errors.append(f"theme must be one of {', '.join(THEMES)}")
        if not _SAFE_COLOUR.match(self.accent):
            errors.append("accent must be a colour like #d4a74a or rgb(212 167 74)")
        if self.font_family and not _SAFE_FONT.match(self.font_family):
            errors.append("font_family contains characters that are not allowed")
        try:
            size = int(self.font_size)
        except (TypeError, ValueError):
            errors.append(f"font_size must be a number between {MIN_FONT_SIZE} and {MAX_FONT_SIZE}")
        else:
            if not MIN_FONT_SIZE <= size <= MAX_FONT_SIZE:
                errors.append(
                    f"font_size must be between {MIN_FONT_SIZE} and {MAX_FONT_SIZE}"
                )
        if self.density not in DENSITIES:
            errors.append(f"density must be one of {', '.join(DENSITIES)}")
        self.errors = errors
        return errors

    @classmethod
    def clean(cls, data: dict[str, Any]) -> Appearance:
        """Coerce and clamp raw input into a valid Appearance.

        Used on the way in: a bad value becomes the default rather than an
        error, so a typo can never break the page.
        """
        candidate = cls.from_dict(data)
        if candidate.validate():
            good = cls()
            good.theme = candidate.theme if candidate.theme in THEMES else "auto"
            good.accent = (
                candidate.accent if _SAFE_COLOUR.match(candidate.accent) else DEFAULT_ACCENT
            )
            good.font_family = (
                candidate.font_family if _SAFE_FONT.match(candidate.font_family) else ""
            )
            try:
                size = int(candidate.font_size)
            except (TypeError, ValueError):
                size = 14
            good.font_size = max(MIN_FONT_SIZE, min(MAX_FONT_SIZE, size))
            good.density = candidate.density if candidate.density in DENSITIES else "comfortable"
            return good
        return candidate

    def css(self) -> dict[str, str]:
        """The custom properties the UI should set on its root element.

        The names are the STYLESHEET's own tokens (--accent, --font-size), not
        the host's --ui-* names — the page applies these directly, and the host
        names mean nothing to our CSS.
        """
        out: dict[str, str] = {}
        if self.accent:
            out["--accent"] = self.accent
        if self.font_family:
            out["--font"] = self.font_family
        if self.font_size:
            out["--font-size"] = f"{int(self.font_size)}px"
        return out
