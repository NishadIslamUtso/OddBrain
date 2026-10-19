import EngineStoreSource from './EngineStoreSource'
import { useState } from 'react'
import { Check, Download } from 'lucide-react'
import { SKILL_CATALOG } from '@shared/lib/skillCatalog'
import { bridge, isDemo } from '@/platform/bridge'

/**
 * Settings > Skills — the sourcing half of one-vault-to-every-engine.
 *
 * The catalog is curated (anthropics/skills, verified live 2026-10-16); an
 * install pins and preserves its complete directory, including support files
 * and licenses. Existing engine skills are not replaced. No account, no key, no
 * middleman — a raw file from a public repo.
 */
function SharedSkillsCatalogSection() {
  const [installed, setInstalled] = useState<Record<string, { ok: boolean; answer: string }>>({})
  const [busy, setBusy] = useState('')

  const install = (name: string): void => {
    if (busy) return
    setBusy(name)
    void bridge.skills
      .installCatalog(name)
      .then((answer) => {
        setInstalled((previous) => ({ ...previous, [name]: { ok: answer.ok, answer: answer.answer } }))
      })
      .catch(() => setInstalled(previous => ({ ...previous, [name]: { ok: false, answer: 'Installation failed. Check the connection and try again.' } })))
      .finally(() => setBusy(''))
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] leading-relaxed text-muted">
        Skills are small rulebooks an engine reads before it works. Install once here and every engine gets it, so
        Claude Code in its own folder, agy next to the work. The catalog is Anthropic's open collection; their
        license rides along with each file.
      </p>
      {isDemo ? (
        <p className="text-[12px] text-muted">This preview cannot reach the machine, the real app installs from here.</p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {SKILL_CATALOG.map((skill) => {
          const result = installed[skill.name]
          const done = result?.ok === true
          return (
            <li key={skill.name} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{skill.name}</span>
                <span className="block text-[11px] text-muted">{skill.what}</span>
                {result ? <span className={`block text-[11px] ${result.ok ? 'text-ok' : 'text-warn'}`}>{result.answer}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => install(skill.name)}
                disabled={Boolean(busy) || isDemo}
                aria-label={`Install the ${skill.name} skill`}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] ${
                  done ? 'border-ok/50 text-ok' : 'border-line text-muted hover:text-ink'
                } disabled:opacity-50`}
              >
                {done ? <Check size={11} aria-hidden /> : <Download size={11} aria-hidden />}
                {busy === skill.name ? 'Installing…' : done ? 'Installed' : 'Install'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function SkillsCatalogSection() {
  return <EngineStoreSource kind="skills"><SharedSkillsCatalogSection /></EngineStoreSource>
}
