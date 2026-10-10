import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.SQUADRON_BASE ?? 'http://127.0.0.1:5199';
const output = '/tmp/squadron-smoke'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, width, height, query] of [['landscape', 1180, 820, 'sec=155'], ['portrait', 820, 1180, 'sec=375&craft=escort'], ['menu', 390, 844, 'menu=1&unlocked=1']]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/dev/squadron.html?manual=1&inset=150&${query}`); await page.waitForFunction(() => window.__squadron);
    if(name !== 'menu') {
      // Catch the volley travelling rather than a random empty combat frame.
      await page.evaluate(() => {for(let i=0;i<300;i++){const s=window.__squadron.snapshot();if(s.lasers.some(l=>s.t-l.at>0.38 && s.t-l.at<0.52 && l.sy-l.y>35))break;window.__squadron.advance(1/30,false);}window.__squadron.advance(0);});
      const selected = await page.evaluate(() => window.__squadron.snapshot().selectedId);
      await page.getByRole('button',{name:'Next target'}).click();await page.evaluate(()=>window.__squadron.advance(1/30));
      assert.notEqual(await page.evaluate(()=>window.__squadron.snapshot().selectedId),selected);
      assert.equal(await page.getByRole('button',{name:'Previous target'}).isEnabled(),true);
    }
    await page.screenshot({ path: `${output}/${name}.png` });
    if (name === 'menu') {
      await page.getByRole('button', { name: /Resonance Escort/ }).click(); await page.evaluate(() => window.__squadron.advance(1 / 30));
      assert.equal(await page.evaluate(() => window.__squadron.snapshot().craft), 'escort');
      await page.getByRole('button', { name: 'Launch squadron' }).click(); await page.evaluate(() => window.__squadron.advance(180));
      assert.equal(await page.evaluate(() => window.__squadron.snapshot().phase), 'run');
      await page.getByRole('button', { name: 'Nova · take a breather' }).click(); await page.evaluate(() => window.__squadron.advance(1 / 30));
      assert.ok(await page.evaluate(() => window.__squadron.snapshot().coverLeft > 19));
    }
    const before = await page.evaluate(() => window.__squadron.resources());
    for (let i = 0; i < 40; i++) await page.evaluate(() => window.__squadron.advance(3));
    const after = await page.evaluate(() => window.__squadron.resources());
    assert.ok(after.geometries <= before.geometries + 16 && after.geometries <= 80, JSON.stringify({ before, after }));
    assert.ok(after.programs <= before.programs + 2, JSON.stringify({ before, after }));
    // Static enemy templates can warm up once; repeated spawning must remain bounded.
    for(let i=0;i<40;i++) await page.evaluate(()=>window.__squadron.advance(3));
    const later=await page.evaluate(()=>window.__squadron.resources());
    assert.ok(later.geometries<=after.geometries+12 && later.geometries<=80,JSON.stringify({after,later}));
    assert.ok(later.programs<=after.programs+2,JSON.stringify({after,later}));
    assert.deepEqual(errors, []); await page.evaluate(() => window.__squadron.dispose());
    assert.equal(await page.locator('canvas').count(), 0);
    console.log(`${name}: controls, bounded resources, clean console (${JSON.stringify(after)})`); await page.close();
  }
} finally { await browser.close(); }
console.log(`Screenshots: ${output}`);
