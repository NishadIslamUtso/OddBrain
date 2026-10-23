# Memory_OB 0.9.8 — Goose addon

**Download:** [Memory_OB-addon-0.9.8.zip](./Memory_OB-addon-0.9.8.zip)

**SHA-256:** `d24359aae5396dc0730682ec716f7a58c91552e823d4a7b0cd872f2cd771526a`

**Source:** commit `0d5f5ce95fb2cce017dc42b9d539dee65f8afc6e`, with [`0.9.8-from-0d5f5ce.patch`](../packages/Memory_OB/0.9.8-from-0d5f5ce.patch) (SHA-256 `e7c54769f1f054012a792b565252c45f5ee1503500579489520e8e8de7ccf6b0`). Rebuild with [`build-0.9.8.sh`](../packages/Memory_OB/build-0.9.8.sh) from a clone containing that source commit, Node.js 24, npm, Python 3, and build dependencies. The build does not switch branches or pull in the unrelated desktop-app changes.

## What changed, and what did not

- The **in-chat** MCP App exposes three read-only tabs: Projects, Vault, Review. Refresh now reads the current screen directly from this extension's `resources/read` bridge without a new model request. The copy on Goose's **Apps page** is only a stamped, installation-time snapshot and has no fake Refresh button.
- The installer no longer writes a hole of zero bytes at the start of Goose's `config.yaml`. It refuses to touch a config that already contains zero bytes, or one with duplicate `memory_ob` extension blocks. It backs up the config before changing it. It will replace an Apps-page snapshot only when its path and SHA-256 match a prior install receipt; a changed or unowned snapshot is left alone.
- `memory_ob_propose` remains model-callable, but now creates **only an unconfirmed pending draft**. Even a direct call, or repeated calls, cannot mark it owner-approved. Inspect and decide on it in the **local Brain Window Review**, not in Goose chat. A Goose permission prompt is **not** an independent owner-authentication mechanism. The Brain Window is a local UI workflow, not a cryptographically authenticated owner-only boundary. A proposed quotation must match a chat already stored in Memory_OB: Goose's current conversation is **not automatically imported**.
- Full Project editing, Vault features, and Review approval/history/undo are **not** implemented in the Goose tabs. They require `node brain-window.mjs`, which opens a separate local browser window but does not install the OddBrain desktop app. **Do not treat this as a fully functional three-screen interface inside Goose.** The addon does not set up your Ollama Cloud account or download a local model.

### Important if you used an earlier installer

An older installer could prepend NUL (zero) bytes to Goose's config, potentially making it invalid. **Do not run 0.9.7 again.** Before updating, locate your *actual* Goose config and run this read-only PowerShell check on your Windows computer. It prints only byte counts and backup filenames, not your config contents:

```powershell
$cfg = Join-Path $env:APPDATA 'Block\goose\config\config.yaml'
if (-not (Test-Path -LiteralPath $cfg)) { throw 'Find the actual Goose config path first.' }
$b = [IO.File]::ReadAllBytes($cfg)
$leading = 0; while ($leading -lt $b.Length -and $b[$leading] -eq 0) { $leading++ }
$zeros = 0; foreach ($byte in $b) { if ($byte -eq 0) { $zeros++ } }
"Zero bytes in config: $zeros (leading: $leading)"
Get-ChildItem -LiteralPath (Split-Path $cfg) -Filter 'config.yaml.oddbrain-original*' |
  Select-Object Name,Length,LastWriteTime
```

If the zero-byte count is nonzero, **stop**. Copy the current file and the backups to a safe place; compare them offline and manually repair the config before using this installer. Do **not** blindly restore a backup: it may predate your other extensions or provider settings. Do not share config contents or provider credentials. Version 0.9.8 does not attempt an unsafe automatic repair.

Old `memory_ob_propose` calls could have been saved as “owner-confirmed” without proof of an owner click. The new version does not silently demote old records. Back up the brain and inspect questionable confirmations in the local Brain Window Review before correcting or withdrawing them.

## Safe Windows installation

1. Keep a copy of your existing brain and Goose config. Check the ZIP's SHA-256 (`Get-FileHash .\Memory_OB-addon-0.9.8.zip -Algorithm SHA256`), then extract it. Use **Node.js 24**. Let Goose create its config once, then close Goose before the steps below.
2. From the extracted `Memory_OB-addon` folder, preview any old-history import using `node .\import-goose-history.mjs`. If and only if you want that import, run `node .\import-goose-history.mjs --apply` and review its `ALLOW` prompt. Import before disabling Goose's stock memory; do **not** pipe `ALLOW` or use the importer's `--yes` shortcut.
3. Set `$brain` to the **existing** Memory_OB folder if you have one (do not accidentally start a second brain). Preview the config change with `node .\install.mjs --goose-config $cfg --brain $brain --print-only`. Then run the same command **without** `--print-only`, read its proposed changes, and type `ALLOW` only if they are correct.
4. Restart Goose. Verify the `memory_ob` extension is enabled, stock `memory` is disabled, the in-chat `memory_ob_screens` tool opens Projects/Vault/Review, and Refresh shows updated data. Keep `memory_ob_propose` on **Ask Before**, never Always Allow; inspect any draft in the local Brain Window Review. Disable unrelated Goose file/shell/network tools if they can reach your local brain or Brain Window. These are **real-machine acceptance steps, not claims that they already passed**.

After extracting the ZIP, read its `README.md` and `MANIFEST.md` for all commands, the offline checksums and the limitations. The ZIP contains prebuilt code; it does not require a paid dependency or a locally downloaded model. If you choose Ollama Cloud as Goose's provider, prompts and tool results sent to that provider are **not** local-only, although the memory store stays on your computer.

## Verification performed here

Using Node.js 24 on Linux: dependency install, TypeScript typecheck, the adapter, Brain Window, web build, packaging, ZIP integrity, all **30** manifest payload hashes, source/patch provenance and safe archive paths passed. Isolated smoke checks exercised MCP screen metadata, changing resources, Refresh's host bridge without a model call, Never Send filtering, the pending-only writer including a repeated direct call, and installer preview/install/reinstall/ownership/corruption refusal against throwaway fixtures. The pre-existing test suite was intentionally **not** run, per the owner's instruction. **No Windows, Ollama Cloud, or live Goose installation was used for acceptance.**
