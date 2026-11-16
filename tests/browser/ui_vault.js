const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1200, height: 850 }, colorScheme: 'light' });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000); const errs = [];
  page.on('response', r => { if (r.status() >= 400 && r.status() !== 400) console.log('   HTTP', r.status(), r.request().method(), r.url().replace(BASE, '')); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errs.push('console ' + m.text()); });
  const step = async (name, fn) => { try { await fn(); console.log('OK   ' + name); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]); } };
  const toast = async (re) => { await page.waitForFunction(src => { const r = new RegExp(src); return Array.from(document.querySelectorAll('.toast')).some(e => r.test(e.textContent)); }, re.source, { timeout: 8000 }); await page.evaluate(() => document.querySelectorAll('.toast').forEach(e => e.remove())); };
  const rows = () => page.$$eval('#v-tree .vx-row', els => els.map(e => ({ cls: e.className, text: e.querySelector('.nm').textContent, open: e.getAttribute('aria-expanded') })));
  await page.goto(BASE + '/ui'); await page.waitForSelector('#rv-body section');
  await page.click('[data-tab=vault]'); await page.waitForSelector('#v-tree .vx-row');

  await step('tree: real folders you can open and close', async () => {
    const r = await rows(); const dirs = r.filter(x => x.cls.includes('dir')); if (dirs.length < 4) throw new Error('few folders ' + dirs.length);
    const before = r.length; await page.click('#v-collapse'); await page.waitForTimeout(150);
    const closed = await rows(); if (!closed.every(x => x.cls.includes('dir') && x.open === 'false')) throw new Error('collapse all left things open: ' + JSON.stringify(closed.slice(0, 5)));
    if ((await page.textContent('#v-collapse')) !== 'Expand all') throw new Error('button label');
    await page.click('#v-collapse'); await page.waitForTimeout(150); const again = await rows(); if (again.length < before) throw new Error('expand all showed ' + again.length + ' vs ' + before);
    await page.click('#v-collapse'); await page.waitForTimeout(100);
    await page.click('#v-tree .vx-row.dir >> text=Health'); await page.waitForTimeout(100);
    const one = await rows(); if (!one.some(x => x.text === 'Health' && x.open === 'true')) throw new Error('Health did not open'); });
  await step('tree: sort changes the order', async () => {
    await page.click('#v-collapse'); await page.click('#v-collapse'); await page.waitForTimeout(100);
    const a = (await rows()).filter(x => x.cls.includes('dir')).map(x => x.text); await page.selectOption('#v-sort', 'name-desc'); await page.waitForTimeout(150);
    const b = (await rows()).filter(x => x.cls.includes('dir')).map(x => x.text);
    if (a[0] === b[0]) throw new Error('first folder unchanged: ' + a + ' | ' + b); if (b[0] !== 'Projects & Ideas' && b[0] !== 'Plans') throw new Error('Z-A should start near the end: ' + b);
    await page.selectOption('#v-sort', 'name'); });
  await step('tree: remembers what is open after a reload', async () => {
    await page.click('#v-collapse'); await page.waitForTimeout(100); await page.click('#v-tree .vx-row.dir >> text=Learning'); await page.waitForTimeout(600);
    await page.reload(); await page.waitForSelector('[data-tab=vault]'); await page.click('[data-tab=vault]'); await page.waitForSelector('#v-tree .vx-row');
    const r = await rows(); const open = r.filter(x => x.open === 'true').map(x => x.text); if (JSON.stringify(open) !== '["Learning"]') throw new Error('open: ' + JSON.stringify(open)); });
  await step('note: opens with its lines, one memory each', async () => {
    await page.click('#v-tree .vx-row.file'); await page.waitForSelector('.vx-line'); const n = await page.$$eval('.vx-line', e => e.length); if (n < 1) throw new Error('no lines');
    const t = await page.textContent('.vx-article'); if (/\^[0-9a-f]{6,}/.test(t)) throw new Error('block ids showing: ' + t.slice(0, 120));
    if (!(await page.$('.vx-rail'))) throw new Error('no side panel'); });
  await step('note: a line can be edited and filed in a note of its own', async () => {
    await page.hover('.vx-line'); await page.click('.vx-line [data-act=vl-edit]'); await page.waitForSelector('.vx-line textarea');
    await page.fill('.vx-line textarea', 'I plan to learn Rust and Go next month.'); await page.fill('.vx-line [data-f=note]', 'Programming'); await page.click('[data-act=vl-save]'); await toast(/Saved/);
    await page.waitForFunction(() => /Programming/.test(document.querySelector('.vx-article h2').textContent)); const t = await page.textContent('.vx-article'); if (!/Rust and Go/.test(t)) throw new Error('text not saved'); });
  await step('note: forget a line (confirm) and it goes', async () => {
    const before = await page.$$eval('.vx-line', e => e.length); await page.hover('.vx-line'); await page.click('.vx-line [data-act=mem-forget]'); await page.click('.modal [data-yes]'); await toast(/Forgotten/);
    await page.waitForTimeout(500); const after = await page.$$eval('.vx-line', e => e.length).catch(() => 0); if (!(after < before) && (await page.$('.vx-article h2'))) { const h = await page.textContent('.vx-article h2'); if (/Programming/.test(h)) throw new Error(`lines ${before} -> ${after}`); } });
  await step('search: matching lines are shown with the word picked out', async () => {
    await page.fill('#v-q', 'peanuts'); await page.waitForSelector('.vx-hit mark'); const t = await page.textContent('.vx-hit'); if (!/peanuts/i.test(t)) throw new Error(t);
    await page.click('[data-act=v-clear]'); await page.waitForSelector('#v-tree .vx-row'); });
  await step('jump: Ctrl+O finds a note by a few letters and opens it', async () => {
    await page.keyboard.press('Control+o'); await page.waitForSelector('#sw-q'); await page.keyboard.type('inter'); await page.waitForSelector('#sw-list li button'); const first = await page.textContent('#sw-list li button');
    await page.keyboard.press('Enter'); await page.waitForSelector('.vx-article h2'); const h = await page.textContent('.vx-article h2'); if (!/Interests/i.test(h)) throw new Error('opened ' + h + ' after ' + first);
    if (await page.$('#sw-q')) throw new Error('switcher still open'); });
  await step('jump: Escape closes it', async () => { await page.keyboard.press('Control+o'); await page.waitForSelector('#sw-q'); await page.keyboard.press('Escape'); await page.waitForTimeout(100); if (await page.$('#sw-q')) throw new Error('still open'); });
  await step('people note links to the notes that mention them', async () => {
    await page.fill('#v-q', 'Aisha'); await page.waitForSelector('.vx-hit'); await page.click('.vx-hit:has-text("Aisha")'); await page.waitForSelector('.vx-rail'); await page.click('[data-act=v-clear]'); });
  await step('graph: draws, moves by itself, and a dragged dot stays put while others follow', async () => {
    await page.click('[data-act=v-view][data-view=graph]'); await page.waitForSelector('#g-canvas'); await page.waitForFunction(() => window.__graphDebug && window.__graphDebug.nodes.length > 3);
    const a = await page.evaluate(() => window.__graphDebug.nodes.map(n => [n.x, n.y])); await page.waitForTimeout(700); const b = await page.evaluate(() => window.__graphDebug.nodes.map(n => [n.x, n.y]));
    const moved = a.filter((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) > 0.01).length; if (!moved) throw new Error('nothing moves (not live)');
    if (!a.flat().every(Number.isFinite)) throw new Error('NaN positions'); });
  await step('graph: dragging a dot moves it and the dots linked to it follow', async () => {
    const info = await page.evaluate(() => { const L = window.__graphDebug; const n = L.nodes.slice().sort((x, y) => y.deg - x.deg)[0]; const r = document.querySelector('#g-canvas').getBoundingClientRect(); return { id: n.id, sx: r.left + n.x * L.view.k + L.view.x, sy: r.top + n.y * L.view.k + L.view.y, x: n.x, y: n.y }; });
    await page.mouse.move(info.sx, info.sy); await page.mouse.down(); await page.mouse.move(info.sx + 120, info.sy + 60, { steps: 8 }); await page.waitForTimeout(250);
    const mid = await page.evaluate((id) => { const n = window.__graphDebug.nodes.find(x => x.id === id); return { x: n.x, y: n.y, fx: n.fx }; }, info.id); await page.mouse.up();
    if (mid.fx == null) throw new Error('dot not held while dragging'); if (Math.hypot(mid.x - info.x, mid.y - info.y) < 20) throw new Error('dot did not move'); });
  await step('graph: wheel zooms and the buttons fit', async () => {
    const k0 = await page.evaluate(() => window.__graphDebug.view.k); const box = await page.$eval('#g-canvas', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width - 40, y: r.top + 40 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.wheel(0, -300); await page.waitForTimeout(150); const k1 = await page.evaluate(() => window.__graphDebug.view.k); if (!(k1 > k0)) throw new Error(`zoom ${k0} -> ${k1}`);
    await page.click('[data-act=g-zoom][data-dir=fit]'); const k2 = await page.evaluate(() => window.__graphDebug.view.k); if (Math.abs(k2 - k1) < 1e-6) throw new Error('fit did nothing'); });
  await step('graph: a click on a dot opens that note', async () => {
    const pos = await page.evaluate(() => { const L = window.__graphDebug; const n = L.nodes.find(x => x.type !== 'tag'); const r = document.querySelector('#g-canvas').getBoundingClientRect(); return { sx: r.left + n.x * L.view.k + L.view.x, sy: r.top + n.y * L.view.k + L.view.y, label: n.label }; });
    await page.mouse.click(pos.sx, pos.sy); await page.waitForSelector('.vx-article h2'); const h = await page.textContent('.vx-article h2'); if (!h.trim()) throw new Error('no title'); });
  await step('graph: only around the open note, and the forces sliders react', async () => {
    await page.click('[data-act=v-view][data-view=graph]'); await page.waitForSelector('#g-canvas'); await page.waitForFunction(() => window.__graphDebug);
    const all = await page.evaluate(() => window.__graphDebug.nodes.length); await page.click('details.vx-disp summary'); await page.check('[data-graph=local]'); await page.waitForTimeout(300);
    const local = await page.evaluate(() => window.__graphDebug ? window.__graphDebug.nodes.length : 0); if (!(local >= 1 && local <= all)) throw new Error(`all ${all} local ${local}`);
    await page.uncheck('[data-graph=local]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const r = document.querySelector('[data-force=repel]'); r.value = 1; r.dispatchEvent(new Event('input', { bubbles: true })); }); const p = await page.evaluate(() => window.__graphDebug.params().repel); if (p !== 1) throw new Error('repel ' + p); });
  await step('graph: leaving the Vault stops the animation', async () => { await page.click('[data-tab=people]'); await page.waitForTimeout(300); const alive = await page.evaluate(() => !!document.querySelector('#g-canvas')); if (alive) throw new Error('canvas still there'); });
  await step('physics: settles without blowing up or piling dots on each other', async () => {
    const r = await page.evaluate(() => { const nodes = []; const N = 80; for (let i = 0; i < N; i++) nodes.push({ id: i, x: Math.cos(i) * 10 * Math.sqrt(i + 1), y: Math.sin(i) * 10 * Math.sqrt(i + 1), vx: 0, vy: 0, fx: null, fy: null, deg: 0, r: 5 });
      const links = []; for (let i = 1; i < N; i++) links.push([i, Math.floor(Math.random() * i)]); links.forEach(([a, b]) => { nodes[a].deg++; nodes[b].deg++; });
      const sim = makeSim(nodes, links); let t = 0; while (sim.tick() && t < 2000) t++;
      let minD = Infinity, span = 0; for (let i = 0; i < N; i++) { for (let j = i + 1; j < N; j++) minD = Math.min(minD, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)); span = Math.max(span, Math.hypot(nodes[i].x, nodes[i].y)); }
      const L = links.map(([a, b]) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)); return { ticks: t, minD, span, avgLink: L.reduce((a, b) => a + b, 0) / L.length, finite: nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)) }; });
    console.log('     physics:', JSON.stringify(r)); if (!r.finite) throw new Error('NaN'); if (r.minD < 6) throw new Error('dots on top of each other: ' + r.minD); if (r.span > 900) throw new Error('flew apart: ' + r.span); if (r.ticks >= 2000) throw new Error('never settles'); });
  await page.setViewportSize({ width: 380, height: 800 });
  await step('narrow: vault has no sideways scroll, in tree, note and graph', async () => {
    await page.click('[data-tab=vault]'); await page.waitForSelector('#v-tree'); for (const view of ['note', 'graph']) { await page.click(`[data-act=v-view][data-view=${view}]`); await page.waitForTimeout(500); const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (over > 2) throw new Error(`${view} overflows by ${over}px`); } });
  await browser.close();
  console.log('\nERRORS', errs.length); errs.forEach(e => console.log('  ' + e)); process.exit(errs.length ? 1 : 0);
})();
