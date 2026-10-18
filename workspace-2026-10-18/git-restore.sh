#!/bin/bash
# .git/config is excluded from snapshots AND the object store can come back
# stale (size cap). Restore the remote + identity, then ALIGN: fetch the tip
# and reset --mixed onto it BEFORE any commit, or the commit parents on a
# dead line and the push is rejected. Run this at session start.
cd /home/user/repo-check
git remote add origin https://github.com/NishadIslamUtso/OddBrain.git 2>/dev/null
git config user.name "Nishad Islam Utso"
git config user.email "nishadislamutso@gmail.com"
TIP=$(git ls-remote origin v3 | cut -c1-40)
git fetch origin v3 >/dev/null 2>&1
git reset --mixed "$TIP" >/dev/null 2>&1
echo "remote tip: ${TIP:0:8} | HEAD: $(git log --oneline -1 | cut -c1-8) | dirty files: $(git status --porcelain | wc -l)"
