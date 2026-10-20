/**
 * Files that decide what runs next.
 *
 * Kiro's 2026 MCP rewrite and Cursor's sandbox-helper overwrite both worked the
 * same way: the agent was allowed to write a file whose only purpose is to name
 * a program, and the tool then ran that program with the developer's
 * privileges. A diff of such a file can look dull — a few lines of JSON — while
 * the effect is "run this command at the next reload".
 *
 * This module names those files so the approval card can say what the write
 * would mean. It is a description, not a sandbox: it does not block anything,
 * because the engine's own permission door owns allow/deny.
 */
const RULES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /(^|\/)\.mcp\.json$/i, why: 'This file lists MCP servers and the commands used to start them. Changing it changes what runs.' },
  { pattern: /(^|\/)\.agents\/mcp_config\.json$/i, why: 'This file lists MCP servers and the commands used to start them. Changing it changes what runs.' },
  { pattern: /(^|\/)\.kiro\/settings\/mcp\.json$/i, why: 'This file lists MCP servers and the commands used to start them. Changing it changes what runs.' },
  { pattern: /(^|\/)\.claude\/settings(\.local)?\.json$/i, why: 'Claude Code settings can carry hooks and permission rules. A hook is a command the engine runs for you.' },
  { pattern: /(^|\/)\.claude\.json$/i, why: 'Claude Code user configuration can carry hooks, allowed commands and MCP servers.' },
  { pattern: /(^|\/)\.vscode\/tasks\.json$/i, why: 'VS Code runs these tasks itself, some on folder open; a task is a shell command.' },
  { pattern: /(^|\/)\.vscode\/settings\.json$/i, why: 'Workspace settings can point tooling at other programs and tasks.' },
  { pattern: /(^|\/)\.git\/hooks\//i, why: 'A Git hook is a program Git runs on your next commit, checkout or push.' },
  { pattern: /(^|\/)\.git\/config$/i, why: 'Git configuration can name helper programs (hooks, filters, credential helpers) that Git then runs.' },
  { pattern: /(^|\/)\.husky\//i, why: 'Husky installs Git hooks — programs that run on commit and push.' },
  { pattern: /(^|\/)(\.bashrc|\.bash_profile|\.bash_login|\.profile|\.zshrc|\.zprofile|\.zshenv|config\.fish)$/i, why: 'A shell startup file runs on your next terminal, and can change what every command resolves to.' },
  { pattern: /(^|\/)(profile|Microsoft\.PowerShell_profile)\.ps1$/i, why: 'A PowerShell profile runs when a shell starts, and can change what every command resolves to.' },
  { pattern: /(^|\/)package\.json$/i, why: 'Package scripts run on install, test or start. Editing this can turn a routine command into different code.' },
  { pattern: /(^|\/)\.npmrc$/i, why: 'npm configuration can point installs at another registry or run a different shell for scripts.' },
  { pattern: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i, why: 'A CI workflow runs code on a runner with repository credentials.' },
  { pattern: /(^|\/)(pyproject\.toml|setup\.py)$/i, why: 'Python build metadata can carry build steps that run on install.' },
  { pattern: /(^|\/)Makefile$/i, why: 'Make targets are commands; editing one changes what "make" runs.' },
]

/** A sentence about why this path is execution-sensitive, or '' when it is ordinary. */
export function executionConfigRisk(path: string): string {
  if (typeof path !== 'string' || !path.trim()) return ''
  const normalized = path.replace(/\\/g, '/')
  const rule = RULES.find(entry => entry.pattern.test(normalized))
  return rule ? `Execution-sensitive file. ${rule.why} Read every changed line as a program, not as a preference.` : ''
}

/** True when ANY file in a change set is execution-sensitive. */
export function anyExecutionConfigRisk(paths: string[]): string {
  for (const path of paths) { const risk = executionConfigRisk(path); if (risk) return risk }
  return ''
}
