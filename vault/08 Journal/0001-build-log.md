---
title: "Brain plugin build log — Oct 29"
kind: journal
status: demo
created: 2026-10-29T23:00:00+06:00
modified: 2026-10-29T23:30:00+06:00
tags: [build, plugin, debugging]
source: agent
---

Built Brain plugin in one session: desktop plugin (React, theme-synced),
Python FastAPI backend, vault folder structure, agent skill.
Issues fixed: SDK ctx shape, doubled REST paths, Response-vs-JSON wrapper.
Vault is read-only from the frontend; writes go through Review proposals.
