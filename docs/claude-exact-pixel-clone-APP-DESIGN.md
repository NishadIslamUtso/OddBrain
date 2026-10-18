# Claude — app design notes

How the app should look and behave, in the user's own words. This is the
behavioural counterpart to `docs/claude-exact-pixel-clone-PRD.md`, which covers
requirements, pixels and architecture.

Where these two documents disagree on **appearance**, the PRD wins (it carries
the user's explicit hex values). Where they disagree on **behaviour**, this
document wins.

---

## Opening an artifact

Command-click (`Ctrl+click` on Windows) an artifact to open it. It must not
hijack a plain left click — a normal click keeps its normal meaning.

## Model switch

Switching the model is a first-class action, always reachable from the composer.
It must show which model is actually loaded and whether the local backend is up,
because on this machine the answer is sometimes "no".

## Slash menu

Typing `/` in the composer opens a menu. It is the discoverable entry point to
everything the composer can do, not a decorative affordance.

## Attachments

**You can click attachments to open them.** An attachment that cannot be opened
must say so rather than doing nothing.

## Keyboard shortcuts

Shortcuts are documented in-app, not just in this file. The table lives in the
app's help/settings surface next to the other discoverable controls.

## Chrome automation

The browser automation path exists so the app can act on real pages. It is a
tool the model can use, gated behind an explicit user action.

## Agent (Cowork)

The agent — Claude's "Cowork" — works a task in its own context. Its output does
not pollute the main transcript: nothing is appended to the open chat until the
user presses **Insert into composer**. That separation is the point.

## Tasks

Tasks are **recurring and scheduled**, and they run **without needing a
session**. A task is a standing instruction the app executes on a schedule, not a
conversation you have to be present for.

### Task: sub-agents and reusable instructions

Sub-agents run a task in an isolated context with their own role and their own
instruction. Any instruction can be **saved as a named skill** and reused on any
sub-agent afterwards. This is modelled on open-design's skills mechanism: a
capability is data you can add, edit and delete — not code that has to be
shipped.

### Task: use the local model for tasks, not the Claude API

Tasks must run against the **local** model (`qwen2.5:3b` via Ollama), not the
Claude API. A scheduled task that silently needs a paid, networked API is not a
feature this machine can rely on.

## Cross-references

- Requirements, pixels, architecture: `docs/claude-exact-pixel-clone-PRD.md`
- Measured pixel values (reference only): `spec/MEASURED_PIXELS.md`
- Feature grading across all apps: `spec/PARTIAL_FEATURES_AUDIT.md`
- Merge sequencing: `spec/MERGE_PLAN.md`
