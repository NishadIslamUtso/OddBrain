import type { PackageInspection } from '@shared/lib/packageInspection'

export default function PackageDetails({ report }: { report: PackageInspection }) {
  return <section aria-label="Package contents" className="space-y-3 border-t border-line pt-3">
    <h4>Read-only package inspection</h4><p className="ob-control-scope">{report.source.repo}{report.source.path ? ` / ${report.source.path}` : ''}<br />Snapshot: <code className="break-all">{report.revision}</code></p>
    {(['skills', 'connectors', 'agents', 'hooks', 'commands'] as const).map(kind => <details key={kind}><summary>{kind[0].toUpperCase() + kind.slice(1)} · {report[kind].length} matching source files</summary>{report[kind].length ? <ul>{report[kind].map(file => <li key={file} className="break-all">{file}</li>)}</ul> : <p className="ob-control-scope">No matching standard paths found. This is not proof the package lacks this capability.</p>}</details>)}
    <details><summary>Runtime and setup requirements</summary><p className="ob-control-scope">Publisher declarations, not a check of installed dependencies or sign-in. Review the README; no setup command is run here.</p>{report.requirements.length ? report.requirements.map((text, i) => <pre key={i} className="whitespace-pre-wrap break-words">{text}</pre>) : <p>No supported dependency declarations were read.</p>}</details>
    <details><summary>Publisher README</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words">{report.readme || 'No supported README was read.'}</pre></details>
    <details><summary>All {report.files.length} source files</summary><ul>{report.files.map(file => <li key={file} className="break-all">{file}</li>)}</ul></details>
    {report.notices.map((note, i) => <p key={i} className="ob-control-scope">{note}</p>)}
  </section>
}
