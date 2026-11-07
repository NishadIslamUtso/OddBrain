"""Appearance settings: validated on the way in, safe on the way out.

These values reach the UI as CSS custom properties, so the same rule that
guards the theme query string guards what we persist — a hostile value must
never survive into the markup.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob.appearance import Appearance  # noqa: E402


class TestValidation(unittest.TestCase):
    def test_defaults_are_valid(self) -> None:
        self.assertEqual(Appearance().validate(), [])

    def test_real_values_pass(self) -> None:
        a = Appearance(
            theme="dark", accent="#d4a74a", font_family="Inter, sans-serif", font_size=16,
            density="compact",
        )
        self.assertEqual(a.validate(), [])

    def test_functional_colours_pass(self) -> None:
        for colour in ("rgb(212 167 74)", "oklch(0.7 0.1 80)", "hsl(40 80% 55%)"):
            self.assertEqual(Appearance(accent=colour).validate(), [], colour)

    def test_bad_theme_is_rejected(self) -> None:
        self.assertTrue(Appearance(theme="blue").validate())

    def test_bad_density_is_rejected(self) -> None:
        self.assertTrue(Appearance(density="spacious").validate())

    def test_font_size_is_bounded(self) -> None:
        self.assertTrue(Appearance(font_size=9).validate())
        self.assertTrue(Appearance(font_size=40).validate())
        self.assertTrue(Appearance(font_size="big").validate())

    def test_markup_in_the_accent_is_rejected(self) -> None:
        for payload in (
            "red;}</style><script>alert(1)</script>",
            "#fff;}",
            "</style><img src=x onerror=alert(1)>",
        ):
            self.assertTrue(Appearance(accent=payload).validate(), payload)

    def test_markup_in_the_font_is_rejected(self) -> None:
        for payload in ('Inter";}</style><script>x</script>', "Inter</style>"):
            self.assertTrue(Appearance(font_family=payload).validate(), payload)

    def test_clean_clamps_instead_of_storing_bad_values(self) -> None:
        cleaned = Appearance.clean(
            {
                "theme": "blue",
                "accent": "red;}</style><script>alert(1)</script>",
                "font_family": "Inter</style>",
                "font_size": 99,
                "density": "spacious",
            }
        )
        self.assertEqual(cleaned.validate(), [])
        self.assertEqual(cleaned.theme, "auto")
        self.assertEqual(cleaned.accent, "#d4a74a")
        self.assertEqual(cleaned.font_family, "")
        self.assertEqual(cleaned.font_size, 22)  # clamped, not rejected

    def test_css_output_is_safe(self) -> None:
        css = Appearance.clean({"accent": "#123456", "font_size": 15}).css()
        self.assertEqual(css["--accent"], "#123456")
        self.assertEqual(css["--font-size"], "15px")
        # The names are the stylesheet's own tokens, so the page can apply
        # them without a second mapping.
        self.assertNotIn("--ui-accent", css)
        for value in css.values():
            self.assertNotIn(";", value)
            self.assertNotIn("<", value)
            self.assertNotIn("}", value)


class TestSettingsRoundTrip(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        from memory_ob.settings import update

        self.update = update

    def test_appearance_survives_a_round_trip(self) -> None:
        from memory_ob.settings import load

        self.update(
            self.vault, theme="dark", accent="#123456", font_size=16, density="compact"
        )
        got = load(self.vault)
        self.assertEqual(got.theme, "dark")
        self.assertEqual(got.accent, "#123456")
        self.assertEqual(got.font_size, 16)
        self.assertEqual(got.density, "compact")

    def test_a_hostile_value_is_clamped_on_save(self) -> None:
        from memory_ob.settings import load

        self.update(self.vault, accent="red;}</style><script>alert(1)</script>")
        stored = (self.vault / ".brain" / "settings.json").read_text(encoding="utf-8")
        self.assertNotIn("script", stored)
        self.assertNotIn("</style>", stored)
        self.assertEqual(load(self.vault).accent, "#d4a74a")

    def test_non_appearance_settings_still_save(self) -> None:
        from memory_ob.settings import load

        self.update(self.vault, semantic=False, sweep_schedule="weekly")
        got = load(self.vault)
        self.assertFalse(got.semantic)
        self.assertEqual(got.sweep_schedule, "weekly")


class TestAppearanceEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api

        self._prev = api.settings
        api.configure(api.Settings.resolve(vault=self.vault, db=self.db))
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def test_get_returns_defaults(self) -> None:
        r = self.client.get("/api/appearance")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["theme"], "auto")
        self.assertEqual(body["errors"], [])
        self.assertIn("--accent", body["css"])

    def test_post_saves_a_valid_value(self) -> None:
        r = self.client.post("/api/appearance", json={"theme": "dark", "accent": "#123456"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["theme"], "dark")
        self.assertEqual(r.json()["css"]["--accent"], "#123456")

    def test_post_never_stores_a_hostile_value(self) -> None:
        payload = {"accent": "red;}</style><script>alert(1)</script>"}
        r = self.client.post("/api/appearance", json=payload)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertNotIn("alert", body["accent"])
        self.assertNotIn("<", body["css"]["--accent"])
        self.assertNotIn("</style>", body["css"]["--accent"])

    def test_app_settings_accepts_appearance_too(self) -> None:
        r = self.client.post("/api/app-settings", json={"density": "compact"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["density"], "compact")

    def test_the_ui_page_carries_the_appearance(self) -> None:
        """The engine's /ui route must inject it, not just the plugin's."""
        r = self.client.get("/ui")
        self.assertEqual(r.status_code, 200)
        self.assertIn("__MEMORY_OB_APPEARANCE__ = {", r.text)
        self.assertIn('"accent": "#d4a74a"', r.text)

    def test_the_ui_page_carries_the_token(self) -> None:
        r = self.client.get("/ui")
        self.assertIn("__MEMORY_OB_TOKEN__ = ", r.text)
        self.assertNotIn('__MEMORY_OB_TOKEN__ = "";', r.text)


if __name__ == "__main__":
    unittest.main()
