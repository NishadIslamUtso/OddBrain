const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
const TABS = [['review', 'Review'], ['vault', 'Vault'], ['people', 'People'], ['journal', 'Journal'], ['me', 'Me'], ['settings', 'Settings']];
const API = { review: 'home', vault: 'vault/notes', people: 'people', journal: 'journal', me: 'me', settings: 'settings' };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  const step = async (name, fn) => { try { await fn(); console.log('OK   ' + name); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]); } };
  const heading = () => page.evaluate(() => { const h = document.querySelector('#main h1'); return h ? h.textContent.trim() : ''; });
  const current = () => page.evaluate(() => { const t = document.querySelector('#tabs [aria-current=page]'); return t ? t.textContent.trim().replace(/\d+$/, '').trim() : ''; });
  await page.goto(BASE + '/ui'); await page.waitForSelector('#rv-body section');

  // 1. Open a slow screen, then switch away before it answers: the slow one must never appear.
  for (let i = 0; i < TABS.length; i++) {
    const [slow, slowName] = TABS[i]; const [fast, fastName] = TABS[(i + 2) % TABS.length];
    await step(`slow ${slowName}, then ${fastName}: only ${fastName} stays`, async () => {
      const h = async (route) => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); };
      const pattern = new RegExp('/api/' + API[slow].replace('/', '\\/') + '(\\?|$)');
      await page.route(pattern, h);
      await page.click(`[data-tab=${fast === slow ? 'review' : (slow === 'review' ? 'vault' : 'review')}]`); await page.waitForTimeout(400);   // start from somewhere else
      await page.click(`[data-tab=${slow}]`); await page.waitForTimeout(150);
      await page.click(`[data-tab=${fast}]`);
      await page.waitForTimeout(2300);
      await page.unroute(pattern, h);
      const got = await heading(), tab = await current();
      if (!got.includes(fastName) || tab !== fastName) throw new Error(`screen "${got}", tab "${tab}"`);
    });
  }

  // 2. A save that finishes after you left must not bring its screen back.
  await step('a slow save on Me does not pull Me back over Vault', async () => {
    await page.click('[data-tab=me]'); await page.waitForSelector('.mem.todo input.tick');
    const h = async (route) => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); };
    await page.route(/\/api\/records\/[^/]+\/done/, h);
    await page.click('.mem.todo input.tick'); await page.waitForTimeout(100);
    await page.click('[data-tab=vault]'); await page.waitForTimeout(2600);
    await page.unroute(/\/api\/records\/[^/]+\/done/, h);
    const got = await heading(), tab = await current();
    if (got !== 'Vault' || tab !== 'Vault') throw new Error(`screen "${got}", tab "${tab}"`);
  });

  // 3. Clicking the same tab twice and quickly changing tabs back and forth still lands right.
  await step('quick clicks end on the last tab with its own content', async () => {
    for (const t of ['journal', 'me', 'people', 'settings', 'review', 'journal']) await page.click(`[data-tab=${t}]`);
    await page.waitForTimeout(1500);
    const got = await heading(); if (got !== 'Journal') throw new Error(got);
    if (!(await page.$('#bio'))) throw new Error('no journal content');
  });

  // 4. The banner poll is not tied to a screen.
  await step('status banners still arrive while switching', async () => {
    await page.click('[data-tab=settings]'); await page.waitForSelector('[data-opt=paused] + .track'); await page.click('[data-opt=paused] + .track');
    await page.waitForSelector('#banners .banner.warn'); await page.click('[data-tab=review]'); await page.waitForTimeout(500);
    if (!(await page.$('#banners .banner.warn'))) throw new Error('banner lost');
    await page.click('[data-act=resume]'); await page.waitForFunction(() => !document.querySelector('#banners .banner.warn'));
  });

  console.log(errs.length ? 'FAILED:\n' + errs.join('\n') : 'ALL OK');
  await browser.close(); process.exit(errs.length ? 1 : 0);
})();
