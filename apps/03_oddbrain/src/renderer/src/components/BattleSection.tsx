import { useEffect, useState } from 'react'
import { Swords } from 'lucide-react'
import { dismissBattle, pickWinner, runBattle, stageBattlePrompt, useBattle } from '@/state/battle'
import { useEngine } from '@/state/engine'

/**
 * The battle card.
 *
 * One work order, two brains, the person picks — Arena's trick, built where
 * only a harness can build it. Identities stay hidden until the pick, so
 * brand loyalty cannot vote; the tally is this person's private ledger.
 */
export default function BattleSection() {
  const battle = useBattle()
  const engine = useEngine()
  const [choosing, setChoosing] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const hear = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail || ''
      if (!detail.trim()) return
      stageBattlePrompt(detail)
      setChoosing(true)
      setError('')
    }
    window.addEventListener('app:battle', hear)
    return () => window.removeEventListener('app:battle', hear)
  }, [battle.prompt])

  if (!choosing && !battle.active && !battle.a) return null

  const models = engine.models.entries.map(entry => entry.name).filter(name => name && name !== engine.settings.model)

  const start = (): void => {
    if (!opponent.trim()) {
      setError('Name the brain to fight against.')
      return
    }
    setError('')
    setChoosing(false)
    void runBattle(battle.prompt, opponent)
  }

  const name = (side: 'a' | 'b'): string => (battle.blind && !battle.picked ? `Brain ${side.toUpperCase()}` : battle[side]?.model ?? '')

  return (
    <section aria-label="Brain battle" className="mx-auto mb-3 w-full max-w-[var(--chat-width)] rounded-xl border border-line bg-card px-4 py-3">
      <header className="flex items-center gap-2">
        <Swords size={12} aria-hidden className="text-accent" />
        <h2 className="text-[12px] font-medium text-muted">Brain battle · blind pick · private tally</h2>
        {battle.active ? (
          <span className="ml-auto text-[11px] text-muted">{battle.stage}</span>
        ) : (
          <button
            type="button"
            onClick={() => { dismissBattle(); setChoosing(false) }}
            className="ml-auto rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            Close
          </button>
        )}
      </header>

      {battle.prompt ? <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">▸ {battle.prompt}</p> : null}

      {choosing && !battle.active ? (
        <div className="mt-2 rounded-lg border border-line bg-bg p-2.5" role="dialog" aria-label="Choose the second brain">
          <p className="text-[12px] text-ink">
            Run this prompt on <span className="font-medium">{engine.settings.model || 'the current brain'}</span> and one more, then pick the better answer.
          </p>
          {models.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {models.map(name2 => (
                <li key={name2}>
                  <button
                    type="button"
                    onClick={() => setOpponent(name2)}
                    aria-pressed={opponent === name2}
                    className={`rounded-lg border px-2 py-0.5 text-[11px] ${opponent === name2 ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {name2}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={opponent}
              onChange={event => setOpponent(event.target.value)}
              placeholder="or type a model name"
              aria-label="Second brain"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={start}
              className="rounded-lg border border-accent px-2.5 py-1 text-[11.5px] text-ink hover:bg-accent/10"
            >
              Fight
            </button>
          </div>
          {error ? <p className="mt-1 text-[11px] text-warn">{error}</p> : null}
        </div>
      ) : null}

      {battle.a && battle.b ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['a', 'b'] as const).map(side => {
            const data = battle[side]
            if (!data) return null
            const won = battle.picked === side
            return (
              <div key={side} className={`rounded-lg border p-2 ${won ? 'border-ok' : 'border-line'} bg-bg`}>
                <p className="text-[11px] font-medium text-ink">
                  {name(side)}{won ? ' · your pick' : ''}
                </p>
                <p className="mt-1 line-clamp-6 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-muted">
                  {data.error ? `Failed: ${data.error}` : data.answer || '(nothing said)'}
                </p>
                <p className="mt-1 text-[10.5px] text-muted">
                  {data.usage}
                  {data.ms ? ` · ${(data.ms / 1000).toFixed(1)}s` : ''}
                </p>
              </div>
            )
          })}
        </div>
      ) : null}

      {battle.a && battle.b && !battle.picked ? (
        <div className="mt-2 flex gap-2" role="group" aria-label="Pick the better answer">
          <button type="button" onClick={() => void pickWinner('a')} className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink hover:border-ok">
            Left wins
          </button>
          <button type="button" onClick={() => void pickWinner('b')} className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink hover:border-ok">
            Right wins
          </button>
          <button type="button" onClick={() => void pickWinner('tie')} className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink">
            A tie
          </button>
        </div>
      ) : null}

      {battle.picked ? (
        <p className="mt-2 text-[11.5px] text-muted">
          {battle.saved} {battle.originalModel ? `Your composer still uses ${battle.originalModel}.` : ''}
        </p>
      ) : null}
      {battle.error ? <p className="mt-1 text-[11px] text-warn">{battle.error}</p> : null}
    </section>
  )
}
