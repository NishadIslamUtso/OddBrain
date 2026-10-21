import type { VaultFiles } from '../vault/files'
import { actOnReviewItem, emptyReviewCenter, externalReviewPacket, importExternalReview, reviewCenterProblem, scanReviewCenter, type ReviewCenterState } from '../../shared/lib/reviewCenter'
import { createMemoryWorkspace } from './workspace'

const STATE = '06 Review/OddBrain Review/state.json'
const REPORTS = '06 Review/OddBrain Review/Runs'

const report = (state: ReviewCenterState): string => {
  const run = state.runs[0]
  if (!run) return '# OddBrain interpretation review\n\nNo review has run yet.\n'
  const open = state.items.filter(item => item.status === 'open')
  return `# OddBrain interpretation review — ${run.createdAt.slice(0, 10)}\n\n` +
    `Scope: ${run.from ? `${run.from.slice(0, 10)} through ${run.to.slice(0, 10)}, plus directly linked older evidence` : `all history through ${run.to.slice(0, 10)}`}\n\n` +
    `Checked ${run.checked} in-range interpretations and ${run.linkedOlder} directly linked older interpretations. Found ${run.generated} review candidates; ${open.length} remain open.\n\n` +
    `This report is a question list, not a rewrite of confirmed memory. Archive and deletion are separate owner-confirmed actions.\n\n` +
    open.map(item => `## ${item.title}\n\n**${item.kind}** — ${item.detail}\n\n${item.evidence.map(value => `- ${value.provider} · ${value.role}${value.speaker ? ` · ${value.speaker}` : ''} · observed ${value.observed}\n  - Source: \`${value.path}\`\n  - Coverage: ${value.coverage}\n  - SHA-256: \`${value.sha256}\`${value.quote ? `\n  - Quote: “${value.quote.replace(/\s+/g, ' ').slice(0, 600)}”` : ''}`).join('\n')}\n`).join('\n') + '\n'
}

export function createReviewCenter(files: VaultFiles, clock: () => string = () => new Date().toISOString()) {
  const read = (): ReviewCenterState => {
    const raw = files.read(STATE)
    if (!raw && !files.exists(STATE)) return emptyReviewCenter()
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw Error(`Review state is not readable as JSON (${STATE}). It was not replaced or reset.`) }
    const problem = reviewCenterProblem(value)
    if (problem) throw Error(`Review state needs repair: ${problem} (${STATE}). It was not replaced or reset.`)
    return value as ReviewCenterState
  }
  const save = (state: ReviewCenterState): void => { files.writeAtomic(STATE, JSON.stringify(state)) }
  return {
    read,
    scan(days: number | null = 60): ReviewCenterState {
      const state = scanReviewCenter(read(), createMemoryWorkspace(files, clock).read(), { days, now: clock() })
      save(state)
      const current = report(state), run = state.runs[0]
      files.writeOnce(`${REPORTS}/${run.createdAt.slice(0, 10)}-${run.id}.md`, current)
      return state
    },
    act(id: string, action: 'answer' | 'keep' | 'forget-candidate' | 'dismiss' | 'reopen', answer = ''): ReviewCenterState {
      const state = read(); actOnReviewItem(state, id, action, clock(), answer); save(state); return state
    },
    packet(): ReturnType<typeof externalReviewPacket> { return externalReviewPacket(read()) },
    import(input: { provider: string; response: string; packetSha256: string }): ReviewCenterState {
      const state = read(); importExternalReview(state, input, clock()); save(state); return state
    },
  }
}

export type ReviewCenter = ReturnType<typeof createReviewCenter>
