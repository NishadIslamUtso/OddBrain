export type SectionId = 'video' | 'media' | 'windows' | 'maps' | 'about' | 'agents' | 'hooks' | 'memory' | 'house' | 'skills' | 'recipes' | 'extensions' | 'engine' | 'system' | 'connectors' | 'appearance' | 'models' | 'performance' | 'vault'

export const SECTIONS: readonly { id: SectionId; title: string; group: string; resettable?: boolean }[] = [
  { id: 'appearance', title: 'Appearance', group: 'Your space', resettable: true },
  { id: 'windows', title: 'Windows & shortcuts', group: 'Your space' },
  { id: 'engine', title: 'Engine', group: 'Models & runtime' },
  { id: 'models', title: 'Models & API keys', group: 'Models & runtime' },
  { id: 'performance', title: 'Performance', group: 'Models & runtime', resettable: true },
  { id: 'agents', title: 'Agent access', group: 'Access & connections', resettable: true },
  { id: 'connectors', title: 'Connectors', group: 'Access & connections' },
  { id: 'video', title: 'Kdenlive & video', group: 'Access & connections' },
  { id: 'extensions', title: 'Plugins', group: 'Access & connections' },
  { id: 'media', title: 'Voice & attachments', group: 'Files & memory' },
  { id: 'vault', title: 'Vault', group: 'Files & memory' },
  { id: 'memory', title: 'Memory', group: 'Files & memory' },
  { id: 'maps', title: 'Capture sources', group: 'Files & memory' },
  { id: 'house', title: 'House rules', group: 'Agent behavior' },
  { id: 'skills', title: 'Skills', group: 'Agent behavior' },
  { id: 'recipes', title: 'Recipes', group: 'Agent behavior' },
  { id: 'hooks', title: 'Hooks', group: 'Agent behavior' },
  { id: 'system', title: 'System', group: 'Application' },
  { id: 'about', title: 'About & help', group: 'Application' },
]
