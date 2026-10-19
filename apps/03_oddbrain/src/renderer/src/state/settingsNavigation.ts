import type { SectionId } from '../components/SettingsView'

/** Stable section IDs keep old links and Back working; only the menu changes. */
export type SettingsArea = { id: string; title: string; sections: readonly SectionId[] }
export const SETTINGS_AREAS: readonly SettingsArea[] = [
  { id: 'appearance', title: 'Appearance', sections: ['appearance'] },
  { id: 'ai', title: 'AI & connections', sections: ['engine', 'models', 'connectors', 'performance'] },
  { id: 'memory', title: 'Memory & files', sections: ['memory', 'vault'] },
  { id: 'voice', title: 'Voice & attachments', sections: ['media'] },
  { id: 'access', title: 'Privacy & access', sections: ['agents'] },
  { id: 'windows', title: 'Windows & shortcuts', sections: ['windows'] },
  { id: 'tools', title: 'Advanced tools', sections: ['house', 'skills', 'recipes', 'hooks', 'extensions'] },
  { id: 'help', title: 'About & help', sections: ['about', 'system'] },
]
export function areaForSection(section: SectionId): SettingsArea {
  return SETTINGS_AREAS.find(area => area.sections.includes(section)) || SETTINGS_AREAS[0]
}
