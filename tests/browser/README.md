# Browser checks

Real-browser checks of the screens (Chromium through Playwright). They cover:
the whole Review/Vault/People/Journal/Me/Settings flow, light and dark colours
(contrast is measured, not eyeballed), a narrow phone-size screen, the Vault
(tree, note, graph, filters), the one-card-per-message summary, the check-up,
and two things happening at once.

They are **not** part of `python run_tests.py` because they need a browser.

```
npm install -g playwright
npx playwright install chromium
python tests/browser/run.py            # all of them
python tests/browser/run.py ui_vault   # one
```

Each script gets its own throw-away vault (no Hermes, no AI helper, simple
rules), seeded by `seed.py`. Screenshots land in `tests/browser/shots/`.
Nothing here touches your real memories.
