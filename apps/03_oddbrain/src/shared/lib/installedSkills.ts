import type { TextHazardReport } from './textHazards'

export type SkillDraft = { engine: 'claude-code' | 'agy'; name: string; description: string; body: string; requirements: string; replaceExisting: boolean }
export type SkillFile = { id: string; engine: 'claude-code' | 'agy'; name: string; description: string; path: string; digest: string; format: 'skill-folder' | 'legacy-flat'; states: { installed: 'observed'; enabled: 'unknown'; loaded: 'unknown'; authenticated: 'unknown'; used: 'unknown' } }
export type SkillInventory = { entries: SkillFile[]; notices: string[] }

export type CatalogSkillReview = { requirements?: Array<{ path: string; text: string }>; unread?: string[]; hazards?: Array<{ path: string; report: TextHazardReport }>; fileDigests?: Array<{ path: string; sha256: string; bytes: number }>; token: string; expiresAt: number; name: string; revision: string; files: string[]; manifest: string; destinations: string[]; notice: string }
