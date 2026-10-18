import { useEffect, useRef, useState } from 'react'

type Review = { name: string; text: string; maximum: number; start: number; end: number; finish(value?: string): void }
export type SelectAttachmentText = (text: string, name: string, maximum: number, signal: AbortSignal) => Promise<string>

/** Large decoded files stay available for inspection/download. An excerpt is
 * attached only after the owner explicitly selects and approves its range. */
export function useAttachmentExcerpt() {
  const [review, setReview] = useState<Review | null>(null)
  const pending = useRef<Review | null>(null)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const open = !!review
  useEffect(() => { if(open && !dialogRef.current?.open)dialogRef.current?.showModal() }, [open])
  useEffect(() => () => { pending.current?.finish() }, [])
  const selectText: SelectAttachmentText = (text, name, maximum, signal) => new Promise((resolve, reject) => {
    signal.throwIfAborted()
    pending.current?.finish()
    let settled = false
    const abort = (): void => finish()
    const finish = (value?: string): void => {
      if(settled)return
      settled=true;dialogRef.current?.close()
      signal.removeEventListener('abort', abort)
      pending.current = null; setReview(null)
      if (value === undefined) reject(Error(`${name}: attachment cancelled. No excerpt was attached or sent.`))
      else resolve(value)
    }
    const next = { text, name, maximum, start: 0, end: Math.min(maximum, text.length), finish }
    pending.current = next; setReview(next)
    signal.addEventListener('abort', abort, { once: true })
  })
  const save = (): void => {
    if (!review) return
    const url = URL.createObjectURL(new Blob([review.text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `${review.name}.extracted.txt`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const count = review ? review.end - review.start : 0
  const valid = !!review && Number.isInteger(review.start) && Number.isInteger(review.end) && review.start >= 0 && review.end <= review.text.length && count > 0 && count <= review.maximum && !!review.text.slice(review.start, review.end).trim()
  const dialog = review ? <dialog ref={dialogRef} aria-label="Choose attachment excerpt" onCancel={event=>{event.preventDefault();review.finish()}} className="fixed inset-0 m-auto max-h-[calc(100%-40px)] w-[calc(100%-40px)] max-w-3xl overflow-auto border border-line bg-card p-5 text-ink backdrop:bg-bg/95">
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Choose the text to attach</h2>
      <p>{review.name}: {review.text.length.toLocaleString()} characters were extracted. The chat attachment budget is smaller. Nothing has been attached or sent.</p>
      <p>Select text below, or enter an inclusive character range. Only the approved excerpt will be attached, with an excerpt label. Save the full extraction if you need the rest.</p>
      <textarea aria-label="Full extracted text" readOnly className="min-h-48 resize-y rounded border border-line bg-bg p-2 font-mono text-xs" value={review.text} onSelect={event => {
        const { selectionStart, selectionEnd } = event.currentTarget
        if (selectionStart !== selectionEnd) setReview(current => current ? { ...current, start: selectionStart, end: selectionEnd } : null)
      }} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>From character <input className="w-24 border border-line bg-bg px-2 py-1" type="number" aria-label="Excerpt first character" min={1} max={review.text.length} value={review.start + 1} onChange={event => setReview({ ...review, start: Number(event.target.value) - 1 })} /></label>
        <label>Through <input className="w-24 border border-line bg-bg px-2 py-1" type="number" aria-label="Excerpt last character" min={1} max={review.text.length} value={review.end} onChange={event => setReview({ ...review, end: Number(event.target.value) })} /></label>
        <span>{count.toLocaleString()} / {review.maximum.toLocaleString()} characters</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ob-small-button" disabled={!valid} onClick={() => review.finish(review.text.slice(review.start, review.end))}>Attach selected excerpt only</button>
        <button type="button" className="ob-small-button" onClick={save}>Save full extracted text</button>
        <button type="button" className="ob-small-button" onClick={() => review.finish()}>Cancel attachment</button>
      </div>
    </section>
  </dialog> : null
  return { selectText, dialog }
}
