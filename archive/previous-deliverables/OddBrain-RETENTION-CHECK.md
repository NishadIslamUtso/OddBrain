# Corrected retention status · v2

The two confirmed v1 omissions are implemented and regression-tested: real Auto-keep On/Off at each approved file write, and real automatic/manual second-pass review through a tool-free text transport. Additional control omissions found by the audit were restored as described in README.md.

All 221 original dispatcher action ids have explicit purpose-to-native-source traceability in checks/RETENTION-AUDIT.json/.csv. This is not a claim of 221 independent runtime tests. Duplicate/cosmetic dialogs are consolidated, fake demo effects use actual native flows, and mobile-menu is intentionally out of scope under the owner's Windows-PC requirement.

Strict typecheck, production builds, unit/regression tests, renderer browser tests and actual Electron main/preload/renderer filesystem/HTTP-fixture tests are recorded in RESULTS.json. The native test verifies the real Settings controls, live-session On/Off effect, checkpoint bytes before Allow, one automatic text-only review, external-review refusal, Trash recovery and independent memory-folder/instruction updates.

Remaining platform acceptance: no human-opened Windows installer on the owner's PC is claimed. Real Windows startup, warm runtime, global shortcut, OS dialogs, authenticated providers/models and extension capture need the normal Windows release checks. Auto-keep protects app-approved file tool changes, not actions bypassing app cards. agy needs a separately selected safe text reviewer; its agent is never falsely labeled tool-free.
