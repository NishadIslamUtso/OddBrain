# Running the tests

On a fresh machine, one setup runs everything:

```
python -m venv .venv
.venv\Scripts\pip install -e ".[test]"        (Windows)
.venv/bin/pip install -e ".[test]"            (Linux/Mac)
.venv/bin/python run_tests.py
```

The `[test]` extra carries everything the suite needs — including `httpx2`,
the new name of the test package that starlette's test client wants (older
machines still get the old `httpx` name too, pinned to the range that works).
No other installs are needed.

`tests/browser/` holds the click-through browser checks. They are separate:
they need a browser and are run by hand — see `tests/browser/README.md`.
