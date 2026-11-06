import Link from 'next/link';

export const REPO_URL = 'https://github.com/NishadIslamUtso/CosmoCode';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-accent" />
          <span className="font-semibold">CosmoCode</span>
          <span className="hidden text-sm text-muted sm:inline">Earth Analog Finder</span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted hover:text-ink">
            Map
          </Link>
          <Link href="/docs" className="text-muted hover:text-ink">
            Docs
          </Link>
          <Link href="/docs/PROVENANCE.md" className="text-muted hover:text-ink">
            Provenance
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
