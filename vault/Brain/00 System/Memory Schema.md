# Memory Schema

Vault is dynamic graph, not fixed taxonomy. Create entity when meaningful.

## Record fields
```yaml
id: stable-unique-id
entity: "[[entity-id]]"
type: fact | preference | event | decision | goal | routine | task | observation | hypothesis
status: candidate | confirmed | disputed | superseded | expired | archived
evidence: user-stated | user-confirmed | assistant-suggestion | observed-pattern | hypothesis
source: "[[source-id]]"
source_message: message-id-or-passage
captured_at: 2026-10-10T12:00:00+06:00
occurred_at: optional-date
time_valid_from: optional-date
time_valid_to: optional-date
importance: low | normal | high | pinned
sensitivity: ordinary | sensitive | local-only
retention: current | time-limited | keep-until-user-deletes
confidence: high | normal | low
related: ["[[other-entity]]"]
```

## Allowed values
- type: fact, preference, event, decision, goal, routine, task, observation, hypothesis
- status: candidate, confirmed, disputed, superseded, expired, archived
- evidence: user-stated, user-confirmed, assistant-suggestion, observed-pattern, hypothesis
- importance: low, normal, high, pinned
- sensitivity: ordinary, sensitive, local-only
- retention: current, time-limited, keep-until-user-deletes

## Evidence meaning
- user-stated: you said it
- user-confirmed: you explicitly accepted/corrected
- assistant-suggestion: AI generated, not personal fact unless adopted
- observed-pattern: repeated dated evidence, not causal
- hypothesis: interpretation, not fact

## Rules
- Each claim independently correctable, lives as section on entity/event note by default.
- Every important claim needs source + dates + evidence label.
- Link does not imply causation.
- Newer fact supersedes current, history preserved. Different dates != conflict.
- Learning = external inspectable memory, not silent weight retrain.

Example in Templates/Memory Claim.md
