import { NextResponse, type NextRequest } from 'next/server';

// Sends /docs/<file> to the docs route handler at /api/docs.
//
// Next.js could do this with a catch-all folder such as
// src/app/docs/[...slug]/route.ts, but folder names with square brackets are
// awkward to move around: some upload tools, archivers and hosting panels
// mishandle them. So the handler lives in a plain folder and this one small
// middleware file does the address translation instead.
//
// The public addresses do not change: /docs/VALIDATION.md still works, and
// /docs/VALIDATION.md?raw=1 returns the plain markdown.

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/docs\/(.+)$/);
  if (!match) return NextResponse.next();

  // The file name travels in a request header rather than in the query
  // string: a rewrite does not reliably carry a rewritten query through to
  // the route handler, but it always carries request headers.
  const headers = new Headers(request.headers);
  headers.set('x-doc-name', match[1]);
  headers.set('x-doc-raw', request.nextUrl.searchParams.get('raw') === '1' ? '1' : '0');

  return NextResponse.rewrite(new URL('/api/docs', request.url), {
    request: { headers },
  });
}

export const config = {
  matcher: '/docs/:path*',
};
