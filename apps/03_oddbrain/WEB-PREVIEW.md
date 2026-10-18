# Looking at the app in a browser

The desktop app is the product. But waiting for a full Electron build to see a
button move is slow, and building on a machine you are not sitting at is slower
still. So the interface has a second way out: the renderer alone, built as a
plain static site and served anywhere.

## What the browser preview is

- The **same renderer source**: the same components, the same Tailwind theme,
  the same `@shared` modules the desktop app uses. Not a mock-up, not a second
  copy to keep in sync.
- Built by plain Vite with no Electron involved, so the host needs no display and
  no desktop runtime.
- Fast: the whole thing compiles in a couple of seconds.

## What it is not

It cannot touch your files, your vault, your models or your shell. In the desktop
app those travel over the preload bridge (`window.api`), which a browser does not
have. So:

- `isDemo` is true, and the interface knows it — anything that needs the machine
  shows as unavailable rather than as a button that does nothing.
- The demo layer returns **empty, never invented** data. No fake chats, no fake
  vault entries, no fake model replies. You see the app's own empty states, which
  is what you want to be looking at anyway.
- Keys never exist in this build. There is nothing in the static bundle that can
  reach a provider, on purpose.

## Environment variables

None required. The preview makes no network requests of its own; its
`Content-Security-Policy` allows none, so this is enforced rather than promised.

## Commands

```bash
npm run build:web     # build the renderer to dist-web/
npm run preview:web   # serve dist-web/ on http://localhost:4174
npm run dev:web       # same, with hot reload, on http://localhost:5174
```

Both dev and preview servers bind `0.0.0.0` and accept any host header, so the
same commands work behind a tunnel or a preview proxy.

## Serving the built folder

`dist-web/` is a plain static site: HTML, CSS and JavaScript, no server behind
it, no build step needed to serve it. Any static host can serve the folder as
it is — nothing here is tied to a particular one, and the desktop app does not
need it at all.
