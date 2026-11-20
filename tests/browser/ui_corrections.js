// One-click corrections on what the AI filed: Not important, Wrong shelf, Not me - each undoable, none shown where they cannot work.
const { chromium } = require('playwright');
const BASE = process.env.MO_BASE;
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(9000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const toast = async re => { await page.waitForFunction(src => Array.from(document.querySelectorAll('.toast')).some(e => new RegExp(src).test(e.textContent)), re.source); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
    let shelf0 = '';
    const word = scheme === 'light' ? 'mango' : 'guava';
    await page.goto(BASE + '/ui'); await page.waitForSelector('#tell');
    const say = async t => { await page.fill('#tell', t); await Promise.all([page.waitForResponse(r => /\/api\/tell$/.test(r.url())), page.click('[data-act=tell]')]); await page.waitForFunction(() => !document.querySelector('[data-act=tell]').disabled); };
    const rowWith = text => page.locator('.feed-item', { hasText: text }).first();
    const goReview = async () => { await page.click('[data-tab=me]'); await page.click('[data-tab=review]'); await page.waitForSelector('#rv-body .feed-item'); };

    await step('what the AI filed shows the three corrections, and Undo', async () => {
      await say(`I really love eating ${word} in summer.`);
      await goReview();
      const row = rowWith(`eating ${word}`); await row.waitFor();
      for (const label of ['Not important', 'Wrong shelf', 'Not me', 'Undo']) if (!(await row.getByRole('button', { name: label }).count())) throw new Error('no "' + label + '" button');
    });
    await step('rows that were already removed or undone offer no corrections', async () => {
      const bad = await page.evaluate(() => Array.from(document.querySelectorAll('.feed-item')).filter(li => /^(Removed|Forgotten|Put aside|Undone)/.test((li.querySelector('.verb') || {}).textContent || '') && li.querySelector('.fixes')).length);
      if (bad) throw new Error(bad + ' removed rows still show the corrections');
    });
    await step('Wrong shelf: shows the real shelves, one click moves it, the feed says Moved', async () => {
      const row = rowWith(`eating ${word}`);
      await row.getByRole('button', { name: 'Wrong shelf' }).click();
      const picks = row.locator('.shelf-pick .chip'); await picks.first().waitFor();
      const names = await picks.allTextContents(); if (names.length < 3) throw new Error('too few shelves: ' + names.join(','));
      const current = (await row.locator('.top .chip').first().textContent()).trim(); shelf0 = current;
      if (names.some(n => n.trim() === current)) throw new Error('offers the shelf it is already on: ' + current);
      const other = names.find(n => n.trim() !== current); await row.locator('.shelf-pick .chip', { hasText: other }).first().click();
      await toast(/Moved to/);
      await page.waitForFunction(w => Array.from(document.querySelectorAll('.feed-item')).some(li => /Moved/.test(li.textContent) && li.textContent.includes(w)), word);
    });
    await step('Undo puts the shelf back', async () => {
      const moved = page.locator('.feed-item', { hasText: 'Moved' }).filter({ hasText: word }).first();
      await moved.getByRole('button', { name: 'Undo' }).click();
      await page.waitForFunction(w => !Array.from(document.querySelectorAll('.feed-item')).some(li => /^Moved/.test(li.textContent.trim()) && li.textContent.includes(w)), word);
      const back = (await rowWith(`eating ${word}`).locator('.top .chip').first().textContent()).trim();
      if (back !== shelf0) throw new Error(`back on "${back}", was on "${shelf0}"`);
    });
    await step('Not me: says so in plain words, and Undo restores it', async () => {
      // the AI files this one as the owner's own, so the owner can put it right
      const row = rowWith(`eating ${word}`); await row.waitFor();
      await row.getByRole('button', { name: 'Not me' }).click(); await toast(/someone else/);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.feed-item')).some(li => /Marked as about someone else/.test(li.textContent)));
      const marked = page.locator('.feed-item', { hasText: 'Marked as about someone else' }).first();
      await marked.getByRole('button', { name: 'Undo' }).click();
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('.feed-item')).some(li => /Marked as about someone else/.test(li.textContent)));
      if (!(await rowWith(`eating ${word}`).getByRole('button', { name: 'Not me' }).count())) throw new Error('it is not back as an ordinary memory');
    });
    await step('Not important: it is removed, the old row stops offering corrections, and Undo brings it back', async () => {
      await say(`I sometimes think about ${word} stickers.`); await goReview();
      const row = rowWith(`${word} stickers`); await row.waitFor();
      await row.getByRole('button', { name: 'Not important' }).click(); await toast(/Undo brings it back/);
      await page.waitForFunction(w => Array.from(document.querySelectorAll('.feed-item')).some(li => /^Removed/.test(li.textContent.trim()) && li.textContent.includes(w) && /by you/.test(li.textContent)), `${word} stickers`);
      const stale = await page.evaluate(w => Array.from(document.querySelectorAll('.feed-item')).filter(li => /^Remembered/.test(li.textContent.trim()) && li.textContent.includes(w) && li.querySelector('.fixes')).length, `${word} stickers`);
      if (stale) throw new Error('a removed memory still offers corrections that would fail');
      const gone = page.locator('.feed-item', { hasText: 'Removed' }).filter({ hasText: `${word} stickers` }).first();
      await gone.getByRole('button', { name: 'Undo' }).click();
      await page.waitForFunction(w => !Array.from(document.querySelectorAll('.feed-item')).some(li => /^Removed/.test(li.textContent.trim()) && li.textContent.includes(w)), `${word} stickers`);
      await rowWith(`${word} stickers`).getByRole('button', { name: 'Not important' }).waitFor();
    });
    await step('a memory you moved yourself no longer shows the AI row\'s corrections (nothing to fail on)', async () => {
      const row = rowWith(`eating ${word}`); await row.getByRole('button', { name: 'Wrong shelf' }).click();
      await row.locator('.shelf-pick .chip').first().click(); await toast(/Moved to/);
      await page.waitForFunction(w => Array.from(document.querySelectorAll('.feed-item')).some(li => /^Moved/.test(li.textContent.trim()) && li.textContent.includes(w)), `eating ${word}`);   // the screen has redrawn
      const stale = await page.evaluate(w => Array.from(document.querySelectorAll('.feed-item')).filter(li => /^Remembered/.test(li.textContent.trim()) && li.textContent.includes(w) && li.querySelector('.fixes')).length, `eating ${word}`);
      if (stale) throw new Error('the older row still offers corrections');
    });
    await step('the buttons can be reached by keyboard and say what they do', async () => {
      const row = rowWith(`${word} stickers`).first();
      const names = await row.locator('.fixes button').evaluateAll(bs => bs.map(b => b.textContent.trim()));
      if (names.join('|') !== 'Not important|Wrong shelf|Not me') throw new Error(names.join('|'));
      if (!(await row.locator('.fixes').getAttribute('aria-label'))) throw new Error('no label');
    });
    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
