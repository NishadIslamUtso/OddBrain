# Memory Schema

The vault is a dynamic graph, not a rigid life-category tree. Create entities when a person, project, topic, course, routine, goal, or other subject becomes meaningful. One-off trivial mentions may remain in the source transcript. Important memories link across entities and events.

## Valid example record

Format example only; it contains no fact about the user.

```yaml
id: "example-claim-001"
entity: "[[example-entity]]"
type: fact
status: confirmed
evidence: user-stated
source: "[[example-source]]"
source_message: "message-id-or-short-source-passage"
captured_at: "2026-10-10T12:00:00+06:00"
occurred_at: ""
time_valid_from: ""
time_valid_to: ""
importance: normal
sensitivity: ordinary
retention: keep-until-user-deletes
confidence: high
related: []
```

## Allowed values

- `type`: `fact`, `preference`, `event`, `decision`, `goal`, `routine`, `task`, `observation`, `hypothesis`.
- `status`: `candidate`, `confirmed`, `disputed`, `superseded`, `expired`, `archived`.
- `evidence`: `user-stated`, `user-confirmed`, `assistant-suggestion`, `observed-pattern`, `hypothesis`.
- `importance`: `low`, `normal`, `high`, `pinned`.
- `sensitivity`: `ordinary`, `sensitive`, `local-only`.
- `retention`: `current`, `time-limited`, `keep-until-user-deletes`.

## Status and evidence meaning

- `confirmed`: the note faithfully represents its evidence. For a quote, it means the source supports that the user said it—not that the claim was independently verified in the world.
- `candidate`: uncertain extraction, interpretation, or relationship; use only when genuinely uncertain, not as a save-everything approval gate.
- `disputed`: source evidence conflicts for the same time and is unresolved.
- `superseded`: newer dated evidence changed the current value; preserve history.
- `expired`: no longer current; retain the source/history.
- `archived`: inactive derived note retained outside active working context.

Evidence labels:

- `user-stated`: directly stated by the user.
- `user-confirmed`: explicitly accepted/corrected by the user.
- `assistant-suggestion`: AI-generated; not a personal fact unless adopted.
- `observed-pattern`: repeated dated evidence; not automatically causal.
- `hypothesis`: interpretation, clearly marked and not treated as fact.

## Structure rules

- A memory statement should be independently correctable. Put claims as dated sections on an entity/event note by default; do not create thousands of tiny files unless separate notes are useful.
- Every important claim/link needs its own source, capture date, event/validity dates where known, and evidence label.
- A link between two notes does not imply causation.
- Keep different dates as history; ask about a real same-time conflict when it matters.
