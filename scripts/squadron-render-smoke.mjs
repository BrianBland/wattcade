import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.SQUADRON_BASE ?? 'http://127.0.0.1:5199';
const output = '/tmp/squadron-smoke'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, width, height, query] of [['landscape', 1180, 820, 'sec=270'], ['portrait', 820, 1180, 'sec=375&craft=escort'], ['menu', 390, 844, 'menu=1&unlocked=1']]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/dev/squadron.html?manual=1&inset=150&${query}`); await page.waitForFunction(() => window.__squadron);
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
    assert.ok(after.geometries <= before.geometries + 2, JSON.stringify({ before, after }));
    assert.ok(after.programs <= before.programs + 2, JSON.stringify({ before, after }));
    assert.deepEqual(errors, []); await page.evaluate(() => window.__squadron.dispose());
    assert.equal(await page.locator('canvas').count(), 0);
    console.log(`${name}: controls, bounded resources, clean console (${JSON.stringify(after)})`); await page.close();
  }
} finally { await browser.close(); }
console.log(`Screenshots: ${output}`);
