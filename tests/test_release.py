"""Installing a new release moves the files an older release had out of the way — it never deletes them."""

from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "host"))

import release  # noqa: E402
import retire  # noqa: E402


def touch(root: Path, rel: str, text: str = "x") -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


class Sweep(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = Path(tempfile.mkdtemp())
        for rel in ("memory_ob/a.py", "tests/test_a.py", "host/install.py"):
            touch(self.engine, rel)
        touch(self.engine, retire.MANIFEST, "memory_ob/a.py\ntests/test_a.py\nhost/install.py\n")

    def test_files_the_release_does_not_ship_are_moved_not_deleted(self) -> None:
        touch(self.engine, "memory_ob/old_module.py", "old")
        touch(self.engine, "tests/test_old.py", "old test")
        moved = retire.sweep(self.engine, stamp="s1")
        self.assertEqual(sorted(moved), ["memory_ob/old_module.py", "tests/test_old.py"])
        self.assertFalse((self.engine / "memory_ob" / "old_module.py").exists())
        self.assertEqual((self.engine / "_retired" / "s1" / "memory_ob" / "old_module.py").read_text(), "old")

    def test_what_the_release_ships_is_left_alone(self) -> None:
        self.assertEqual(retire.sweep(self.engine, stamp="s1"), [])
        self.assertTrue((self.engine / "memory_ob" / "a.py").exists())

    def test_nothing_happens_without_a_list(self) -> None:
        (self.engine / retire.MANIFEST).unlink()
        touch(self.engine, "memory_ob/old_module.py")
        self.assertEqual(retire.sweep(self.engine), [])
        self.assertTrue((self.engine / "memory_ob" / "old_module.py").exists())

    def test_your_own_files_outside_the_code_folders_are_never_touched(self) -> None:
        touch(self.engine, "my notes.txt")
        touch(self.engine, "vault/Life/Life.md")
        touch(self.engine, "memory_ob/data.db")                   # not a kind of file the sweep handles
        self.assertEqual(retire.sweep(self.engine), [])
        self.assertTrue((self.engine / "my notes.txt").exists())

    def test_a_second_sweep_moves_nothing_more(self) -> None:
        touch(self.engine, "memory_ob/old_module.py")
        retire.sweep(self.engine, stamp="s1")
        self.assertEqual(retire.sweep(self.engine, stamp="s2"), [])


class WhereItLives(unittest.TestCase):
    def test_downloads_and_temp_folders_get_a_warning_documents_does_not(self) -> None:
        import install

        self.assertEqual(install.temporary_home(Path("/home/u/Downloads/Memory_OB")), "your Downloads folder")
        self.assertEqual(install.temporary_home(Path("/tmp/x/Memory_OB")), "a temporary folder")
        self.assertEqual(install.temporary_home(Path("/home/u/Documents/workspace/Memory_OB")), "")


class Release(unittest.TestCase):
    def test_the_zip_ships_the_list_and_leaves_out_private_things(self) -> None:
        root = Path(tempfile.mkdtemp())
        touch(root, "memory_ob/a.py")
        touch(root, "memory_ob/__pycache__/a.cpython-313.pyc")
        touch(root, "vault/.brain/token", "secret")
        touch(root, "memory_ob.db")
        touch(root, "_retired/s1/memory_ob/old.py")
        dest = root.parent / (root.name + ".zip")
        names = release.build(dest, root)
        self.assertEqual(sorted(names), ["RELEASE_FILES.txt", "memory_ob/a.py"])
        with zipfile.ZipFile(dest) as zf:
            self.assertEqual(sorted(zf.namelist()), ["RELEASE_FILES.txt", "memory_ob/a.py"])
            self.assertIn("memory_ob/a.py", zf.read("RELEASE_FILES.txt").decode())

    def test_this_project_ships_what_the_installer_needs(self) -> None:
        files = set(release.release_files())
        for need in ("install.ps1", "host/install.py", "host/retire.py", "memory_ob/__init__.py",
                     "memory_ob/web/index.html", "provider/memory_ob/__init__.py", "release.py"):
            self.assertIn(need, files)
        self.assertFalse([f for f in files if f.endswith((".pyc", ".db")) or "/.brain/" in f])


if __name__ == "__main__":
    unittest.main()
