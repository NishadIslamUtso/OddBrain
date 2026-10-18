# Questions to orchestrator

## Q1 — AV decoder registry boundary

**CONTEXT**
The latest branch tail still assigns the shared intake door and document decoders to `arena/6d6aabbf`, and says AV should register there or remain behind an AV module boundary without creating another intake door. This branch has no `src/main/media` registry at baseline. Its current AV decoders use renderer/shared APIs (`AudioContext`, video element/canvas, and image decoding) through `App.addFiles`; the shared intake implementation is owned by the other lane. The allowed new-code paths do not include changing that intake door or its preload/shared contract.

**QUESTION**
What exact registry API/path should AV target? If the owner registry is not available on this branch yet, should I wait for its contract, or add a narrow adapter under `src/main/media` without wiring a second door? Please specify the expected adapter boundary if that is the intended fallback.

**WHAT YOU TRIED**
Pulled `arena/9a3a5c88-oddbrain` fast-forward-only; it was already current. Re-read the tail of `ODD-BRAIN-BRIEF.md` and checked `QUESTIONS-TO-ORCHESTRATOR.md` (not present). The baseline check recorded in `REPORT-TO-ORCHESTRATOR.md` found no main-process media/decode registry. I did not edit the intake door, switch branches, or add an unverified registry contract. No tests were run in this turn.
