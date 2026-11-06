// Serves the markdown in docs/ as a readable HTML page.
//
// The public address is /docs/<file>, for example /docs/VALIDATION.md. A
// rewrite in src/middleware.ts maps that here, so the pretty address stays
// stable while this file lives in a plain folder with no square brackets in
// its name (Next.js catch-all folders need brackets, and some hosting and
// upload tools handle those poorly).
//
// Add ?raw=1 to get the plain markdown instead of the rendered page.
//
// The file is read from disk at request time, so a serverless host only ships
// what it is told to trace. next.config.mjs lists docs/*.md in
// outputFileTracingIncludes for exactly that reason: without it the links work
// locally and 404 once deployed.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { NextResponse } from 'next/server';
import { docTitle } from '@/lib/docs';

export const dynamic = 'force-dynamic';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  :root { --ink:#0f172a; --muted:#475569; --border:#e2e8f0; --surface:#ffffff; --canvas:#f8fafc; --accent:#2563eb; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--canvas); color:var(--ink);
    font-family: system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; line-height:1.6; }
  header { position:sticky; top:0; background:var(--surface); border-bottom:1px solid var(--border); }
  header div { max-width:72rem; margin:0 auto; padding:.75rem 1rem; display:flex; gap:1rem; align-items:center; justify-content:space-between; }
  header a { color:var(--muted); text-decoration:none; font-size:.875rem; }
  header a:hover { color:var(--ink); }
  header .brand { color:var(--ink); font-weight:600; font-size:1rem; }
  header nav { display:flex; gap:1rem; }
  main { max-width:48rem; margin:0 auto; padding:2rem 1rem 4rem; }
  h1 { font-size:2rem; margin:0 0 1rem; }
  h2 { font-size:1.35rem; margin:2.25rem 0 .75rem; padding-bottom:.25rem; border-bottom:1px solid var(--border); }
  h3 { font-size:1.1rem; margin:1.5rem 0 .5rem; }
  a { color:var(--accent); }
  code { background:#eef2f7; padding:.1rem .3rem; border-radius:.25rem; font-size:.875em; }
  pre { background:#0f172a; color:#e2e8f0; padding:1rem; border-radius:.5rem; overflow-x:auto; font-size:.8125rem; }
  pre code { background:none; padding:0; color:inherit; }
  table { border-collapse:collapse; width:100%; margin:1rem 0; font-size:.875rem; display:block; overflow-x:auto; }
  th, td { border:1px solid var(--border); padding:.4rem .6rem; text-align:left; vertical-align:top; }
  th { background:var(--surface); }
  blockquote { margin:1rem 0; padding:.25rem 1rem; border-left:3px solid var(--border); color:var(--muted); }
  .raw { font-size:.8125rem; color:var(--muted); margin-top:3rem; }
`;

function page(title: string, body: string, file: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - CosmoCode</title>
<style>${STYLE}</style>
</head>
<body>
<header><div>
  <a class="brand" href="/">CosmoCode <span style="font-weight:400;color:#475569">Earth Analog Finder</span></a>
  <nav><a href="/">Map</a><a href="/docs">Docs</a><a href="https://github.com/NishadIslamUtso/CosmoCode">GitHub</a></nav>
</div></header>
<main>
${body}
<p class="raw">Plain markdown: <a href="/docs/${escapeHtml(file)}?raw=1">${escapeHtml(file)}</a></p>
</main>
</body>
</html>`;
}

export async function GET(request: Request) {
  // src/middleware.ts sets x-doc-name when it rewrites /docs/<file> here.
  // The query string still works, so /api/docs?name=VALIDATION.md is valid too.
  const requested =
    request.headers.get('x-doc-name') ?? new URL(request.url).searchParams.get('name') ?? '';
  const raw =
    request.headers.get('x-doc-raw') === '1' || new URL(request.url).searchParams.get('raw') === '1';

  // Path traversal guard: strip any directory part, then allowlist the name.
  const name = path.basename(requested);
  const title = docTitle(name);
  if (title === null) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const text = await readFile(path.join(process.cwd(), 'docs', name), 'utf8');
    if (raw) {
      return new NextResponse(text, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const html = await marked.parse(text, { gfm: true });
    return new NextResponse(page(title, html, name), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
