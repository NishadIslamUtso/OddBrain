import { useEffect, useState } from 'react'
import { ArrowRight, Check, Cpu, FolderOpen } from 'lucide-react'
import BrainMark from './BrainMark'
import { Mascot } from '../motion/Mascot'
import { useEngine } from '@/state/engine'
import { bridge } from '@/platform/bridge'
import { isDemo } from '@/platform/bridge'

/**
 * First run (08) — the welcome.
 *
 * Three real choices, each skippable, none blocking: what to be called, which
 * brain the engine thinks with (the list comes from the engine's own door),
 * and which folder the work lives in. The engine setup folded in here is the
 * difference between an app that opens onto a form and one that opens onto
 * work. Choosing nothing is allowed: the vault default brain and folder are
 * honest starting points, and every choice can be changed later in its own
 * screen.
 */

const THROTTLE: Array<{ id: 'ask' | 'plan' | 'edits' | 'full'; label: string }> = [
  { id: 'ask', label: 'Ask me' },
  { id: 'plan', label: 'Plan first' },
  { id: 'edits', label: 'Auto-edits' },
  { id: 'full', label: 'Full speed' },
]

export default function FirstRunView({
  onFinish,
  onName,
}: {
  onFinish: () => void
  onName: (name: string) => void
}) {
  const engine = useEngine()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  // The machine's own name for this person, offered as the starting value —
  // editable, never forced; the owner's machine reported the field used to
  // come up empty and read as if the app could not detect anything.
  useEffect(() => {
    let gone = false
    void bridge.app
      .whoami?.()
      .then(reply => {
        if (!gone && reply.name) setName(current => current || reply.name)
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [])
  const [folder, setFolder] = useState('')

  useEffect(() => {
    void engine.loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chooseFolder = async (): Promise<void> => {
    const chosen = await bridge.vault.chooseFolder()
    if (chosen) {
      setFolder(chosen)
      await bridge.settings.update({ vaultPath: chosen })
    }
  }

  const useDefaultFolder = async (): Promise<void> => {
    const result = await bridge.vault.useDefault()
    if (result.ok) setFolder(result.path || 'default')
  }

  const steps = ['You', 'Engine', 'Folder']
  const finish = (): void => {
    if (name.trim()) onName(name.trim())
    onFinish()
  }

  return (
    <div data-find-scroll className="flex h-full items-center justify-center overflow-y-auto bg-bg" aria-label="Welcome">
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-card p-6">
        <div className="flex items-center gap-2.5">
          <BrainMark size={18} title="" />
          <h1 className="text-[19px] font-semibold text-ink">Welcome to OddBrain</h1>
        </div>
        {/* The kit's animation greets the owner on screen one — the logo
            animates, it does not sit still on the welcome card. */}
        <div className="mt-2 flex justify-center" aria-hidden>
          <Mascot role="resting" size={88} seed={7} />
        </div>

        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {steps.map((label, index) => (
            <span
              key={label}
              className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-accent' : 'bg-line'}`}
              title={label}
            />
          ))}
        </div>

        {step === 0 ? (
          <div className="mt-5">
            <h2 className="text-[13.5px] font-medium text-ink">What should it call you?</h2>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setStep(1)
              }}
              placeholder="Your name (optional)"
              aria-label="Your name"
              className="mt-2.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[13.5px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
            />
            <StepButtons next={() => setStep(1)} skip={finish} nextDisabled={false} />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-5">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
              <Cpu size={13} aria-hidden /> Which brain should the engine use?
            </h2>
            <p className="mt-1 text-[11.5px] text-muted">
              The list is what the engine can really use right now. Cloud brains leave the machine, they are labelled.
            </p>
            <div className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
              {engine.models.entries.length === 0 ? (
                <p className="text-[12px] text-muted">
                  {engine.models.error || 'No brains reported yet, you can pick one any time in the Engine bay.'}
                </p>
              ) : (
                engine.models.entries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => void engine.setModel(entry.name, entry.provider)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] ${
                      engine.settings.model === entry.name
                        ? 'border-accent text-ink'
                        : 'border-line text-muted hover:text-ink'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {engine.settings.model === entry.name ? <Check size={12} aria-hidden /> : null}
                    {entry.cloud ? <span className="shrink-0 text-[10.5px] text-warn">cloud</span> : null}
                  </button>
                ))
              )}
            </div>
            <h3 className="mt-4 text-[12px] font-medium text-ink">How much may it do before asking?</h3>
            <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="Throttle">
              {THROTTLE.map((option) => {
                const active = (engine.settings.approval ?? 'ask') === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void engine.setApproval(option.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11.5px] ${
                      active ? 'bg-accent text-[var(--accent-ink)]' : 'border border-line text-muted hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <StepButtons next={() => setStep(2)} skip={finish} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-5">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
              <FolderOpen size={13} aria-hidden /> Where should the work live?
            </h2>
            <p className="mt-1 text-[11.5px] text-muted">
              The vault keeps conversations, notes and captures. The default folder is fine and can be changed in
              Settings later.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => void useDefaultFolder()}
                className="flex-1 rounded-lg border border-line px-3 py-2.5 text-left text-[12.5px] text-ink hover:bg-white/[0.06]"
              >
                Use default (Documents\OddBrain\Brain)
              </button>
              <button
                type="button"
                onClick={() => void chooseFolder()}
                className="flex-1 rounded-lg border border-line px-3 py-2.5 text-left text-[12.5px] text-muted hover:text-ink"
              >
                Choose another folder…
              </button>
            </div>
            {folder ? <p className="mt-1.5 text-[11px] text-muted">Using {folder}</p> : null}
            <button
              type="button"
              onClick={finish}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-[var(--accent-ink)] hover:bg-accent/90"
            >
              Start <ArrowRight size={13} aria-hidden />
            </button>
            <StepButtons next={finish} skip={finish} nextLabel="Start" hideNext />
          </div>
        ) : null}

        {isDemo ? <p className="mt-3 text-[10.5px] text-muted">This preview cannot reach the machine, the real app remembers every choice.</p> : null}
      </div>
    </div>
  )
}

function StepButtons({
  next,
  skip,
  nextDisabled,
  nextLabel = 'Next',
  hideNext,
}: {
  next: () => void
  skip: () => void
  nextDisabled?: boolean
  nextLabel?: string
  hideNext?: boolean
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      {!hideNext ? (
        <button
          type="button"
          onClick={next}
          disabled={nextDisabled}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90 disabled:opacity-50"
        >
          {nextLabel} <ArrowRight size={12} aria-hidden />
        </button>
      ) : null}
      <button type="button" onClick={skip} className="text-[11.5px] text-muted hover:text-ink">
        Skip, decide later
      </button>
    </div>
  )
}
