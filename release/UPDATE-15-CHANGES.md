# Memory_OB update-15 — what changed (plain words)

Built on top of update-14. **49 test suites pass — including on a completely
fresh setup with one install command and nothing else.**

## 1. The test kit stops tripping fresh machines

Setting the tests up on a new computer used to fail "every time": the test
helper package was renamed (`httpx` → `httpx2`) and the install recipe still
asked for the old name, in a version range that the newest helper no longer
supports.

Now `pip install -e ".[test]"` carries both names with working version
ranges, and the whole suite runs right after — no manual fixes. The exact
commands are written down in `tests/README.md`.

## That is the whole change

No behaviour changes — this is the builder-pain fix (B11) that lets anyone
check the work on their own machine.

**The A1–A12 build list in TODO.md is now complete.**
