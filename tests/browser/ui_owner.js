const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
const TOKEN = require('fs').readFileSync(process.env.MO_TOKEN_FILE, 'utf8').trim();
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Memory-OB-Token': TOKEN }, body: JSON.stringify(body || {}) }).then(r => r.json());
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    if (scheme === 'dark') { // the second pass starts from "nobody is you" again
      const people = (await (await fetch(BASE + '/api/people')).json()).people;
      for (const p of people.filter(x => x.is_me)) await post(`/api/people/${p.id}/me`, { is_me: false });
    }
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(9000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const toast = async (re) => { await page.waitForFunction(src => Array.from(document.querySelectorAll('.toast')).some(e => new RegExp(src).test(e.textContent)), re.source); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
    await page.goto(BASE + '/ui'); await page.click('[data-tab=people]'); await page.waitForSelector('.person-row');

    await step('before anything: asks which one is you', async () => {
      await page.waitForSelector('#me-slot [data-act=add-myself]');
      const t = await page.textContent('#me-slot'); if (!/Which one is you/.test(t)) throw new Error(t.slice(0, 80));
    });
    await step('a profile that is not you offers "This is me"', async () => {
      await page.click('.person-row:has-text("Aisha")'); await page.waitForSelector('[data-act=mark-me]');
    });
    await step('mark a profile as you: it moves to the top with a You chip', async () => {
      await page.click('[data-act=mark-me]'); await toast(/Marked as you/);
      await page.waitForFunction(() => document.querySelector('.person-row .chip') && /You/.test(document.querySelector('.person-row .chip').textContent));
      const first = await page.textContent('.person-row'); if (!/Aisha/.test(first)) throw new Error('not first: ' + first.slice(0, 60));
      if (await page.$('#me-slot [data-act=add-myself]')) throw new Error('still asking which one is you');
    });
    await step('another profile no longer offers "This is me"', async () => {
      await page.click('.person-row:has-text("Rahim")'); await page.waitForSelector('[data-act=merge-person], [data-act=delete-person]');
      if (await page.$('[data-act=mark-me]')) throw new Error('offers a second you');
    });
    await step('your own profile says so and offers to take it off', async () => {
      await page.click('.person-row:has-text("Aisha")'); await page.waitForSelector('[data-act=unmark-me]');
      const t = await page.textContent('#pd'); if (!/This is you/.test(t)) throw new Error('no "This is you"');
    });
    await step('take it off: the question comes back', async () => {
      await page.click('[data-act=unmark-me]'); await toast(/Taken off/);
      await page.waitForSelector('#me-slot [data-act=add-myself]');
      if (await page.$('.person-row .chip')) throw new Error('You chip still there');
    });
    await step('Undo in Review puts it back', async () => {
      await page.click('[data-tab=review]'); await page.waitForSelector('.feed-item');
      const row = page.locator('.feed-item', { hasText: 'Taken off as you' }).first(); await row.waitFor();
      await row.locator('[data-act=undo]').click(); await toast(/Put back/);
      await page.click('[data-tab=people]'); await page.waitForSelector('.person-row');
      await page.waitForFunction(() => /You/.test((document.querySelector('.person-row .chip') || {}).textContent || ''));
    });
    await step('add yourself by name when you are not in the list', async () => {
      const people = (await (await fetch(BASE + '/api/people')).json()).people;
      for (const p of people.filter(x => x.is_me)) await post(`/api/people/${p.id}/me`, { is_me: false });
      await page.click('[data-tab=review]'); await page.click('[data-tab=people]'); await page.waitForSelector('#me-slot [data-act=add-myself]');
      await page.click('[data-act=add-myself]'); await page.fill('#pf-name', 'Nishad Islam Utso'); await page.click('.modal button[type=submit]'); await toast(/Marked as you/);
      await page.waitForSelector('.person-row:has-text("Nishad Islam Utso") .chip');
    });
    await step('narrow screen: no sideways scroll', async () => {
      await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(300);
      const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 1) throw new Error('scrolls by ' + w);
    });
    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
