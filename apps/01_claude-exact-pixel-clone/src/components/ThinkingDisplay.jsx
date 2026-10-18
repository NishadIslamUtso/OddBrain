import { Brain, ChevronDown } from 'lucide-react'
export default function ThinkingDisplay({ thinking, streaming }) {
  if (!thinking) return null
  return <details className="thinking-display"><summary><Brain size={14} /><span>{streaming ? 'Thinking…' : 'Thinking'} <small>Model output</small></span><ChevronDown size={13} /></summary><pre>{thinking}</pre></details>
}
