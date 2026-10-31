import { configBytes, noLinkedPath } from './configTransaction'
/**
 * vaultSkills.ts — the skills THIS APP ships to the engines, not from any
 * catalog (A.6: the engine queries the browser).
 *
 * The engine runs as a plain CLI in a folder. It cannot see the app's
 * windows — but it can reach the app's local capture port, the same one the
 * extension uses. These skills teach it, in its own rulebook format, which
 * doors exist and what each honestly reports. They are redeployed on every
 * launch (they are ours, versioned with the app), and only into folders
 * that already exist — a machine without an engine gets no files invented.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { toAgySkill, toClaudeSkill, type VaultSkill } from './deploy'

/**
 * The app's local door. Routes sit at the root of the port (/onui, /grep,
 * /capsules) — the same table the extension's POST /capture lives in.
 */
export const LOCAL_DOOR = 'http://127.0.0.1:8765'
export const LOCAL_ORIGIN = LOCAL_DOOR

export const BROWSER_PAGE_SKILL: VaultSkill = {
  name: 'browser-page',
  description:
    'See the page the user has open in their browser (as last captured by the OddBrain extension). Use before asking the user to paste what they see.',
  body: `# browser-page

The OddBrain desktop app keeps a local, private door for reading what
its browser extension captured. When a task needs the page the user is
looking at, ask the door instead of the user.

## What is on the user's screen right now

    curl -s -H 'Origin: ${LOCAL_ORIGIN}' ${LOCAL_DOOR}/onui

The \`Origin\` header is the door's own rule, not a trick: this port answers
only callers that say where they are from, and a caller on the user's own
machine naming the door itself is answered. Without the header the door
refuses, and that refusal is correct.

The answer is JSON. \`page\` is null when nothing was ever captured, say
so, and ask the user normally. Otherwise:

- \`url\`, \`title\`, \`captured_at\`, what was captured, and when
  (Asia/Dhaka clock). Trust \`captured_at\`: an old capture is not "now".
- \`content\`, the page's readable text as the extension extracted it.
  \`content_truncated: true\` means it was cut at 12,000 characters; say so
  if your answer depends on the missing rest.
- \`capture_status: "visit-only"\`, only the visit was recorded. The page's
  content was never captured. Never guess what such a page says, and never
  treat a visit as proof the user read or agreed with anything.

## Other read doors on the same port (no keys, local only)

- \`/grep?q=TEXT\`, search the whole vault (same \`Origin\` header).
- \`/capsules\`, the user's capsules (goals, decisions, sources).

Rules: read-only. Never write through these doors. If the door does not
answer, the app is not running, say that plainly instead of retrying in a
loop.`,
}

/**
 * The starter pack (Mods Phase 3): the app's own real skill(s) and one real
 * look, packed as a folder any install path accepts. This is the store's
 * first furnishing — exported from constants the app itself deploys, so the
 * bytes here are the bytes the engines already read.
 */
export function starterPackFiles(): Record<string, string> {
  const skill = toClaudeSkill(BROWSER_PAGE_SKILL)
  return {
    'manifest.json': JSON.stringify(
      {
        id: 'ai-assistant.starter',
        name: 'OddBrain starter pack',
        version: '1.0.0',
        author: 'OddBrain',
        description: 'The app'+String.fromCharCode(39)+'s browser-page skill: see the page the user has open, through the local door. One look to start from.',
        license: 'unspecified',
        permissions: { shell: false },
        contributes: { skills: ['skills/browser-page/SKILL.md'], prompts: [], themes: ['themes/dawn.json'] },
      },
      null,
      2,
    ),
    [`skills/browser-page/SKILL.md`]: skill.content,
    'themes/dawn.json': JSON.stringify({ name: 'Dawn', appearance: { accent: 'amber' } }, null, 2),
  }
}

/** Deploy our skills into the folders that exist. Returns where files landed. */
export function deployBuiltInSkills(targets: { claudeSkillsDir: string; agySkillsDir: string }): string[] {
  const written: string[] = []
  const skills = [BROWSER_PAGE_SKILL]
  for (const dir of [targets.claudeSkillsDir, targets.agySkillsDir]) {
    // Only an engine that is already installed gets the files; we never
    // create ~/.claude or a workspace's .agents out of nowhere at boot.
    if (!existsSync(dirname(dir))) continue
    for (const skill of skills) {
      try {
        const built = dir === targets.claudeSkillsDir ? toClaudeSkill(skill) : toAgySkill(skill)
        const full = join(dir, built.relative)
        noLinkedPath(full)
        const previous = configBytes(full)
        if (previous !== null) continue // preserve installed and hand-edited copies, including older app versions
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, built.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        written.push(full)
      } catch {
        // A skills folder that will not take the file is not fatal: the
        // engine simply works without the hint, as it always has.
      }
    }
  }
  return written
}
