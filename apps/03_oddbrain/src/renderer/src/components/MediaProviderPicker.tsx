import { useEffect, useRef } from 'react'
import type { MediaOperation, MediaProviderOption } from '@shared/lib/media'

export type MediaPickerState = {
  fileName: string
  operation: MediaOperation
  options: MediaProviderOption[]
  reason: string
  error: string
  optional?: boolean
  detail?: string
}

/** Consent is one attachment at a time. Finding model names sends NO file;
 * the click on a provider below is the only path that starts an upload. */
export default function MediaProviderPicker({ state, onChoose, onCancel, onSettings }: {
  state: MediaPickerState
  onChoose: (option: MediaProviderOption) => void
  onCancel: () => void
  onSettings: () => void
}) {
  const focus = useRef<HTMLButtonElement>(null)
  useEffect(() => { focus.current?.focus() }, [])
  const purpose = state.operation === 'audio' ? 'transcribe' : 'describe'
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a media provider"
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }}
        className="w-full max-w-[490px] rounded-xl border border-line bg-card p-5 text-ink shadow-xl"
      >
        <h2 className="text-[17px] font-semibold">{state.optional ? 'Also transcribe the soundtrack?' : `Who should ${purpose} this file?`}</h2>
        <p className="mt-2 break-all text-[12px] text-muted">{state.fileName}</p>
        {state.detail ? <p className="mt-2 text-[12px] text-ink">What would be uploaded: {state.detail}</p> : null}
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          {state.optional ? 'Visual frames are ready. To capture speech, you can upload the entire clip for transcription, or skip this step and keep only the frames. '
            : `Your current model cannot ${state.operation === 'audio' ? 'transcribe audio' : 'read these pictures'} here. `}
          Choose one of your saved, enabled providers below to upload this file for {state.operation === 'audio' ? 'transcription' : 'a visual description'}.
          The provider may charge you. Your chat engine will not change. {state.optional ? 'No soundtrack upload has started.' : 'No file has been uploaded yet.'}
        </p>
        {state.error ? <p role="alert" className="mt-3 text-[12px] text-warn">{state.error} The file is still here; choose again or cancel.</p> : null}
        {state.options.length ? (
          <div className="mt-4 border-t border-line">
            {state.options.map((option, index) => (
              <button
                key={`${option.provider}/${option.model}`}
                type="button"
                ref={index === 0 ? focus : undefined}
                onClick={() => onChoose(option)}
                className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left hover:text-accent"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{option.label}</span>
                  <span className="block truncate text-[11px] text-muted">{option.model}{option.endpoint ? ` · ${option.endpoint}` : ''}</span>
                </span>
                <span className="shrink-0 text-[11px]">Upload to {option.label} →</span>
              </button>
            ))}
          </div>
        ) : <p role="status" className="mt-4 text-[12px] text-warn">{state.reason}</p>}
        <div className="mt-4 flex items-center justify-end gap-4 text-[12px]">
          {!state.options.length ? <button type="button" onClick={onSettings} className="text-ink underline underline-offset-2">Models & API keys</button> : null}
          <button type="button" ref={!state.options.length ? focus : undefined} onClick={onCancel} className="text-muted hover:text-ink">{state.optional ? 'Skip audio; keep frames' : 'Cancel; keep everything local'}</button>
        </div>
      </div>
    </div>
  )
}
