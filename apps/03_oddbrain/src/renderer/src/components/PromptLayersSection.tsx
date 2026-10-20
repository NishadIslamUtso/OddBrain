import { useEffect, useState } from 'react'
import { bridge } from '../platform/bridge'
import {
  describePromptLayers,
  PROMPT_EXTRACTION_NOTE,
  PROMPT_RECITAL_ANSWER,
  type PromptLayer,
} from '@shared/lib/promptLayers'

/**
 * What the model can see, stated as fact rather than reassurance.
 *
 * Prompt extraction is not a bug this app can patch: anything in these layers
 * can be repeated if a model is asked to. What the app can do is name every
 * layer, say who owns it, say which ones it cannot show, and confirm that no
 * provider key is among them.
 */
export default function PromptLayersSection({ historyMessages = 0 }: { historyMessages?: number }) {
  const [layers, setLayers] = useState<PromptLayer[] | null>(null), [problem, setProblem] = useState(''), [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      const facts = await bridge.promptLayers(historyMessages)
      setLayers(describePromptLayers(facts)); setProblem('')
    } catch (error) {
      setLayers(null); setProblem((error as Error).message || 'The layers could not be read.')
    } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])

  return <div>
    <p className="ob-control-scope">Everything the model can read this turn, and who wrote each part. This is a description, not a switch: nothing here can make a model forget its instructions.</p>
    <button type="button" className="ob-small-button" disabled={busy} onClick={() => void load()}>Read the layers again</button>
    {Layers(layers, problem)}
    <blockquote><p>{PROMPT_RECITAL_ANSWER}</p><p>{PROMPT_EXTRACTION_NOTE}</p></blockquote>
    <p className="ob-control-scope">No provider key, OS environment variable or saved app credential appears in any layer above. Keys are held by the main process and used by the app when it calls a provider; they are never offered to a model as text.</p>
  </div>
}

function Layers(layers: PromptLayer[] | null, problem: string) {
  if (problem) return <p role="status">{problem}</p>
  if (!layers) return <p className="ob-control-scope">Reading what the engine and this app hold…</p>
  return <ol className="ob-prompt-layers">{layers.map(layer => <li key={layer.id}>
    <h4>{layer.title} <small>{layer.ownership === 'engine' ? 'engine-owned' : layer.ownership === 'app' ? 'written by this app' : layer.ownership === 'owner' ? 'yours' : 'you and the model'}</small></h4>
    <p>{layer.contributes}</p>
    <p className="ob-control-scope">{layer.source}</p>
    {!layer.visible ? <p className="ob-control-scope">Not shown here because this app does not hold it.</p> : null}
  </li>)}</ol>
}
