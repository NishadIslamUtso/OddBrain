import type { McpReview } from '@shared/lib/mcpReview'
import EngineStoreSource from './EngineStoreSource'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { bridge, isDemo } from '@/platform/bridge'
import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import {
  describeMcpServer,
  mcpServerProblem,
  normalizeMcpServers,
  parseMcpArgs,
  type McpServerEntry,
} from '@shared/lib/mcp'

/**
 * Settings > Connectors > Tool servers (MCP).
 *
 * One list, written once and deployed into both engines' own config files by
 * the main process. A local entry is a program the engine will start, so the
 * screen says that plainly; a remote entry is a URL. Nothing here runs a
 * command: adding a server only writes configuration, and every tool call the
 * engine then makes still goes through its normal permission path.
 */
function SharedMcpServersSection(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [kind, setKind] = useState<'stdio' | 'http'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')
  const [review, setReview] = useState<{ preview: McpReview; next: McpServerEntry[] } | null>(null)
  const [busy, setBusy] = useState(false)

  // The labelled sample is browser storage, and says so on every save. Anything
  // else in a browser has no list at all, so it says that instead of drawing an
  // empty list next to an Add button.
  const sample = isDemo && sampleEnabled()
  useEffect(() => {
    if (isDemo && !sample) { setLoaded(true); return }
    void bridge.mcp.read()
      .then((reply) => {
        setServers(normalizeMcpServers(reply.servers).servers)
        setProblem(reply.problem ?? '')
        setLoaded(true)
      })
      .catch(() => { setProblem('Could not read the tool server list. Nothing was changed.'); setLoaded(true) })
  }, [isDemo, sample])

  const save = async (next: McpServerEntry[]): Promise<boolean> => {
    setBusy(true); setNote('')
    try {
      if (sample) { const reply = await bridge.mcp.write(next); setNote(reply.answer); if (reply.ok) { setServers(next); return true }; return false }
      const preview = await bridge.mcp.preview(next); setReview({ preview, next }); return false
    } catch {
      setNote('The connector changes could not be prepared. No files changed.')
      return false
    } finally { setBusy(false) }
  }

  const add = async (): Promise<void> => {
    const parsed = parseMcpArgs(args)
    if (!parsed.ok) { setNote(parsed.problem); return }
    const entry: McpServerEntry = kind === 'stdio'
      ? { name: name.trim(), command: command.trim(), args: parsed.args }
      : { name: name.trim(), url: url.trim() }
    const problem = mcpServerProblem(entry)
    if (problem) { setNote(problem); return }
    if (servers.some((server) => server.name === entry.name)) { setNote('A server with that name is already listed.'); return }
    const saved = await save([...servers, entry])
    if (saved) { setName(''); setCommand(''); setArgs(''); setUrl('') }
  }

  return (
    <section className="ob-connector-row" aria-label="Tool servers (MCP)">
      <header><h3>Tool servers</h3><span>{servers.length ? `${servers.length} listed` : 'None listed'}</span></header>
      <p className="ob-control-scope">
        Review exact file changes before saving. Native engines may start local server programs or contact remote servers as soon as they reload configuration. Tool approval rules do not sandbox server startup. Authentication and successful use are checked separately.
      </p>
      {!loaded ? <p className="ob-control-scope">Reading the list…</p> : servers.length ? (
        <ul className="mt-1 divide-y divide-line">
          {servers.map((server) => (
            <li key={server.name} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <strong>{server.name}</strong>
                <code className="block truncate text-[11px] text-muted" title={describeMcpServer(server)}>{describeMcpServer(server)}</code>
              </span>
              <button type="button" disabled={busy || !!review || (isDemo && !sample)} aria-label={`Remove ${server.name}`} title={`Remove ${server.name}`}
                onClick={() => void save(servers.filter((entry) => entry.name !== server.name))}>
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ob-form-column">
        <div className="ob-form-line">
          <input aria-label="Server name" placeholder="name (lowercase letters, digits, - _)" value={name} onChange={(event) => setName(event.target.value)} />
          <select aria-label="Transport" value={kind} onChange={(event) => setKind(event.target.value === 'http' ? 'http' : 'stdio')}>
            <option value="stdio">Local command</option>
            <option value="http">Remote URL</option>
          </select>
        </div>
        {kind === 'stdio' ? (
          <>
            <input aria-label="Command" placeholder="command, e.g. npx" value={command} onChange={(event) => setCommand(event.target.value)} />
            <input aria-label="Arguments" placeholder="arguments, e.g. --yes package-name@exact-version" value={args} onChange={(event) => setArgs(event.target.value)} />
          </>
        ) : (
          <input aria-label="Server URL" placeholder="https://example.com/mcp" value={url} onChange={(event) => setUrl(event.target.value)} />
        )}
        <div className="ob-inline-actions">
          <button type="button" disabled={busy || !!review || (isDemo && !sample) || !name.trim()} onClick={() => void add()}>Add server</button>
        </div>
      </div>
      {review && <section aria-label="Review connector configuration"><h4>Review connector configuration</h4><p>{review.preview.explanation}</p><p>These diffs can contain private native settings. They are not sent to a provider.</p>{review.preview.changes.map(file => <details key={file.path} open><summary>{file.path}</summary><pre className="whitespace-pre-wrap break-words">{file.diff}</pre></details>)}{(['deny', 'allow'] as const).map(decision => <button key={decision} type="button" disabled={busy} onClick={() => { setBusy(true); void bridge.mcp.decide(review.preview.token, decision).then(reply => { setNote(reply.answer); if (reply.ok && decision === 'allow') { setServers(review.next); setName(''); setCommand(''); setArgs(''); setUrl('') }; setReview(null) }).catch(() => { setReview(null); setNote('The configuration decision could not be confirmed. Reload the list before retrying.') }).finally(() => setBusy(false)) }}>{decision === 'allow' ? 'Allow these file changes once' : 'Deny changes'}</button>)}</section>}
      {problem ? <p role="status" className="ob-control-scope text-warn">{problem}</p> : null}
      {sample ? <p className="ob-control-scope">Sample workspace: this list is browser storage and is never written into an engine config.</p> : null}
      {isDemo && !sample ? <p className="ob-control-scope">Reading and writing tool servers needs the desktop app.</p> : null}
      {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
    </section>
  )
}

function GooseMemoryAdapterSection(): React.JSX.Element {
  const [review, setReview] = useState<McpReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const prepare = async (): Promise<void> => {
    if (busy || review) return
    setBusy(true); setNote('')
    try {
      const answer = await bridge.memoryOb.goosePreview()
      if (answer.review) setReview(answer.review)
      else setNote(answer.answer || 'No Goose adapter change was prepared.')
    } catch { setNote('The Goose adapter review could not be prepared. Nothing changed.') }
    finally { setBusy(false) }
  }
  const decide = async (decision: 'allow' | 'deny'): Promise<void> => {
    if (!review || busy) return
    setBusy(true)
    try { const answer = await bridge.memoryOb.gooseDecide(review.token, decision); setNote(answer.answer) }
    catch { setNote('The Goose adapter decision could not be completed. Reload and review again.') }
    finally { setReview(null); setBusy(false) }
  }

  return <section className="ob-connector-row" aria-label="Goose Memory_OB adapter">
    <header><h3>Goose · Memory_OB</h3><span>Read-only MCP</span></header>
    <p className="ob-control-scope">Choose Goose’s existing <code>config.yaml</code>, review the exact <code>extensions.memory_ob</code> block and the <code>memory-ob-memory</code> skill file, then allow once. Both install in that single allow. The adapter reads OddBrain’s catalogue, app-chat store and reviewed Brain memory directly; exact search labels confirmed records separately from raw unconfirmed evidence, and evidence lookup verifies exact wording by SHA-256 and refuses changed sources. It exposes status, bounded search, Project counts and evidence verification, with no memory-write, confirmation, deletion, permission or Send tool. The skill binds the answering model to the same authority order: confirmed first, raw evidence second, pending and rejected never as facts, not found over guessing.</p>
    <p className="ob-control-scope">This sits at Goose’s extension layer, so it is independent of the selected MCP-capable model/provider. Goose’s own CLI-provider mode does not expose its extension ecosystem. Stock Goose Memory is not disabled until measured parity.</p>
    <div className="ob-inline-actions"><button type="button" disabled={isDemo || busy || !!review} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Choose Goose config and review'}</button></div>
    {review ? <section aria-label="Review Goose Memory_OB adapter"><h4>Review Goose adapter</h4><p>{review.explanation}</p>{review.changes.map(change => <details key={change.path} open><summary>{change.path}</summary><pre className="whitespace-pre-wrap break-words">{change.diff}</pre></details>)}<div className="ob-inline-actions">{(['deny', 'allow'] as const).map(decision => <button key={decision} type="button" disabled={busy} onClick={() => void decide(decision)}>{decision === 'allow' ? 'Allow adapter changes once' : 'Deny changes'}</button>)}</div></section> : null}
    {isDemo ? <p className="ob-control-scope">Goose configuration requires the installed desktop app.</p> : null}
    {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
  </section>
}

export default function McpServersSection() {
  return <EngineStoreSource kind="connectors"><SharedMcpServersSection /><GooseMemoryAdapterSection /></EngineStoreSource>
}
