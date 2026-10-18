# Community, stores, plugins — what it means in AI ASSistant, and when it lands

The owner asked, fairly, why this never came up in the progress reports. It is in `BUILD-TODO.md`
section 3, but a line in a backlog is not an answer. This is the answer: what a plugin *is* here, what
a store *is* here, how community sharing works without a server, and where each piece sits in the order.

**One rule the whole design follows:** the app is local-first and open-source. So nothing here needs an
account, a company server, or a subscription. A plugin is a folder. A store is an index file. Sharing is
a folder you send someone, or a repo you add.

---

## 1. The unit: a pack

One thing to install, one shape to learn. A **pack** is a folder with a `manifest.json`:

```json
{
  "id": "nishad.study-helper",
  "name": "Study helper",
  "version": "1.1.0",
  "author": "…",
  "description": "Turns notes into spaced-repetition cards.",
  "license": "MIT",
  "app": ">=0.2.0",
  "permissions": { "files": "read:vault", "web": ["wikipedia.org"], "shell": false },
  "contributes": {
    "skills":     ["skills/make-cards/SKILL.md"],
    "prompts":    ["prompts/flashcards.md"],
    "agents":     ["agents/tutor.json"],
    "themes":     ["themes/paper.json"],
    "connectors": ["connectors/mcp-local.json"]
  }
}
```

Everything the app can be extended with is a contribution of the same folder: **skills** (a prompt + files,
Claude-style `SKILL.md`), **prompt/template packs** (slash-commands), **agents** (persona + default model +
allowed tools), **themes** (the accent/width/design tokens the app already has), **connectors** (an MCP
server or an HTTP API definition), and **capture recipes** (what the browser extension should keep).

Installed packs live in `<userData>/extensions/<id>/` — plain files, readable, deletable, git-diffable, the
same philosophy as the artifact library. Uninstalling is deleting a folder, and the app can prove it by
showing you the path, exactly like it does for artifacts.

## 2. Permissions and trust, because a plugin that reads your vault must say so

- The manifest declares what it wants. **The app shows that list in plain words before install** ("can read
  your vault", "can reach wikipedia.org", "can run commands: no") and enforces it at runtime through the
  agent-access machinery that already exists (`local`, `browserCapture`, `keepConversations`, per-provider
  cloud switches, and the Files/Shell/Web/MCP switches when they arrive).
- A pack that did not come from the built-in index is marked **unverified — you installed it from a file**,
  never hidden.
- The index pins a checksum per version; an install that doesn't match is refused.

## 3. The store: an index file, not a service

A store is **a URL to an `index.json`** listing packs and versions with checksums. That's it. The app ships
with one default index (this project's own repo) and lets you **add your own** — a friend's index, a company's
internal index, a `file://` folder on a USB stick. This is deliberately the Obsidian/Raycast model, because
it is the only kind of store that survives the app being open-source and offline.

Browsing happens in the app's own Settings → **Extensions** screen (search, author, permissions, install,
update, remove), and search reads the index you have, not a live service.

## 4. Community, without hosting anything

- **Publish**: "Export as pack" on any installed skill/agent/theme — writes the folder and a ready-made
  `index.json` entry. No account, no upload.
- **Share**: send the folder or a `.zip`; "Install from file" is a first-class button, not a hidden dev path.
- **Community index**: this repo grows `community/` — packs live as folders, a PR is the review. Everything
  installed shows author and source, so nobody has to trust a name.
- **Remix**: duplicating a pack is editing a folder, so the "take someone's study skill and make it yours"
  path needs no special feature.

## 5. Where it sits in the order (and why there)

Screens first — the same rule as everything else: a nav item appears when its screen works, and an extension
system with nothing to extend is a worse lie than a missing page.

1. **After Projects (04) and Vault (05)**: pack format + `manifest.json` + **Install from file/folder** +
   the Extensions list in Settings. Small, honest, immediately useful (skills/themes/prompts only).
2. **Then**: the index client — browse/install/update from a URL, with the checksum and permission screens.
3. **Then**: publish/export, and the first-party starter pack (a few real skills, one theme, one template
   set) so the store is never an empty room.
4. **With the agents/Code step**: connectors (MCP servers) become a pack kind, and the runtime they need
   already exists by then.
5. **Last**: community index in the repo, model packs (recommended models + settings per VRAM size), and
   translation packs.

Everything on that list is additive to the app that exists — no step rewrites what a previous step built.
The two invariants: a pack is a folder you can read, and nothing installs with a permission the person was
not shown.
