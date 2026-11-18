// A phone-sized screen: every tab is reachable without hunting, nothing scrolls sideways, buttons keep their words.
const { chromium } = require('playwright');
const BASE = process.env.MO_BASE;
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) for (const width of [390, 360]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(9000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme} ${width}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme} ${width}] ${name} :: ${e.message.split('\n')[0]}`); } };
    await page.goto(BASE + '/ui'); await page.waitForSelector('.tab');
    await step('all six tabs fit without scrolling the tab bar', async () => {
      const r = await page.evaluate(() => { const t = document.querySelector('.tabs'); return { sw: t.scrollWidth, cw: t.clientWidth, n: t.querySelectorAll('.tab').length }; });
      if (r.n !== 6) throw new Error('tabs: ' + r.n);
      if (r.sw > r.cw + 1) throw new Error(`tab bar overflows by ${r.sw - r.cw}px`);
    });
    for (const tab of ['review', 'vault', 'people', 'journal', 'me', 'settings']) {
      await step(`${tab}: no sideways scroll`, async () => {
        await page.click(`[data-tab=${tab}]`); await page.waitForTimeout(500);
        const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (w > 1) throw new Error('scrolls by ' + w);
      });
    }
    await step('review: small buttons never wrap their words onto two lines', async () => {
      await page.click('[data-tab=review]'); await page.waitForSelector('.feed-item .btn.sm');
      const bad = await page.evaluate(() => Array.from(document.querySelectorAll('.btn.sm')).filter(b => b.offsetHeight > 2.2 * parseFloat(getComputedStyle(b).fontSize) * 1.2).map(b => b.textContent.trim()));
      if (bad.length) throw new Error('wrapped: ' + bad.slice(0, 3).join(', '));
    });
    console.log(`[${scheme} ${width}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
