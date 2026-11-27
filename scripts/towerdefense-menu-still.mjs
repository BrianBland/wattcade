// The battlefield must not move when the build menu opens or closes (the shell HUD changes shape under it).
// `npm run dev -- --port 5203`, then `node scripts/towerdefense-menu-still.mjs`.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5203';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
try {
  for (const [name, width, height] of [['landscape', 1180, 820], ['portrait', 820, 1180], ['phone', 390, 844], ['short', 844, 390]]) for (const legend of [1, 0]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await page.goto(`${base}/dev/towerdefense.html?manual=1&crew=0&sec=1&legend=${legend}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    const advance = s => page.evaluate(s => window.__td.advance(s), s);
    const settle = async () => { await page.waitForTimeout(300); await advance(1 / 30); }; // HUD reads the sim at 10 Hz
    const field = () => page.evaluate(() => window.__td.drawnField());
    await advance(2); await settle();
    const play = await field();
    await page.keyboard.press('l'); await advance(1 / 30); await settle();
    assert.ok((await page.evaluate(() => window.__td.snapshot().workshop)), `${name}: the build menu opened`);
    assert.deepEqual(await field(), play, `${name} ${legend ? 'controller' : 'touch'}: field still with the menu open`);
    await page.evaluate(() => window.__td.send({ type: 'close' })); await advance(1 / 30); await settle(); await page.waitForTimeout(500); await advance(1 / 30);
    assert.equal(await page.evaluate(() => window.__td.snapshot().workshop), null);
    assert.deepEqual(await field(), play, `${name} ${legend ? 'controller' : 'touch'}: field still after the menu closes`);
    console.log(`${name} ${legend ? 'controller' : 'touch'}: field still`);
    await page.close();
  }
} finally { await browser.close(); }
