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

1. Use OddBrain video tools to list the complete local time-map index first.
   Use literal local locate, then read only relevant complete transcript and
   delivery intervals. If Kdenlive already contains a more precise transcript,
   oddbrain_kdenlive_transcript may read bounded word/segment evidence; it must
   never start transcription or pretend an unavailable model is installed. Inspect retained frames before decoding more. If the
   question still needs visual or vocal proof, request 1–6 extra timestamp
   frame/audio windows and preserve descriptions as unconfirmed notes. For
   style analysis, sample the opening, ending, scene changes and representative
   points across the full duration; never infer continuous vision from one still.
2. Call oddbrain_kdenlive_state. Record documentUrl, sequenceId, revision,
   profile, Undo state and returned history. Then call
   oddbrain_kdenlive_timeline for only the tracks, clips, bin items, subtitles,
   effects or range needed by this edit. Use its real IDs; never guess them.
   OddBrain removes native editing secrets and bin file paths, so direct editing
   cannot bypass owner review.
3. For library needs, call oddbrain_creative_search with purpose and placement.
   Rank source, creator, licence, fit and duration. Downloads remain owner-only.
   A proposal with non-empty assetNeeds is intentionally not applicable. After
   the owner approves/imports exact assets, read the bin again and submit a
   fresh plan with those real bin IDs and no unresolved needs.

## Propose; do not apply

Create one oddbrain_edit_plan_propose object with the exact current project
identity and native batch commands. Prefer stable track tags such as V1 and A2.
Keep linked camera audio grouped. Put cuts, B-roll, music, ducking, titles,
fades, effects and reframing into clear passes when one huge pass would be hard
to inspect. For reviewed burned-in captions, use exact timed title_create commands and the
owner’s chosen local caption style, then inspect readability. The pinned protocol
reads subtitles but does not write a native sequence caption track, so preserve
caption text/style files and name that visible manual Kdenlive step when the
owner needs editable/exportable subtitle tracks; never invent a subtitle command. The proposal is not permission.

OddBrain will call desktop_batch_validate where the native server supports it,
show the exact commands, check the revision again and, only after owner approval,
apply desktop_batch as one shared Undo step. Never call a Kdenlive editing tool
directly to bypass that review.

## Inspect and improve

After Apply, call oddbrain_kdenlive_state again. Capture checkpoints with
oddbrain_kdenlive_frame at the opening, cuts, titles and ending without moving
the playhead. Ask the owner to approve a ten-second-or-shorter Kdenlive preview
for ranges where motion or sound matters. After Kdenlive reports and verifies
completion, the owner must separately approve **Inspect verified preview**.
That creates a distinct durable evidence map; use oddbrain_evidence_inventory,
oddbrain_evidence_search and oddbrain_evidence_expand to inspect its complete
mixed-audio transcript/delivery and selected frames. You cannot start, cancel or
approve either operation. Judge caption readability, pacing, reframing,
supported fades/effects, speech/music balance and visual continuity. The pinned protocol cannot create cross-track
compositions, so mark those transitions as manual Kdenlive steps rather than
claiming they were applied. Submit a fresh exact plan for improvements and wait.

## Export

Export only after the owner approves the reviewed result and the separate final
export card in Video Studio. OddBrain sends that one reviewed request to
Kdenlive, then reads native status and verification; the safe AI connector still
cannot start an export. Never claim success without real readback. Technical
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
