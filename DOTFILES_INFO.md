# Dotfiles Info — Why .ai and .gitignore May Appear Missing

GitHub web UI Upload files drag-drop sometimes HIDE dotfiles (.ai folder and .gitignore file) because OS hides dotfiles.

This repo INCLUDES them, but also provides VISIBLE copies:

- .ai/ — Real AI-optimized folder (dotfolder, hidden on some OS). Contains AGENT_INSTRUCTIONS.md, CONTEXT.json, STATE.json, INDEX.json
- ai/ — VISIBLE mirror of .ai/ for GitHub web upload. Same contents + README_VISIBLE_MIRROR.md
- .gitignore — Real gitignore (dotfile)
- gitignore.txt + GITIGNORE.txt — Visible copies of .gitignore

When you git add . via command line, .ai/ and .gitignore ARE included (verified via git status). They are untracked and not ignored.

If you use GitHub web UI upload, upload BOTH dot and visible versions, or use git push via command line.

All zips include .ai and .gitignore (verified via unzip -l).
