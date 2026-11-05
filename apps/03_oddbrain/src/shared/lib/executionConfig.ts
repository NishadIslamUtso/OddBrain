/** Files whose contents can make another program execute code later. */
const RULES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /(^|\/)\.mcp\.json$/i, why: 'It names MCP servers and the commands used to start them.' },
  { pattern: /(^|\/)\.agents\/mcp_config\.json$/i, why: 'It names MCP servers and the commands used to start them.' },
  { pattern: /(^|\/)\.kiro\/settings\/mcp\.json$/i, why: 'It names MCP servers and the commands used to start them.' },
  { pattern: /(^|\/)\.(?:claude|gemini)\/settings(?:\.local)?\.json$/i, why: 'Native engine settings can contain hooks, tool rules or server declarations.' },
  { pattern: /(^|\/)\.(?:claude|gemini)\.json$/i, why: 'Native user configuration can contain hooks, tool rules or server declarations.' },
  { pattern: /(^|\/)\.vscode\/(?:tasks|settings|launch)\.json$/i, why: 'Workspace tasks and launch settings can name programs that developer tools run.' },
  { pattern: /(^|\/)\.git\/hooks\//i, why: 'Git hooks run during later Git operations.' },
  { pattern: /(^|\/)\.git\/config$/i, why: 'Git configuration can name hooks, filters and credential helpers.' },
  { pattern: /(^|\/)\.husky\//i, why: 'Husky files become Git hooks that run on commit or push.' },
  { pattern: /(^|\/)(?:\.bashrc|\.bash_profile|\.bash_login|\.profile|\.zshrc|\.zprofile|\.zshenv|config\.fish)$/i, why: 'Shell startup files execute or alter command resolution when a terminal starts.' },
  { pattern: /(^|\/)(?:profile|Microsoft\.PowerShell_profile)\.ps1$/i, why: 'PowerShell profiles execute when a shell starts.' },
  { pattern: /(^|\/)package\.json$/i, why: 'Package scripts can execute during install, test, build or start.' },
  { pattern: /(^|\/)\.(?:npmrc|yarnrc(?:\.yml)?)$/i, why: 'Package-manager configuration can change registries, shells and lifecycle behavior.' },
  { pattern: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i, why: 'CI workflows execute on runners with repository permissions.' },
  { pattern: /(^|\/)(?:pyproject\.toml|setup\.py|Makefile|Justfile)$/i, why: 'Build metadata and task files can execute commands later.' },
  { pattern: /(^|\/)\.config\/autostart\//i, why: 'Desktop autostart entries execute when the user signs in.' },
  { pattern: /(^|\/)Microsoft\/Windows\/Start Menu\/Programs\/Startup\//i, why: 'Windows Startup entries execute when the user signs in.' },
]

export function executionConfigRisk(path: string): string {
  if (typeof path !== 'string' || !path.trim()) return ''
  const normalized = path.replace(/\\/g, '/')
  const rule = RULES.find(entry => entry.pattern.test(normalized))
  return rule ? `Execution-sensitive file. ${rule.why} Read every changed line as potential code, not as an ordinary preference.` : ''
}

export function anyExecutionConfigRisk(paths: string[]): string[] {
  return [...new Set(paths.map(executionConfigRisk).filter(Boolean))]
}
