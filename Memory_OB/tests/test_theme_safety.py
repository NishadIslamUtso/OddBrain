"""The theme query string must never reach the markup unsanitised.

The host shell sends its theme as query parameters, and the backend inlines
them into a ``<style>`` block. A crafted value could close the style element
and inject markup, so the names are allow-listed and the values are
pattern-checked. These tests drive the real plugin module.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PLUGIN = (
    PROJECT / "host" / "plugins" / "memory_ob" / "dashboard" / "plugin_api.py"
)

sys.path.insert(0, str(PROJECT))


def _load_plugin():
    spec = importlib.util.spec_from_file_location("mob_plugin_api", PLUGIN)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {PLUGIN}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestThemeSanitizer(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("MEMORY_OB_HOME", str(PROJECT))
        cls.mod = _load_plugin()

    def _params(self, **kw):
        return {f"--ui-{k}": v for k, v in kw.items()}

    def test_real_colours_pass(self) -> None:
        good = {
            "accent": "#d4a74a",
            "background": "rgb(26 26 26 / 90%)",
            "background-sidebar": "oklch(0.2 0.01 250)",
            "stroke-tertiary": "#333",
            "text-primary": "#eee",
            "background-elevated": "color-mix(in srgb, #222 4%, transparent)",
        }
        cleaned = self.mod._clean_theme(self._params(**good))
        self.assertEqual(cleaned, good)

    def test_markup_injection_is_dropped(self) -> None:
        payloads = [
            "red;}</style><script>alert(1)</script>",
            '#000"}',
            "#fff} body{display:none}",
            "red;}</style>",
            "</style><img src=x onerror=alert(1)>",
        ]
        for payload in payloads:
            self.assertEqual(
                self.mod._clean_theme(self._params(accent=payload)),
                {},
                f"payload was not dropped: {payload!r}",
            )

    def test_unknown_names_are_dropped(self) -> None:
        params = {"evil": "#fff", "--ui-accent": "#d4a74a"}
        cleaned = self.mod._clean_theme(params)
        self.assertEqual(cleaned, {"accent": "#d4a74a"})

    def test_dangerous_functions_are_dropped(self) -> None:
        for payload in ("url(http://x)", "expression(alert(1))", "red@import 'x'"):
            self.assertEqual(
                self.mod._clean_theme(self._params(accent=payload)),
                {},
                f"dangerous value was not dropped: {payload!r}",
            )

    def test_a_crafted_query_string_cannot_reach_the_markup(self) -> None:
        """End to end: feed the route's input, check what the page contains."""
        payload = "red;}</style><script>alert(1)</script>"
        clean = self.mod._clean_theme({"--ui-accent": payload})
        html = self.mod._render_html(clean)
        self.assertNotIn("alert(1)", html)
        self.assertNotIn("</style><script", html)

    def test_every_name_the_shell_sends_is_accepted(self) -> None:
        """The allow-list must not silently drop a colour the shell sends."""
        shell_names = [
            "accent", "background", "background-sidebar", "background-secondary",
            "background-elevated", "stroke-secondary", "stroke-tertiary",
            "text-primary", "text-secondary", "text-tertiary", "text-quaternary",
        ]
        for name in shell_names:
            self.assertIn(name, self.mod._THEME_NAMES, f"{name} missing from allow-list")
            cleaned = self.mod._clean_theme({f"--ui-{name}": "#abcdef"})
            self.assertEqual(cleaned, {name: "#abcdef"})


if __name__ == "__main__":
    unittest.main()
