const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
const TOKEN = require('fs').readFileSync(process.env.MO_TOKEN_FILE, 'utf8').trim();
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Memory-OB-Token': TOKEN }, body: JSON.stringify(body || {}) }).then(r => r.json());
(async () => {
  // two memories that disagree, made through the app: say the first, then say the opposite and answer "both are true"
  await post('/api/tell', { text: 'I drink coffee every morning.' });
  const t = await post('/api/tell', { text: 'I do not drink coffee every morning.' });
  const home = await (await fetch(BASE + '/api/home')).json();
  const doubt = home.doubts.find(d => /coffee/.test(d.after || ''));
  if (doubt) await post(`/api/doubts/${doubt.id}/answer`, { answer: 'both' });
  // the "both are true" answer is remembered, so make a real disagreement the check-up must raise: edit one memory to clash
  await post('/api/tell', { text: 'I keep a pet cat called Misty.' });
  const found = await (await fetch(BASE + '/api/search?q=pet+cat&limit=5')).json();
  const id = found.results[0].id;
  const put = await fetch(BASE + '/api/records/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Memory-OB-Token': TOKEN }, body: JSON.stringify({ body: 'I live in Rajshahi' }) });
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(9000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const toast = async (re) => { await page.waitForFunction(src => Array.from(document.querySelectorAll('.toast')).some(e => new RegExp(src).test(e.textContent)), re.source); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
    await page.goto(BASE + '/ui'); await page.waitForSelector('#audit-card');
    if (scheme === 'light') {
      await step('check-up card is there before any run', async () => { const t = await page.textContent('#audit-card'); if (!/not done a check-up yet/.test(t)) throw new Error(t.slice(0, 120)); });
      await step('Check now finds things and lists them', async () => {
        await page.click('[data-act=audit-run]'); await toast(/Done/);
        await page.waitForSelector('[data-finding]'); const n = await page.$$eval('[data-finding]', e => e.length); if (!n) throw new Error('no finding');
        const t = await page.textContent('#audit-card'); if (!/Last check-up/.test(t)) throw new Error('no status: ' + t.slice(0, 100));
        const checks = await page.$$eval('#audit-card .mem', e => e.length); if (checks < 4) throw new Error('checks ' + checks);
      });
      await step('a finding offers plain answers', async () => {
        const labels = await page.$$eval('[data-finding] [data-act=audit]', e => e.map(b => b.textContent)); if (!labels.length) throw new Error('no buttons');
        const bad = labels.filter(l => /_|undefined/.test(l)); if (bad.length) throw new Error('ugly label ' + bad);
      });
      await step('answering removes it from the list', async () => {
        const before = await page.$$eval('[data-finding]', e => e.length);
        const btn = await page.$('[data-finding] [data-act=audit][data-choice=keep_both], [data-finding] [data-act=audit][data-choice=still], [data-finding] [data-act=audit][data-choice=keep]');
        if (!btn) throw new Error('no harmless answer to click');
        await btn.click(); await toast(/Kept|ask again/); await page.waitForFunction(b => document.querySelectorAll('[data-finding]').length < b, before);
      });
    }
    await step('Settings has the night switch, on by default', async () => {
      await page.click('[data-tab=settings]'); await page.waitForSelector('[data-opt=audit]', { state: 'attached' });
      if (!(await page.isChecked('[data-opt=audit]'))) throw new Error('not on');
    });
    await step('colors readable: card text has contrast', async () => {
      await page.click('[data-tab=review]'); await page.waitForSelector('#audit-card');
      const bad = await page.evaluate(() => {
        const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; };
        const out = [];
        for (const el of document.querySelectorAll('#audit-card p, #audit-card .t, #audit-card .meta .faint, #audit-card button, #audit-card h2, [data-finding] p, [data-finding] .eyebrow, [data-finding] button')) {
          const f = lum(getComputedStyle(el).color), b = lum(bg(el)); const r = (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
          if (r < 4.5 && el.textContent.trim()) out.push(el.textContent.trim().slice(0, 30) + ' ' + r.toFixed(2));
        }
        return out;
      });
      if (bad.length) throw new Error('low contrast: ' + bad.slice(0, 4).join('; '));
    });
    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
