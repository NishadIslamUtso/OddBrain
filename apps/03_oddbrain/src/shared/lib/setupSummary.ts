import type { EngineSettings } from './engine'
const versionOnly = (raw: unknown): string => typeof raw === 'string' ? raw.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\b|$)/)?.[1] || 'Not reported' : 'Not reported'
/** An allowlist, not regex redaction of arbitrary logs. Never include paths,
 * hostnames, credentials, prompts, account identities or raw CLI responses. */
export function setupSummary(input: { appVersion: string; platform: string; settings: EngineSettings; engines: Array<{ id: string; found: boolean; version?: string }>; running: boolean }): string {
  const s = input.settings
  let endpoint = 'Engine default'
  if (s.baseUrl) {
    try { const u = new URL(s.baseUrl); endpoint = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? 'Loopback endpoint (not checked)' : ['http:', 'https:'].includes(u.protocol) ? 'Custom endpoint (address omitted; not checked)' : 'Unsupported endpoint scheme' }
    catch { endpoint = 'Unparseable endpoint (omitted)' }
  }
  return JSON.stringify({
    environment: input.platform === 'web' ? 'Browser preview; not native verification' : ['win32', 'linux', 'darwin'].includes(input.platform) ? 'Desktop runtime' : 'Not verified',
    appVersion: versionOnly(input.appVersion), platform: ['win32', 'linux', 'darwin'].includes(input.platform) ? input.platform : 'Unknown',
    engine: s.id === 'agy' ? 'agy' : s.id === 'claude-code' ? 'claude-code' : 'Unknown',
    route: s.id === 'agy' ? 'Native agy' : s.cloudProvider === 'native' ? 'Native CLI' : s.cloudProvider === 'anthropic' ? 'Anthropic API' : s.model ? 'Local/custom endpoint' : 'Native default',
    explicitModel: Boolean(s.model), customWorkspace: Boolean(s.workspace), savedEndpoint: endpoint,
    approval: ['ask', 'plan', 'edits', 'full'].includes(s.approval) ? s.approval : 'Unknown',
    requestedEffort: ['default', 'low', 'medium', 'high', 'xhigh', 'max'].includes(s.thinking) ? s.thinking : 'Unknown',
    processRunning: input.running === true,
    engines: input.engines.filter(e => ['claude-code', 'agy'].includes(e.id)).map(e => ({ engine: e.id, found: e.found === true, version: versionOnly(e.version) })),
    scope: 'Setup summary only; saved endpoint settings may be inactive for the selected route. Sign-in, account access, connector health, context usage and applied effort are not verified by this report. Paths, endpoint addresses, model names, account details and task text are omitted.',
  }, null, 2)
}
