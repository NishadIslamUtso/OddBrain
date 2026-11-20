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
    shutil.copy2(PROJECT / "host" / "retire_folder.py", engine / "host" / "retire_folder.py")
    return engine


def same_place(a: object, b: object) -> bool:
    """The same folder, whatever the spelling: Windows may give a short (8.3) or differently cased path."""
    def norm(x: object) -> str:
        return os.path.normcase(os.path.realpath(str(x)))
    return norm(a) == norm(b)


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

    def _wait_gone(self, engine: Path) -> None:
        """The installer stands inside the old folder, so Windows cannot move it
        until the installer exits; a helper does the move a moment later.

        The helper settles first (MEMORY_OB_RETIRE_SETTLE seconds, default 40)
        so Windows can let go of the folder; waiting barely longer than that is
        how a test turns flaky on a busy machine. Wait for the settle plus room
        to spare, and give up only then (owner item E4)."""
        import time

        settle = float(self.env.get("MEMORY_OB_RETIRE_SETTLE") or 40.0)
        deadline = time.time() + settle + 45.0
        while time.time() < deadline:
            if not engine.exists():
                return
            time.sleep(0.25)

    def _pointer(self) -> str:
        p = self.home / "plugins" / "memory_ob" / ".memory_ob_home"
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def test_the_engine_in_downloads_moves_to_the_permanent_home(self) -> None:
        engine = make_engine(self.tmp / "Downloads")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        permanent = self.tmp / "Documents" / "Hermes" / "Memory_OB-engine"
        self.assertTrue((permanent / "memory_ob" / "__init__.py").exists(), r.stdout)
        self.assertTrue((permanent / "MARKER.txt").exists(), r.stdout)
        self.assertTrue(same_place(self._pointer(), permanent),
                        f"the installed plugin must point at the permanent home: {self._pointer()}")
        self._wait_gone(engine)
        self.assertFalse(engine.exists(), "the Downloads copy is moved away")
        retired = list((permanent / "_retired").glob("Memory_OB-update-7-*"))
        self.assertTrue(retired, "the old copy is retired, never deleted")
        self.assertTrue((retired[0] / "MARKER.txt").exists())

    def test_a_home_that_is_already_permanent_is_left_alone(self) -> None:
        engine = make_engine(self.tmp / "Documents" / "Hermes" / "Workspace")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(engine.exists(), "a good home stays where it is")
        self.assertTrue(same_place(self._pointer(), engine), self._pointer())
        permanent = self.tmp / "Documents" / "Hermes" / "Memory_OB-engine"
        self.assertFalse(permanent.exists(), "nothing is moved when nothing is wrong")

    def test_the_permanent_home_never_relocates_again(self) -> None:
        engine = make_engine(self.tmp / "Documents" / "Hermes" / "Memory_OB-engine")
        r = self._install(engine)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(same_place(self._pointer(), engine), self._pointer())
        self.assertFalse((engine / "_retired").exists())


class RetireFolder(unittest.TestCase):
    """The detached helper that moves the old folder after the installer leaves it.

    Update-18: it must never merge into leftover debris, treat "already moved"
    as success, and leave a note the owner can find when the move is impossible
    (nobody can see a detached helper's console).
    """

    def setUp(self) -> None:
        import importlib.util

        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        spec = importlib.util.spec_from_file_location(
            "retire_folder", PROJECT / "host" / "retire_folder.py")
        self.rf = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(self.rf)
        self.rf.SETTLE_SECONDS = 0.0            # one attempt is enough in tests
        self.home = self.tmp / "home"
        self.home.mkdir()

    def _make_project(self) -> Path:
        project = self.tmp / "Downloads" / "Memory_OB-update-7"
        (project / "host").mkdir(parents=True)
        (project / "MARKER.txt").write_text("old", encoding="utf-8")
        return project

    def _notes(self) -> list[Path]:
        return list((self.home / "_retired").glob("*NOT-MOVED*"))

    def test_it_moves_the_old_folder_and_never_deletes_it(self) -> None:
        project = self._make_project()
        code = self.rf.main(["retire_folder.py", str(project), str(self.home), "Downloads"])
        self.assertEqual(code, 0)
        self.assertFalse(project.exists())
        moved = list((self.home / "_retired").glob("Memory_OB-update-7-*"))
        self.assertTrue(moved)
        self.assertTrue((moved[0] / "MARKER.txt").exists())
        self.assertEqual(self._notes(), [])

    def test_a_folder_already_moved_is_not_a_failure(self) -> None:
        gone = self.tmp / "Downloads" / "already-there"
        code = self.rf.main(["retire_folder.py", str(gone), str(self.home), "Downloads"])
        self.assertEqual(code, 0, "nothing to do is a success")
        self.assertEqual(self._notes(), [])

    def test_a_move_that_cannot_happen_leaves_a_note_for_the_owner(self) -> None:
        project = self._make_project()
        from unittest import mock

        with mock.patch.object(self.rf.shutil, "move", side_effect=OSError("in use")):
            code = self.rf.main(["retire_folder.py", str(project), str(self.home), "Downloads"])
        self.assertEqual(code, 1)
        self.assertTrue(project.exists(), "nothing is ever deleted")
        [note] = self._notes()
        body = note.read_text(encoding="utf-8")
        self.assertIn("could not be moved", body)
        self.assertIn("Nothing was deleted", body)

    def test_a_leftover_destination_is_never_merged_into(self) -> None:
        project = self._make_project()
        from unittest import mock

        stamp = "20260101-000000"
        debris = self.home / "_retired" / f"Memory_OB-update-7-{stamp}"
        debris.mkdir(parents=True)
        (debris / "half-copied.txt").write_text("debris", encoding="utf-8")
        with mock.patch.object(self.rf.time, "strftime", return_value=stamp):
            code = self.rf.main(["retire_folder.py", str(project), str(self.home), "Downloads"])
        self.assertEqual(code, 0)
        self.assertTrue((debris / "half-copied.txt").exists(), "debris is untouched")
        self.assertTrue(project.exists() is False)
        fresh = self.home / "_retired" / f"Memory_OB-update-7-{stamp}-2"
        self.assertTrue((fresh / "MARKER.txt").exists(), "the move went to a fresh name")


if __name__ == "__main__":
    unittest.main()
