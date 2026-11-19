// While the AI reads what was waiting, the owner can tell "working" from "stuck", and can stop it.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.MO_BASE, MODE = process.env.MO_AI_MODE_FILE;
const setAI = m => fs.writeFileSync(MODE, m);
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(12000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const live = () => page.evaluate(() => { const e = document.querySelector('#reading-live'); return e ? e.innerText : ''; });
    // each "tell" starts a short background read of its own; wait until none is running before changing the AI
    const idle = async () => { for (let i = 0, quiet = 0; i < 60 && quiet < 3; i++) { const run = await page.evaluate(async () => (await (await fetch('/api/status')).json()).reading.running); quiet = run ? 0 : quiet + 1; await page.waitForTimeout(150); } };
    const tag = scheme === 'light' ? 'L' : 'D';
    await page.goto(BASE + '/ui'); await page.waitForSelector('#tell');

    await step('five messages are kept while the AI is down', async () => {
      setAI('down');
      for (const t of [`My cat ${tag}one likes fish every day.`, `My cat ${tag}two sleeps on the sofa.`, `My cat ${tag}three hates the rain.`, `My cat ${tag}four chases birds in the garden.`, `My cat ${tag}five wakes me up at dawn.`]) {
        // wait for each answer: the button ignores a click while the last message is still being kept
        await page.fill('#tell', t);
        await Promise.all([page.waitForResponse(r => /\/api\/tell$/.test(r.url())), page.click('[data-act=tell]')]);
        await page.waitForFunction(() => /kept this safe/.test(document.querySelector('#tell-msg').textContent));
        await page.waitForFunction(() => !document.querySelector('[data-act=tell]').disabled);
      }
      await idle(); await page.waitForSelector('#waiting-card');
    });

    await step('Read now with a slow AI: a live block shows which message, out of how many', async () => {
      setAI('slow'); await page.click('#waiting-card [data-act=waiting-read]');
      await page.waitForSelector('#waiting-card #reading-live');
      const t = await live();
      if (!/Reading message \d of 5/.test(t)) throw new Error('no "message x of 5": ' + t.slice(0, 120));
      if (!(await page.$('#reading-live progress'))) throw new Error('no progress bar');
      if (!(await page.$('#reading-live [data-act=waiting-stop]'))) throw new Error('no Stop button');
    });

    await step('it keeps changing by itself, so it is clearly not stuck', async () => {
      await page.waitForFunction(() => /Reading message [23] of 5/.test((document.querySelector('#reading-live') || {}).innerText || ''), null, { timeout: 15000 });
      const t = await live();
      if (!/AI helper has answered|Waiting for the AI helper/.test(t)) throw new Error('no sign the AI is answering: ' + t.slice(0, 160));
    });

    await step('it lists what the AI decided about each thing, with the reason', async () => {
      await page.waitForFunction(() => /Kept/.test((document.querySelector('#reading-live .activity') || {}).innerText || ''), null, { timeout: 15000 });
      const t = await page.textContent('#reading-live .activity');
      if (!/Life|about you/.test(t)) throw new Error('no reason shown: ' + t.slice(0, 160));
    });

    await step('Stop: it says so, finishes the message it is on, and the rest stay waiting', async () => {
      await page.click('#reading-live [data-act=waiting-stop]');
      await page.waitForFunction(() => /Stopping|stopped reading/.test(document.body.innerText), null, { timeout: 15000 });
      await page.waitForFunction(() => /You stopped reading/.test((document.querySelector('#waiting-card') || {}).innerText || ''), null, { timeout: 20000 });
      const t = await page.textContent('#waiting-card');
      if (/Reading message/.test(t)) throw new Error('still shows reading');
    });

    await step('"Read now" carries on after a stop and everything is read', async () => {
      setAI('ok');
      if (await page.$('#waiting-card [data-act=waiting-read]')) await page.click('#waiting-card [data-act=waiting-read]');
      await page.waitForFunction(() => !document.querySelector('#waiting-card'), null, { timeout: 25000 });
    });

    await step('a long silence is called out, with what to do', async () => {
      await page.route('**/api/status', async route => {
        const res = await route.fetch(); const j = await res.json();
        j.reading = { ...j.reading, running: true, stuck: true, asking_for: 75, read: 1, total: 4, current: 'a long message', calls: 1, last_answer_ago: 80, events: [], elapsed: 90 };
        j.waiting = Math.max(j.waiting, 3);
        await route.fulfill({ response: res, json: j });
      });
      await page.click('[data-tab=me]'); await page.evaluate(() => refreshStatus());
      await page.waitForFunction(() => /not answered for 1m 15s/.test(document.querySelector('#banners').innerText), null, { timeout: 10000 });
      const t = await page.textContent('#banners');
      if (!/press Stop/.test(t)) throw new Error('no advice: ' + t);
      if (!/message 2 of 4/.test(t)) throw new Error('no position: ' + t);
      await page.unroute('**/api/status');
    });

    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    setAI('ok'); await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
