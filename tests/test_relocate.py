"""Owner list item A8: the engine never lives in Downloads or TEMP.

The installer copies it to Documents\\Hermes\\Memory_OB-engine, the installed
plugin points there, and the old copy is retired (moved, never deleted).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent


def make_engine(root: Path) -> Path:
    """A minimal engine tree the real installer can run from."""
    engine = root / "Memory_OB-update-7"
    for d in ("memory_ob", "host/plugins/memory_ob", "host/desktop-plugins/memory-ob",
              "provider/memory_ob", "skills"):
        (engine / d).mkdir(parents=True, exist_ok=True)
    (engine / "memory_ob" / "__init__.py").write_text("", encoding="utf-8")
    (engine / "MARKER.txt").write_text("old engine", encoding="utf-8")
    shutil.copy2(PROJECT / "host" / "install.py", engine / "host" / "install.py")
    shutil.copy2(PROJECT / "host" / "retire.py", engine / "host" / "retire.py")
    return engine


class Relocate(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.home = self.tmp / "hermes-home"
        self.home.mkdir(parents=True)
        self.env = {
            **os.environ,
            "USERPROFILE": str(self.tmp),
            "HERMES_HOME": str(self.home),
        }
        self.env.pop("LOCALAPPDATA", None)

    def _install(self, engine: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(engine / "host" / "install.py"), "--no-enable", "--no-startup"],
            cwd=str(engine), env=self.env, capture_output=True, text=True)

    def _pointer(self) -> str:
        p = self.home / "plugins" / "memory_ob" / ".memory_ob_home"
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def _same(self, a: str, b: str) -> bool:
        """Same folder, whatever Windows calls it.

        A temp path under a long user name comes back as an 8.3 short name
        (``NISHAD~1``) from one side and the long name from the other, so the
        comparison is on resolved paths.
        """
        return bool(a) and Path(a).resolve() == Path(b).resolve()

    def test_the_engine_in_downloads_moves_to_the_permanent_home(self) -> None:
        engine = make_engine(self.tmp / "Downloads")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        permanent = self.tmp / "Documents" / "Hermes" / "Memory_OB-engine"
        self.assertTrue((permanent / "memory_ob" / "__init__.py").exists(), r.stdout)
        self.assertTrue((permanent / "MARKER.txt").exists(), r.stdout)
        self.assertTrue(self._same(self._pointer(), str(permanent)),
                        "the installed plugin must point at the permanent home")
        self.assertFalse(engine.exists(), "the Downloads copy is moved away")
        retired = list((permanent / "_retired").glob("Memory_OB-update-7-*"))
        self.assertTrue(retired, "the old copy is retired, never deleted")
        self.assertTrue((retired[0] / "MARKER.txt").exists())

    def test_a_home_that_is_already_permanent_is_left_alone(self) -> None:
        engine = make_engine(self.tmp / "Documents" / "Hermes" / "Workspace")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(engine.exists(), "a good home stays where it is")
        self.assertTrue(self._same(self._pointer(), str(engine)))
        permanent = self.tmp / "Documents" / "Hermes" / "Memory_OB-engine"
        self.assertFalse(permanent.exists(), "nothing is moved when nothing is wrong")

    def test_the_permanent_home_never_relocates_again(self) -> None:
        engine = make_engine(self.tmp / "Documents" / "Hermes" / "Memory_OB-engine")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(self._same(self._pointer(), str(engine)))
        self.assertFalse((engine / "_retired").exists())


if __name__ == "__main__":
    unittest.main()
