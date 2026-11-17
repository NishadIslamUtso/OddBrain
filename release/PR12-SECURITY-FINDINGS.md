# PR #12 security checks — the full findings, in plain words

*Requested by the owner after the "is it all done?" audit. All of this is in
the RETIRED old app (`apps/03_oddbrain` and friends) — **zero findings touch
the Memory_OB engine** (`memory_ob/`, `host/`, `provider/`, the update zips).*

## What is failing on the PR

| check | what it says | why |
|---|---|---|
| **CodeQL** | 5 new alerts (2 high, 3 medium) | code-scanning of the old app's TypeScript |
| **dependency-review** | fail-closed fallback failed | the PR touches the old app's `package-lock.json`, so the workflow audits it — **15 known vulnerabilities (8 high)** live in that old lockfile *(reproduced locally: `npm audit` on `apps/03_oddbrain`)* |

Both pass or fail on **retired code**. The live engine is not scanned by
either check in a way that found anything.

## The 5 "new" CodeQL alerts (the ones blocking the PR)

| where | rule | plain words | is it a real problem? |
|---|---|---|---|
| `memoryOb/gooseImport.ts:182` | Potential file system race condition | check-then-use on a file | Pattern flag. The codebase writes with exclusive-create (`flag: 'wx'`) and treats "file already there" as fine — the race is handled. |
| `memoryOb/store.ts:491` | Potential file system race condition | same pattern | Same answer — the write at that line uses exclusive-create and ignores the already-exists case on purpose. |
| `media/provider.ts:65` | File data in outbound network request | saved text is sent over the network | **By design**: sending text to the owner's own AI/embedding endpoint is what the app does. The rule cannot see "the endpoint is yours". |
| `memoryOb/semantic.ts:91` | File data in outbound network request | same | Same — this IS meaning search (text → embedding endpoint, your own llama.cpp at 18435). |
| `memoryOb/semantic.ts:147` | Network data written to file | numbers from the embedding API get saved to the index file | Low real risk: values are `JSON.stringify`-ed into a permission-0600 index. A hostile embedding server could only put odd numbers in your own index. |

**The 2 "high" ones are the two race-condition flags.** The code they flag
already defends against the race; the scanner can only see the pattern.

## The wider picture — 52 CodeQL review comments on the PR (all retired code)

| rule | count | where | worth caring about? |
|---|---|---|---|
| File system race condition | 28 | old app + 3 goose-addon installer + 1 extension preview server | Mostly handled in-code (exclusive-create style) |
| Insecure temporary file | 7 | `safeFile.ts`, `vault/files.ts` | Notable **if the app were alive** — the "safe file" helpers use predictable temp names the scanner dislikes |
| Incomplete URL substring sanitization | 8 | test files only | Test-code hygiene |
| File data in outbound network request | 4 | embedding/model discovery paths | Design property (search sends text) |
| Password hash insufficient | 2 | `engine/socket.ts:95,98` | **False alarm by inspection**: the line is a 600,000-iteration PBKDF2-SHA256 with a random per-process salt — used as a *fingerprint to detect key rotation*, not a password store. That meets OWASP's PBKDF2 guidance. |
| Indirect uncontrolled command line | 1 | `engine/marketplace.ts:48` | **Hardened in-code**: refuses `.cmd/.bat` shims, runs `spawn` with `shell: false` and an explicit args array |
| Network data written to file | 1 | `semantic.ts:147` | As above — low |
| Missing regex anchor | 1 | test file | Test-code hygiene |

## The dependency-review failure — reproduced exactly

The security workflow's fallback runs `npm audit --audit-level=high` on
`apps/03_oddbrain/package-lock.json` whenever the PR touches that lockfile.
I ran the same command here: **15 vulnerabilities — 8 high** — all in the old
app's build toolchain:

- `electron` — "HID and USB permission checks can be attributed to the wrong origin" (fix: electron 45.x, major bump)
- `vite` — "`server.fs.deny` bypassed with queries" (fix: vite 6.4.6)
- `picomatch` — ReDoS via repeated extglobs (fix: via electron-builder 24.13.3, major bump)
- plus `@electron/rebuild`, `app-builder-lib`, `node-gyp`, `tinyglobby`, `fdir` (toolchain of the above)

These are **development/build-time packages of the retired app**. None ship
in Memory_OB.

## What this means

1. **Memory_OB itself (the thing we use) is clean** — none of these findings
   are in the engine, the installer, or the zips.
2. The old app's code is mostly *hardened where it counts* (the hash is
   strong, the command line is contained, the file races are handled) —
   the scanner flags patterns it cannot prove safe.
3. The PR's red checks would keep firing **for any branch that touches the
   old app's files**, until either the findings are fixed/dismissed or the
   checks are scoped away from retired code.
