import type { SectionId } from '../components/SettingsView'

/** Stable section IDs keep old links and Back working; only the menu changes. */
export type SettingsArea = { id: string; title: string; description: string; sections: readonly SectionId[] }
export const SETTINGS_AREAS: readonly SettingsArea[] = [
  { id: 'appearance', title: 'Appearance', description: 'Looks & brain behaviour', sections: ['appearance'] },
  { id: 'ai', title: 'AI & connections', description: 'Engines, API keys & connectors', sections: ['engine', 'models', 'connectors', 'video', 'performance'] },
  { id: 'memory', title: 'Memory & files', description: 'Organizer & vault', sections: ['memory', 'vault'] },
  { id: 'voice', title: 'Voice & attachments', description: 'Speech, media & documents', sections: ['media'] },
  { id: 'access', title: 'Privacy & access', description: 'Browser & AI permissions', sections: ['agents'] },
  { id: 'windows', title: 'Windows & shortcuts', description: 'Hotkeys & quick window', sections: ['windows'] },
  { id: 'tools', title: 'Advanced tools', description: 'Skills, plugins, rules & hooks', sections: ['house', 'skills', 'recipes', 'hooks', 'extensions'] },
  { id: 'help', title: 'About & help', description: 'Version, diagnostics & help', sections: ['about', 'system'] },
]
export function areaForSection(section: SectionId): SettingsArea {
  return SETTINGS_AREAS.find(area => area.sections.includes(section)) || SETTINGS_AREAS[0]
}
