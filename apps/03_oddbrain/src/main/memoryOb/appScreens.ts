/**
 * Memory_OB screens as a Goose App (MCP Apps resource).
 *
 * Goose v1.55 lists every extension resource whose uri starts with `ui://` and
 * renders its HTML in a window inside the Goose app (the Clock app is the
 * bundled example). This module renders the three owner screens — Projects,
 * Vault, Review — as one app with tabs, from live catalogue state at render
 * time. The Refresh button asks the chat for the screens again (the documented
 * `ui/message` bridge), which re-runs the tool and re-renders fresh state.
 *
 * The app is VIEW-ONLY on purpose. The one decision surface stays what it has
 * always been: the confirmation card in the chat (and the Review window for
 * history, undo and revoke). Nothing here can write, confirm, or approve.
 *
 * PRIVACY: records marked Never Send are never handed to an agent — their
 * titles, texts and ids must not appear in this HTML either, because the app
 * resource is readable through MCP. They are skipped wholesale; the screens
 * only note that hidden records exist, without a count.
 */

export type AppReviewRow = {
  id: string
  title: string
  kind: string
  authority: string
  text: string
  updatedAt: string
}

export type AppProjectRow = { id: string; title: string; records: number; pending: number }

export type AppScreenState = {
  generatedAt: string
  counts: { confirmed: number; pending: number; rejected: number; stale: number; draft: number; raw: number; neverSend: number }
  projects: AppProjectRow[]
  vault: { total: number; files: string[]; capped: boolean } | null
  review: { pending: AppReviewRow[]; rejected: AppReviewRow[]; confirmed: AppReviewRow[] }
}

const escapeHtml = (value: string): string =>
  String(value).replace(/[&<>"']/g, character => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string
  ))

const GOOSE_APP_METADATA = {
  '@context': 'https://goose.ai/schema',
  '@type': 'GooseApp',
  name: 'Memory_OB',
  description: 'Memory_OB screens — Projects, Vault, and Review with live memory state. View-only: approvals happen on the confirmation cards in the chat.',
  width: 940,
  height: 780,
  resizable: true,
  mcpServers: ['memory_ob'],
}

const GOOSE_APP_PRD = `# Memory_OB Screens

## Overview
The owner's memory screens inside the Goose app: Projects, Vault, and Review,
rendered from the live Memory_OB catalogue when the memory_ob_screens tool runs.

## Core Functionality
- Tabs: Projects, Vault, Review — navigable inside the app.
- Counts strip: confirmed memory, pending, rejected, stale, raw evidence.
- Projects: each project with its record count and how many memories are still pending.
- Vault: the owner's memory vault file count and the newest files.
- Review: pending items with their exact quotations, then recently confirmed and rejected.
- Refresh asks the chat for the screens again, re-rendering live state.
- Records marked Never Send never appear here. The app is view-only: approve or
  deny with the confirmation cards in the chat.

## Default Dimensions
- Width: 940px. Height: 780px. Resizable.
`

const rowList = (title: string, rows: AppReviewRow[], empty: string): string => `
      <section class="panel">
        <h2>${escapeHtml(title)} <span class="count">${rows.length}</span></h2>
        ${rows.length === 0 ? `<p class="empty">${escapeHtml(empty)}</p>` : rows.map(row => `
        <article class="row">
          <header><strong>${escapeHtml(row.title)}</strong><span class="tag">${escapeHtml(row.kind)}</span><span class="tag">${escapeHtml(row.authority)}</span></header>
          ${row.text ? `<p class="quote">“${escapeHtml(row.text)}”</p>` : ''}
          <footer>${escapeHtml(row.updatedAt)} · ${escapeHtml(row.id)}</footer>
        </article>`).join('')}
      </section>`

/** Render the three screens as one tabbed app. Every value is HTML-escaped;
 *  nothing is executable beyond the documented host bridge. `snapshot` mode is
 *  the copy the installer drops into Goose's Apps folder — it says plainly when
 *  it was captured and how to get live screens. */
export function buildAppHtml(state: AppScreenState, options?: { snapshot?: boolean }): string {
  const { counts, projects, vault, review } = state
  const hiddenNote = counts.neverSend > 0 ? `
      <p class="empty">Some records are marked Never Send. They never appear in these screens or in anything an AI can see.</p>` : ''
  const snapshotBanner = options && options.snapshot ? `
    <div class="banner">
      This copy was captured when the installer ran (state as of ${escapeHtml(state.generatedAt)}).
      For live screens any time, open the chat and say: <b>show my memory screens</b>.
    </div>` : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Memory_OB</title>
  <script type="application/ld+json">
${JSON.stringify(GOOSE_APP_METADATA, null, 2)}
  </script>
  <script type="application/x-goose-prd">
${GOOSE_APP_PRD}
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font: 14px/1.5 system-ui, "Segoe UI", sans-serif; transition: background-color .3s, color .3s; }
    body.light { background: #f5f5f7; color: #1d1d1f; }
    body.dark { background: #1d1d1f; color: #f5f5f7; }
    .wrap { padding: 16px 20px 20px; max-width: 860px; margin: 0 auto; }
    header.app { padding-bottom: 10px; border-bottom: 1px solid rgba(128,128,128,.25); display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    header.app h1 { margin: 0 0 2px; font-size: 20px; letter-spacing: .3px; }
    header.app .sub { opacity: .65; font-size: 12px; }
    button.refresh { border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
    button.refresh:hover { opacity: .75; }
    .strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0 0; }
    .chip { border: 1px solid rgba(128,128,128,.3); border-radius: 10px; padding: 6px 10px; font-size: 12px; }
    .chip b { font-size: 15px; margin-right: 4px; }
    body.light .chip { background: #fff; } body.dark .chip { background: #2d2d2f; }
    .banner { margin-top: 12px; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; border: 1px solid rgba(128,128,128,.35); opacity: .9; }
    .tabs { display: flex; gap: 6px; margin-top: 14px; }
    .tabs button { flex: 0 0 auto; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; border-radius: 999px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
    .tabs button.active { font-weight: 600; border-color: #0071e3; color: #0071e3; }
    .panel { margin-top: 14px; border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 12px 16px; }
    body.light .panel { background: #fff; } body.dark .panel { background: #2d2d2f; }
    .panel h2 { margin: 2px 0 10px; font-size: 15px; }
    .count { opacity: .55; font-weight: normal; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(128,128,128,.18); }
    th { opacity: .65; font-weight: 600; }
    .row { border-top: 1px solid rgba(128,128,128,.18); padding: 10px 2px; }
    .row:first-of-type { border-top: 0; }
    .row header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
    .row .quote { margin: 6px 0 2px; opacity: .85; font-style: italic; }
    .row footer { opacity: .55; font-size: 11px; word-break: break-all; }
    .tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid rgba(128,128,128,.3); opacity: .8; }
    .empty { opacity: .55; font-style: italic; margin: 4px 0; }
    .files { margin: 0; padding-left: 18px; }
    .files li { margin: 2px 0; word-break: break-all; }
    footer.app { padding: 14px 0 4px; opacity: .6; font-size: 12px; border-top: 1px solid rgba(128,128,128,.25); margin-top: 16px; }
    .pane { display: none; }
    .pane.open { display: block; }
  </style>
</head>
<body class="light">
  <div class="wrap">
  ${snapshotBanner}
  <header class="app">
    <div>
      <h1>Memory_OB</h1>
      <div class="sub">Live memory state as of ${escapeHtml(state.generatedAt)}</div>
    </div>
    <button class="refresh" onclick="refreshScreens()" title="Ask the chat for the screens again">Refresh</button>
  </header>
  <div class="strip">
    <span class="chip"><b>${counts.confirmed}</b>confirmed memory</span>
    <span class="chip"><b>${counts.pending}</b>pending</span>
    <span class="chip"><b>${counts.rejected}</b>rejected</span>
    <span class="chip"><b>${counts.stale}</b>stale</span>
    <span class="chip"><b>${counts.raw}</b>raw evidence</span>
    <span class="chip"><b>${counts.draft}</b>drafts</span>
  </div>
  <div class="tabs">
    <button id="tab-projects" class="active" onclick="showPane('projects')">Projects</button>
    <button id="tab-vault" onclick="showPane('vault')">Vault</button>
    <button id="tab-review" onclick="showPane('review')">Review</button>
  </div>
  <main>
    <div id="pane-projects" class="pane open">
      <section class="panel">
        <h2>Projects <span class="count">${projects.length}</span></h2>
        ${projects.length === 0 ? '<p class="empty">No projects yet.</p>' : `
        <table>
          <tr><th>Project</th><th>Records</th><th>Pending</th></tr>
          ${projects.map(project => `<tr><td>${escapeHtml(project.title || project.id)}</td><td>${project.records}</td><td>${project.pending}</td></tr>`).join('')}
        </table>`}
        ${hiddenNote}
      </section>
    </div>
    <div id="pane-vault" class="pane">
      <section class="panel">
        <h2>Vault <span class="count">${vault ? vault.total : 0} files</span></h2>
        ${vault && vault.files.length ? `
        <ul class="files">
          ${vault.files.slice(0, 120).map(file => `<li>${escapeHtml(file)}</li>`).join('')}
        </ul>
        ${vault.capped || vault.files.length > 120 ? `<p class="empty">Showing ${Math.min(120, vault.files.length)} of ${vault.total} files.</p>` : ''}` : '<p class="empty">The vault is empty.</p>'}
      </section>
    </div>
    <div id="pane-review" class="pane">
      ${rowList('Review · pending', review.pending, 'Nothing is pending. Every proposed memory has been decided.')}
      ${rowList('Review · confirmed recently', review.confirmed, 'No confirmed memory yet.')}
      ${rowList('Review · rejected', review.rejected, 'Nothing has been rejected.')}
      ${hiddenNote}
    </div>
  </main>
  <footer class="app">
    These screens are read-only. To approve or deny a proposed memory, use the confirmation card in the chat.
    Full Review history, undo and revoke live in the Review window (<code>Open Screens.cmd</code>).
  </footer>
  </div>
  <script>
    class McpAppClient {
      constructor() {
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.hostContext = null;
        window.addEventListener('message', (e) => this.handleMessage(e));
        this.initialize();
      }
      async initialize() {
        try {
          const result = await this.request('ui/initialize', {});
          this.hostContext = result.hostContext;
          if (this.hostContext && this.hostContext.theme) this.applyTheme(this.hostContext.theme);
          this.notify('ui/notifications/initialized', {});
          this.reportSize();
        } catch (error) { /* older hosts: stay light */ }
      }
      handleMessage(event) {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if ('id' in data && this.pendingRequests.has(data.id)) {
          const entry = this.pendingRequests.get(data.id);
          this.pendingRequests.delete(data.id);
          data.error ? entry.reject(new Error(data.error.message)) : entry.resolve(data.result);
          return;
        }
        if (data.method === 'ui/notifications/host-context-changed') {
          if (data.params && data.params.theme) this.applyTheme(data.params.theme);
        }
      }
      request(method, params) {
        return new Promise((resolve, reject) => {
          const id = ++this.requestId;
          this.pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params }, '*');
          setTimeout(() => {
            if (this.pendingRequests.has(id)) { this.pendingRequests.delete(id); reject(new Error('Request timed out')); }
          }, 30000);
        });
      }
      notify(method, params) { window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params }, '*'); }
      applyTheme(theme) { document.body.className = (theme === 'dark') ? 'dark' : 'light'; }
      reportSize() { this.notify('ui/notifications/size-changed', { height: document.body.scrollHeight }); }
      sendMessage(text) { return this.request('ui/message', { content: { type: 'text', text: text } }); }
    }
    window.mcpApp = new McpAppClient();
    function showPane(name) {
      for (const pane of ['projects', 'vault', 'review']) {
        document.getElementById('pane-' + pane).className = (pane === name) ? 'pane open' : 'pane';
        document.getElementById('tab-' + pane).className = (pane === name) ? 'active' : '';
      }
      if (window.mcpApp) window.mcpApp.reportSize();
    }
    function refreshScreens() {
      const button = document.querySelector('.refresh');
      if (button) { button.textContent = 'Refreshing…'; button.disabled = true; }
      const done = () => { if (button) { button.textContent = 'Refresh'; button.disabled = false; } };
      if (window.mcpApp) {
        window.mcpApp.sendMessage('show my memory screens').then(done, done);
      } else { done(); }
    }
  </script>
</body>
</html>
`
}
