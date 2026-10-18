import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
/** Never say "Copied" until the write has resolved. A blocked write leaves selectable text. */
export default function CopyText({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false), [fallback, setFallback] = useState(false)
  const selection = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setCopied(false); setFallback(false) }, [text])
  useEffect(() => { if (fallback) { selection.current?.focus(); selection.current?.select() } }, [fallback])
  return <span className="ob-copy-control"><button type="button" className="ob-text-button" aria-label={label} onClick={async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopied(true); setFallback(false)
    } catch { setCopied(false); setFallback(true) }
  }}><Copy size={12} />{copied ? 'Copied' : label}</button>{fallback ? <span className="ob-copy-fallback"><span>Clipboard blocked. Select and copy this text manually:</span><textarea ref={selection} aria-label="Text to copy" readOnly value={text} onFocus={e => e.currentTarget.select()} /></span> : null}</span>
}
