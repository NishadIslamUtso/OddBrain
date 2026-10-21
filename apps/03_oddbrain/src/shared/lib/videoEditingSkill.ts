import type { SkillDraft } from './installedSkills'

export const KDENLIVE_SKILL_REFERENCE = {
  repository: 'https://github.com/lucasscariot/kdenlive',
  commit: 'b9a1a6ce0612d9bb6be2b7df2473c2ffbe71e798',
  upstreamPath: 'docs/skills/kdenlive-mcp-editing/SKILL.md',
} as const

/**
 * Independently written OddBrain adaptation of the reviewed upstream workflow.
 * It names only published protocol operations and does not bundle Kdenlive code.
 */
export const KDENLIVE_EDITING_SKILL_BODY = `# Kdenlive native reviewed editing

Use this workflow whenever video evidence must become a real Kdenlive edit.
Kdenlive is the only authority for timeline state, preview, Undo, project files,
renders and exports. OddBrain stores evidence, searches resources and gathers
owner approval; never create a second timeline or rewrite an open project file.

## Read before planning

1. Use OddBrain video tools to list evidence. Read only relevant complete
   transcript sections. If the question needs more visual proof, request 1–6
   extra timestamp windows and preserve descriptions as unconfirmed notes.
2. Call oddbrain_kdenlive_state. Record documentUrl, sequenceId, revision,
   profile, Undo state and returned history. OddBrain deliberately withholds the
   native editing session secret, so direct editing cannot bypass owner review.
3. For library needs, call oddbrain_creative_search with purpose and placement.
   Rank source, creator, licence, fit and duration. Downloads remain owner-only.

## Propose; do not apply

Create one oddbrain_edit_plan_propose object with the exact current project
identity and native batch commands. Prefer stable track tags such as V1 and A2.
Keep linked camera audio grouped. Put cuts, captions, B-roll, music, ducking,
titles, fades, effects and reframing into clear passes when one huge pass would
be hard to inspect. The proposal is not permission.

OddBrain will call desktop_batch_validate where the native server supports it,
show the exact commands, check the revision again and, only after owner approval,
apply desktop_batch as one shared Undo step. Never call a Kdenlive editing tool
directly to bypass that review.

## Inspect and improve

After Apply, call oddbrain_kdenlive_state again. Capture checkpoints with
oddbrain_kdenlive_frame at the opening, cuts, titles and ending without moving
the playhead. For motion or sound, name exact ranges for the owner to inspect in Kdenlive’s
monitor; the safe AI connector cannot start a render. Judge
caption readability, pacing, reframing, transitions, speech/music balance and
visual continuity. Submit a fresh exact plan for any improvement and wait again.

## Export

Export only after the owner approves the reviewed result. Tell the owner to use
Kdenlive’s own render and verification controls; OddBrain’s safe connector does
not expose direct render. Never claim an export succeeded without real readback. Technical
verification is not editorial approval. If a call is interrupted, do not retry
with a new request ID: read state and history first and report uncertainty.
`

export function kdenliveEditingSkill(engine: 'claude-code' | 'agy'): SkillDraft {
  return {
    engine,
    name: 'kdenlive-native-reviewed-editing',
    description: 'Read OddBrain video evidence, propose exact native Kdenlive batches, wait for owner review, inspect previews, improve, and verify export while Kdenlive remains authoritative.',
    body: KDENLIVE_EDITING_SKILL_BODY,
    requirements: `Separate installed Kdenlive native MCP compatible with reviewed reference ${KDENLIVE_SKILL_REFERENCE.commit}; OddBrain video-review MCP; no paid provider.`,
    replaceExisting: false,
  }
}
