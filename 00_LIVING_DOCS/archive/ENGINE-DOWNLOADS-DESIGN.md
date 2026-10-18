# ENGINE-DOWNLOADS-DESIGN.md — item 8, designed for his go (2026-10-16)

*His decision: the trio is downloaded INSIDE the app, into locations under the app's control; no Ollama desktop app, only the functions; logins redirect to terminal or browser. Home: Engine page (my wish) mirrored on the Models page. Nothing here is built until he says go.*

## The rule
The app ships NONE of the binaries (bundling rejected: licensing, drift, size). It DOWNLOADS them, at his press, from each project's OFFICIAL endpoint only, verifies what landed, and owns the result: folder, version, PATH, removal.

## Where
`userData/engines/<engine>/` — the app's own data folder, one subfolder per engine. Survives app updates, shows size + version + a Remove button, never touches a machine-wide install (a machine's own claude/ollama stays sacred; app-managed is separate).

## Per engine
- **Ollama (headless runtime):** download the official platform archive (Windows build from ollama.com's own endpoint), verify the published checksum, unpack into `engines/ollama/`. The app starts `ollama serve` itself on the app's own port (11434 today; the app sets OLLAMA_HOST), starts it on demand, stops it on quit. Model pulls ride the existing pull door. No tray, no desktop app, nothing autostarts.
- **claude-code:** prefer the project's native installer script (no Node needed on the machine); npm `--prefix engines/claude-code` as the fallback when npm exists. Whatever lands is wired by absolute path at spawn — no PATH guessing for app-managed engines.
- **agy:** Google's official Windows installer download, checksum when Google publishes one (recorded honestly as "endpoint official, checksum not published" when not).

## Login (his redirect rule)
- claude-code: its own login prints a code + opens the browser; the app shows the exact command and a "open terminal instructions" card, then re-detects.
- agy: Google's OAuth in the browser; same card pattern.
- Ollama: no login, it is offline by nature.

## The card (permission-first, like everything)
Install → permission card: exact URL, exact destination, exact size, checksum source → Approve → download with progress → verify (refuse one changed byte) → install → re-detect → the engine's card flips to "installed (app-managed) · version". Deny changes nothing.

## Detection order
App-managed paths FIRST, then the machine's PATH (today's behavior). Engine page labels which is which: "app-managed" / "on this machine".

## Tests (designed now, written at build)
URL allowlist: only the three official endpoints pass; checksum refuse-on-mismatch; headless serve lifecycle (start on demand, stop on quit); spawn wiring by absolute path; detection order; card shows size+URL before any byte moves.

## Honest limits
Installer URLs churn — a dead endpoint is an honest error naming the URL, never a retry against a mirror. AV may ask about first-run binaries (they are the official signed ones). First true end-to-end proof is the TUF A15 (real disk, real Defender, real browser).
