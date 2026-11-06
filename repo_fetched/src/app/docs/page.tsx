import Link from 'next/link';
import { DOCS } from '@/lib/docs';

export default function DocsIndex() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Documentation</h1>
      <p className="mt-2 text-muted">
        How the scores are computed, where the data comes from, and how the results are checked.
        The same files live in the repository under <code>docs/</code>.
      </p>
      <ul className="mt-8 space-y-4">
        {DOCS.map((d) => (
          <li key={d.file} className="rounded-lg border border-border bg-surface px-4 py-3">
            <Link href={`/docs/${d.file}`} className="font-semibold text-accent hover:underline">
              {d.title}
            </Link>
            <p className="mt-1 text-sm text-muted">{d.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
