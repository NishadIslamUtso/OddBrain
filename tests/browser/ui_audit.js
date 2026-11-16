const { chromium } = require('playwright');
const BASE = process.env.MO_BASE || 'http://127.0.0.1:8791';
const AUDIT = () => {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lin = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (c, b) => [c[0] * c[3] + b[0] * (1 - c[3]), c[1] * c[3] + b[1] * (1 - c[3]), c[2] * c[3] + b[2] * (1 - c[3]), 1];
  function bgOf(el) {
    const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base;
  }
  const bad = []; const seen = new Set(); let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'TITLE'].includes(el.tagName.toUpperCase())) continue;
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!own) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    let fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el); fg = over(fg, bg);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5; const rt = ratio(fg, bg); checked++;
    if (rt < need) { const key = el.tagName + '|' + own.slice(0, 30); if (!seen.has(key)) { seen.add(key); bad.push({ tag: el.tagName, cls: el.className && el.className.baseVal === undefined ? el.className : '', text: own.slice(0, 40), ratio: +rt.toFixed(2), fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round)})` }); } }
  }
  // any element that paints with a see-through background and is a surface?
  const clear = []; for (const sel of ['html', 'body', '.card', '.topbar', '.drawer', '.modal', '.banner']) { const el = document.querySelector(sel); if (!el) continue; const c = parse(getComputedStyle(el).backgroundColor); if (!c || c[3] < 1) clear.push(sel + ' ' + (c ? c[3] : 'none')); }
  return { checked, bad, clear };
};

(async () => {
  const browser = await chromium.launch();
  const errors = []; let failures = 0;
  const hostThemes = {
    plain: null,
    weird: ':root{--bg: rgba(0,0,0,0.08); --bg-2: transparent; --bg-3: rgba(255,255,255,0.05); --text: #7a7a7a; --text-2: #8a8a8a; --text-3: #999; --accent: #ffee00; --stroke: rgba(0,0,0,0.04)}',
    darkhostLightOS: ':root{--bg:#101014; --bg-2:#181820; --bg-3:#202029; --text:#e8e8ee; --text-2:#b8b8c4; --text-3:#8d8d9c; --accent:#6b8cff}',
  };
  for (const scheme of ['light', 'dark']) {
    for (const [hname, css] of Object.entries(hostThemes)) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(`[${scheme}/${hname}] pageerror: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`[${scheme}/${hname}] console: ${m.text()}`); });
      if (css) await page.route('**/ui', async route => { const res = await route.fetch(); let body = await res.text(); body = body.replace('</head>', `<style>${css}</style></head>`); await route.fulfill({ response: res, body }); });
      await page.goto(BASE + '/ui'); await page.waitForSelector('#rv-body .card, #rv-body section');
      const theme = await page.evaluate(() => window.__memoryObTheme);
      const rr = theme.ratios;
      const themeProblems = Object.entries({ text: 7, text2: 5.5, text3: 4.5, accentText: 4.5, onAccent: 4.5, danger: 4.5, ok: 4.5, warn: 4.5, stroke: 1.3, accentOnBg: 3 }).filter(([k, min]) => rr[k] < min - 0.01);
      console.log(`${scheme}/${hname}: mode=${theme.mode} bg=${theme.tokens.bg} text=${theme.tokens.text} ratios text ${rr.text.toFixed(1)} t2 ${rr.text2.toFixed(1)} t3 ${rr.text3.toFixed(1)} acc ${rr.accentText.toFixed(1)} onAcc ${rr.onAccent.toFixed(1)}${themeProblems.length ? ' PROBLEMS ' + JSON.stringify(themeProblems) : ''}`);
      if (themeProblems.length) failures++;
      for (const tab of ['review', 'vault', 'people', 'journal', 'me', 'settings']) {
        await page.click(`[data-tab=${tab}]`); await page.waitForTimeout(500);
        if (tab === 'people') { const first = await page.$('.person-row'); if (first) { await first.click(); await page.waitForTimeout(400); } }
        const a = await page.evaluate(AUDIT);
        if (a.bad.length || a.clear.length) { failures++; console.log(`  ${tab}: ${a.bad.length} low-contrast, clear=${JSON.stringify(a.clear)}`, JSON.stringify(a.bad.slice(0, 6))); }
        if (hname === 'plain' || hname === 'weird') await page.screenshot({ path: `${process.env.MO_SHOTS || 'shots'}/${scheme}-${hname}-${tab}.png`, fullPage: false });
      }
      // graph + opened note + open filters
      await page.click('[data-tab=vault]'); await page.waitForTimeout(400);
      await page.click('[data-act=v-view][data-view=graph]'); await page.waitForFunction(() => window.__graphDebug && window.__graphDebug.nodes.length > 0, null, { timeout: 5000 }).catch(() => errors.push(`[${scheme}/${hname}] graph did not draw`));
      await page.waitForTimeout(400);
      const ga = await page.evaluate(AUDIT); if (ga.bad.length) { failures++; console.log('  graph low-contrast', JSON.stringify(ga.bad.slice(0, 5))); }
      if (hname === 'plain') await page.screenshot({ path: `${process.env.MO_SHOTS || 'shots'}/${scheme}-graph.png` });
      await page.click('[data-act=v-view][data-view=note]'); await page.waitForTimeout(300);
      await page.click('#v-tree .vx-row.file'); await page.waitForSelector('.vx-article h2'); await page.waitForTimeout(200);
      await page.click('details.vx-filters summary'); await page.waitForTimeout(150);
      const da = await page.evaluate(AUDIT); if (da.bad.length || da.clear.length) { failures++; console.log('  note', JSON.stringify(da)); }
      if (hname === 'plain') await page.screenshot({ path: `${process.env.MO_SHOTS || 'shots'}/${scheme}-note.png` });
      await ctx.close();
    }
  }
  await browser.close();
  console.log('\nconsole/page errors:', errors.length); errors.slice(0, 20).forEach(e => console.log('  ' + e));
  console.log('failures:', failures);
  process.exit(failures || errors.length ? 1 : 0);
})();
