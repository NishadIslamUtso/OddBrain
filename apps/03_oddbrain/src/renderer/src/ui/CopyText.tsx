import { useState } from 'react'
import { Copy } from 'lucide-react'
/** No false "Copied" when a sandbox blocks the clipboard. */
export default function CopyText({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false), [fallback, setFallback] = useState(false)
  return <span className="ob-copy-control"><button type="button" className="ob-text-button" aria-label={label} onClick={async () => { try { if (!navigator.clipboard) throw Error(); await navigator.clipboard.writeText(text); setCopied(true); setFallback(false) } catch { setFallback(true) } }}><Copy size={12} />{copied ? 'Copied' : label}</button>{fallback ? <span className="ob-copy-fallback"><span>Clipboard access is blocked. Select and copy:</span><textarea aria-label="Text to copy" readOnly value={text} onFocus={e => e.currentTarget.select()} /></span> : null}</span>
}
