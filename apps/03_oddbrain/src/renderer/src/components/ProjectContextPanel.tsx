import { useMemo } from 'react'
import { resolveProjectContext, type ProjectContextSource } from '@shared/lib/projectContext'
import type { Project } from '@shared/lib/projects'

/**
 * ProjectContextPanel — "what a chat can see in this project", made visible.
 *
 * Everything listed comes from the resolver (projectContext.ts), so what
 * the owner reads here is exactly what Part 4 may hand a chat — included,
 * left out, partial, or not read yet, each with its source and its limit.
 * Nothing here uploads anything, and no chat is claimed to know any of
 * this until a chat explicitly uses the project.
 */

const EXTRACTION_LABEL: Record<ProjectContextSource['extraction'], string> = {
  ready: 'ready',
  partial: 'partial — stated limit',
  'metadata-only': 'not read yet',
  'too-large': 'too large for this bundle',
  unreadable: 'could not be opened',
  linked: 'link — not followed',
  excluded: 'left out',
}

export default function ProjectContextPanel({
  project,
  onToggleReference,
}: {
  project: Project
  /** Flip one reference's context choice; the project is the source of truth. */
  onToggleReference: (referenceId: string, include: boolean) => void
}) {
  const bundle = useMemo(() => resolveProjectContext(project), [project])
  const { coverage } = bundle

  return (
    <div className="rounded-lg border border-line bg-bg p-3" aria-label={`Context of ${project.name}`}>
      <p className="text-[12px] leading-relaxed text-muted">
        This is a preview of saved project context, not a record of what was sent. The next send uses these instructions and goals, plus selected references you authorized through Add reference. Other chats are not included. The saved turn shows exactly what was sent. Native engines
        may separately read their working folder under their own permissions; these switches do not change those permissions.
      </p>
      {bundle.sources.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted">Nothing to include yet — add an instruction, a goal, or a reference.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {bundle.sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={source.origin}>
                {source.title}
              </span>
              <span className="shrink-0 text-[10.5px] text-muted">
                {source.kind === 'reference' ? 'file' : source.kind} · {EXTRACTION_LABEL[source.extraction]}
                {source.totalChars !== null ? ` · ${source.chars.toLocaleString()}/${source.totalChars.toLocaleString()} chars` : ''}
              </span>
              {source.kind === 'reference'
                ? (() => {
                    const reference = project.references.find((entry) => `reference:${entry.id}` === source.id)
                    if (!reference) return null
                    return (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={reference.includeInContext}
                        aria-label={`Include ${source.title} in context`}
                        onClick={() => onToggleReference(reference.id, !reference.includeInContext)}
                        className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink"
                      >
                        {reference.includeInContext ? 'Selected for next send' : 'Left out'}
                      </button>
                    )
                  })()
                : null}
              {!source.included && source.reason ? (
                <span className="w-full text-[10.5px] text-muted">{source.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted">
        {coverage.includedSources} ready in this preview · {coverage.excludedSources} not included · {coverage.chars.toLocaleString()} of{' '}
        {coverage.limitChars.toLocaleString()} characters
        {coverage.overLimit ? ' · some material could not be carried whole' : ''}
      </p>
      {bundle.warnings.map((warning) => (
        <p key={warning} className="mt-1 text-[11px] text-muted">
          {warning}
        </p>
      ))}
      <p className="mt-1 font-mono text-[10px] text-muted">project revision {bundle.revision}</p>
    </div>
  )
}
