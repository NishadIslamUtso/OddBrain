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
export default function McpServersSection(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [kind, setKind] = useState<'stdio' | 'http'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')
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
      const reply = await bridge.mcp.write(next)
      setNote(reply.answer)
      if (reply.ok) { setServers(next); return true }
      return false
    } catch {
      setNote('The tool server list was not written. Nothing changed.')
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
        One MCP list, written into both engines' own config files. A local server is a program an engine
        will start when it uses a tool; add only what you trust. Tool calls still meet the engine's
        permission cards.
      </p>
      {!loaded ? <p className="ob-control-scope">Reading the list…</p> : servers.length ? (
        <ul className="mt-1 divide-y divide-line">
          {servers.map((server) => (
            <li key={server.name} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <strong>{server.name}</strong>
                <code className="block truncate text-[11px] text-muted" title={describeMcpServer(server)}>{describeMcpServer(server)}</code>
              </span>
              <button type="button" disabled={busy || (isDemo && !sample)} aria-label={`Remove ${server.name}`} title={`Remove ${server.name}`}
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
            <input aria-label="Arguments" placeholder="arguments, e.g. -y some-mcp-server@latest" value={args} onChange={(event) => setArgs(event.target.value)} />
          </>
        ) : (
          <input aria-label="Server URL" placeholder="https://example.com/mcp" value={url} onChange={(event) => setUrl(event.target.value)} />
        )}
        <div className="ob-inline-actions">
          <button type="button" disabled={busy || (isDemo && !sample) || !name.trim()} onClick={() => void add()}>Add server</button>
        </div>
      </div>
      {problem ? <p role="status" className="ob-control-scope text-warn">{problem}</p> : null}
      {sample ? <p className="ob-control-scope">Sample workspace: this list is browser storage and is never written into an engine config.</p> : null}
      {isDemo && !sample ? <p className="ob-control-scope">Reading and writing tool servers needs the desktop app.</p> : null}
      {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
    </section>
  )
}
