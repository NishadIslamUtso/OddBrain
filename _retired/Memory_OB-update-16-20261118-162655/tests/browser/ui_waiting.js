// What the owner sees while the AI helper is not answering: nothing vanishes, and it can be read later.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.MO_BASE, MODE = process.env.MO_AI_MODE_FILE;
const setAI = m => fs.writeFileSync(MODE, m);
(async () => {
  const browser = await chromium.launch(); let failed = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(9000); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console ' + m.text()); });
    const step = async (name, fn) => { try { await fn(); console.log(`OK   [${scheme}] ${name}`); } catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); console.log(`FAIL [${scheme}] ${name} :: ${e.message.split('\n')[0]}`); } };
    const toast = async re => { await page.waitForFunction(src => Array.from(document.querySelectorAll('.toast')).some(e => new RegExp(src).test(e.textContent)), re.source); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
    const word = scheme === 'light' ? 'tea' : 'coffee';
    await page.goto(BASE + '/ui'); await page.waitForSelector('#tell');

    await step('the AI stops answering: what I type is kept, and I am told so', async () => {
      setAI('down');
      await page.fill('#tell', `I drink ${word} every single morning.`); await page.click('[data-act=tell]');
      await page.waitForFunction(() => /kept this safe/.test(document.querySelector('#tell-msg').textContent));
      const t = await page.textContent('#tell-msg'); if (!/Waiting to be read/.test(t)) throw new Error('does not say where it is: ' + t);
    });
    await step('Review shows it under "Waiting to be read", in my own words, with why', async () => {
      await page.waitForSelector('#waiting-card');
      const t = await page.textContent('#waiting-card');
      if (!new RegExp(`I drink ${word} every single morning`).test(t)) throw new Error('message not shown: ' + t.slice(0, 120));
      if (!/did not answer|cannot reach/.test(t)) throw new Error('no reason given');
    });
    await step('the banner does not repeat what the card says on Review', async () => {
      if (await page.$('#banners .banner')) throw new Error('banner shown on Review');
    });
    await step('on another screen the banner is there, with Read now', async () => {
      await page.click('[data-tab=me]'); await page.waitForSelector('#banners .banner');
      const t = await page.textContent('#banners'); if (!/waiting/.test(t)) throw new Error(t);
      await page.click('[data-tab=review]'); await page.waitForSelector('#waiting-card');
    });
    await step('Read now while it is still down: told so, nothing lost', async () => {
      await page.click('#waiting-card [data-act=waiting-read]');
      await page.waitForTimeout(1500);
      await page.waitForSelector('#waiting-card'); const t = await page.textContent('#waiting-card');
      if (!new RegExp(`I drink ${word}`).test(t)) throw new Error('message gone');
    });
    await step('the AI comes back: Read now reads it and the card goes away', async () => {
      setAI('ok');
      await page.click('#waiting-card [data-act=waiting-read]');
      await page.waitForFunction(() => !document.querySelector('#waiting-card'), null, { timeout: 15000 });
      await page.waitForFunction(w => document.querySelector('#rv-body').textContent.includes(`I drink ${w}`), word);
    });
    await step('a message I do not want read can be skipped (and it asks first)', async () => {
      setAI('down');
      await page.fill('#tell', 'Skip me please, this is only a test line.'); await page.click('[data-act=tell]');
      await page.waitForSelector('#waiting-card');
      await page.click('#waiting-card [data-act=waiting-skip]');
      await page.waitForSelector('.modal'); await page.click('.modal [data-yes]');
      await toast(/Skipped/);
      await page.waitForFunction(() => !document.querySelector('#waiting-card'));
    });
    await step('Check now does not claim an AI second look it did not get', async () => {
      await page.click('[data-tab=review]'); await page.waitForSelector('[data-act=audit-run]');
      setAI('down');
      const [resp] = await Promise.all([page.waitForResponse(r => /\/api\/audit\/run$/.test(r.url())), page.click('[data-act=audit-run]')]);
      const report = await resp.json();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.toast')).some(e => /^Done\./.test(e.textContent)));
      const said = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(e => e.textContent).find(t => /^Done\./.test(t)));
      const noAi = report.ai && report.ai.used === false;
      if (noAi && !/second look/.test(said)) throw new Error('claims a clean check without the AI second look: ' + said);
      if (!noAi && /second look/.test(said)) throw new Error('says the AI could not look, but it did: ' + said);
      await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    });
    await step('Settings: "Test the AI helper" says so when it does not answer, and when it does', async () => {
      await page.click('[data-tab=settings]'); await page.waitForSelector('[data-act=test-ai]');
      setAI('down'); await page.click('[data-act=test-ai]');
      await page.waitForFunction(() => /did not answer/.test(document.querySelector('#ai-test-msg').textContent));
      setAI('ok'); await page.click('[data-act=test-ai]');
      await page.waitForFunction(() => /It answered/.test(document.querySelector('#ai-test-msg').textContent));
    });
    console.log(`[${scheme}] errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e)); failed += errs.length;
    setAI('ok'); await ctx.close();
  }
  await browser.close(); process.exit(failed ? 1 : 0);
})();
