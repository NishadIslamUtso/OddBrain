# OddBrain

This repo holds **Memory_OB** — the memory module for
[Goose](https://github.com/block/goose) — plus the source it is built from.

There is no OddBrain app. Goose is the platform; features arrive as modules.

- **[MEMORY_OB.md](MEMORY_OB.md)** — what Memory_OB is, how to use it, what's done, what's left.
- **[packages/Memory_OB/goose-addon/README.md](packages/Memory_OB/goose-addon/README.md)** — the addon guide (install, history import, Review window).

## Get Memory_OB (one link, one prompt)

**1 — Download the package** (it saves to your Downloads folder):

https://raw.githubusercontent.com/NishadIslamUtso/OddBrain/arena/81a07155-oddbrain/release/Memory_OB-addon-0.9.7.zip

**2 — Open PowerShell and paste this one line:**

```powershell
$z=(Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "Memory_OB-addon-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName; Expand-Archive $z $env:USERPROFILE -Force; Set-Location "$env:USERPROFILE\Memory_OB-addon"; $cfg="$env:APPDATA\Block\goose\config\config.yaml"; if(!(Test-Path $cfg)){$cfg="$env:APPDATA\Block\goose\config.yaml"}; if(!(Test-Path $cfg)){$cfg="$env:USERPROFILE\.config\goose\config.yaml"}; $brain="$env:USERPROFILE\Documents\OddBrain\Memory_OB"; node import-goose-history.mjs --brain $brain --apply --yes; "ALLOW" | node install.mjs --goose-config $cfg --brain $brain
```

It imports your Goose history into `Documents\OddBrain\Memory_OB` **first**
(history must go in before install switches Goose's stock memory off), then
installs. The `ALLOW` in the line is your approval — the exact change is
printed before anything is written. Restart Goose afterwards.

**If Goose ever drops your own extensions from its Extensions page** (its
config writer discards entries whose old shape no longer parses), one line
brings them back rebuilt in the current schema — ask for the
`fix-goose-extensions.mjs` line.

**Your screens live inside Goose itself.** Ask Goose *"show my memory
screens"* and one app renders **in the conversation** with **Projects, Vault
and Review as tabs** — live memory state every time you ask (the MCP Apps
contract: the `memory_ob_screens` tool is linked to a `ui://` screen). Its
**Refresh** button asks the chat for the screens again. Records marked Never
Send never appear in any screen. The installer also drops a stamped snapshot
beside your other apps (`data\apps\memory-ob.html`, on the sidebar's Apps
page) that says when it was captured and how to get live screens. Approving
or denying memory always happens on the confirmation card in the chat. The
full interactive window is still there when you want it:
`Documents\OddBrain\Memory_OB\Open Screens.cmd`.

**Every future module ships the same way** — this is the pattern:

1. A ready-to-run package on GitHub: `release/<module>-<version>.zip`.
2. One download link + one PowerShell line in that module's README section —
   history/import steps always come before anything that changes a tool.
3. Each module's data lives in its own folder under `Documents\OddBrain\<Module>`
   — never mixed with the owner's other files.

## In this repo

- `packages/Memory_OB/` — the Memory_OB package: Goose addon, skill, tests.
- `apps/03_oddbrain/` — the source the memory core is compiled from (the
  engines behind the addon and the Review window). Not an app to install.
- `MEMORY_OB.md` — the only status/plan document. Anything else that used to
  live here (old rulebooks, plans, diaries) was retired as stale AI-written
  notes; Git history keeps them if ever needed.
