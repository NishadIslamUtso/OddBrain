// The documents served at /docs/<file>. This is the single list used by the
// docs index page and by the route handler that serves them, so adding a file
// to docs/ means adding one entry here.

export interface DocEntry {
  file: string;
  title: string;
  description: string;
}

export const DOCS: DocEntry[] = [
  {
    file: 'METHODOLOGY.md',
    title: 'Methodology',
    description:
      'The scoring model: similarity, weighting, structural mismatch, confidence, profiles, assumptions and limitations.',
  },
  {
    file: 'PROVENANCE.md',
    title: 'Data provenance',
    description:
      'Where every number comes from, which values are measured, derived or estimated, and how to regenerate them.',
  },
  {
    file: 'VALIDATION.md',
    title: 'Validation',
    description:
      'What the automated checks verify, their latest output, and how sensitive the ranking is to the weights.',
  },
];

export function docTitle(file: string): string | null {
  return DOCS.find((d) => d.file === file)?.title ?? null;
}
