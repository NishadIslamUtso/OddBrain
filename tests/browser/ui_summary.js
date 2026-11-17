const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const toast = async (re) => { await page.waitForFunction(src => Array.from(document.querySelectorAll('.toast')).some(e => new RegExp(src).test(e.textContent)), re.source); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
    await page.goto(BASE + '/ui'); await page.waitForSelector('#rv-body section');
    const word = scheme === 'light' ? 'herb garden' : 'green tea';
    let n = 0, base = 0;
    await step('a big message becomes one card', async () => {
      // the seeded vault already has a card from an earlier message, so wait for a NEW one
      const before = await page.$$eval('.feed-group', e => e.length); base = before;
      await page.fill('#tell', scheme === 'light'
        ? 'I keep a small herb garden on my balcony. I want to learn pottery next year. I always drink lemon water in the morning. I run five kilometres every Sunday.'
        : 'I drink green tea every afternoon. I want to learn the violin someday. I read a book every night before sleep. I cycle to the university every day.');
      await page.click('[data-act=tell]'); await page.waitForFunction(() => /Remembered/.test(document.querySelector('#tell-msg').textContent));
      await page.waitForFunction(b => document.querySelectorAll('.feed-group').length > b, before);
      const t = await page.textContent('.feed-group .verb'); const m = /Saved (\d+) things from your message/.exec(t); if (!m) throw new Error('verb: ' + t); n = +m[1]; if (n < 3) throw new Error('only ' + n);
      if (await page.$('.feed-group .grp-body')) throw new Error('should start closed');
    });
    await step('see what was saved lists every line', async () => {
      await page.click('.feed-group [data-act=toggle-group]'); await page.waitForSelector('.feed-group .grp-body .feed-item');
      const c = await page.$$eval('.feed-group .grp-body .feed-item', e => e.length); if (c !== n) throw new Error(`${c} lines, expected ${n}`);
    });
    await step('colors readable: summary card and upgrade notice have contrast', async () => {
      const bad = await page.evaluate(() => {
        // the notice uses the plain .banner box, so put a real one next to the card and measure both
        document.querySelector('#rv-body').insertAdjacentHTML('afterbegin', '<div class="banner" id="probe-banner"><span>Some older questions were closed.</span><button class="btn sm">Got it</button></div>');
        const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; };
        const out = [];
        for (const root of document.querySelectorAll('.feed-group, #probe-banner')) {
          for (const el of root.querySelectorAll('*')) {
            const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
            if (!own) continue;
            const f = lum(getComputedStyle(el).color), b = lum(bg(el)); const r = (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
            if (r < 4.5) out.push(el.textContent.trim().slice(0, 30) + ' ' + r.toFixed(2));
          }
        }
        document.querySelector('#probe-banner').remove();
        return out;
      });
      if (bad.length) throw new Error('low contrast: ' + bad.slice(0, 4).join('; '));
    });
    await step('one line can be undone alone', async () => {
      await page.click('.feed-group .grp-body .feed-item [data-act=undo]'); await toast(/Put back/);
      await page.waitForFunction(k => document.querySelectorAll('.feed-group .grp-body .feed-item [data-act=undo]').length === k, n - 1);
      const greyed = await page.$$eval('.feed-item.undone', e => e.length); if (greyed) throw new Error(`${greyed} greyed-out rows left on screen`);
    });
    await step('Undo all puts the rest back', async () => {
      await page.click('.feed-group [data-act=undo-group]'); await toast(/Put back/);
      await page.waitForFunction(b => document.querySelectorAll('.feed-group').length === b, base);     // the new card is gone, the older one stays
      const left = await page.$$eval('#rv-body .feed-item.undone, #rv-body .chip', els => els.filter(e => e.classList.contains('undone') || /^Undone$/.test(e.textContent.trim())).length); if (left) throw new Error('a greyed Undone row is still on screen');
    });
    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
