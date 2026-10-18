# Git, Backup & Recovery

- Local Git: optional local version history. Commit vault changes locally.
- Remote push: = external upload. Show destination + exact diff, require approval. Never auto-push private data.
- Backup: only to destination user trusts. No full-disk encryption assumed, protect Windows account.
- Recovery: .brain/ rebuildable from Markdown. Delete .brain/ anytime to rebuild index.
- Originals in 02 Sources/ preserved until user explicitly chooses deletion.

Commands (one step at a time, wait for result):
1. git init (if not already)
2. git add .
3. git commit -m "vault snapshot YYYY-MM-DD"
4. For remote: git remote add origin <url> -> show url -> ask approval -> git push
