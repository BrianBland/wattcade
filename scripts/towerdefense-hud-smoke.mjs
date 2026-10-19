import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = '/tmp/towerdefense-hud'; await mkdir(output, { recursive: true });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5203';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  if (!process.argv.includes('--boss-only')) {
  for (const [name, width, height] of [['landscape', 1180, 820], ['portrait', 820, 1180], ['phone', 390, 844], ['short', 844, 390]]) {
    for (const legend of [1, 0]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true }), errors = [], badAssets = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.url().includes('/td/aliens/') && r.status() !== 200) badAssets.push(r.url()); });
      await page.goto(`${base}/dev/towerdefense.html?manual=1&crew=0&sec=1&legend=${legend}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
      await page.waitForSelector('.hud');
      const advance = seconds => page.evaluate(s => window.__td.advance(s), seconds);
      const snapshot = () => page.evaluate(() => window.__td.snapshot());
      const key = id => page.locator(`.hud [data-control="${id}"]`);
      const tap = async id => { await key(id).tap(); await advance(1 / 30); };
      const settle = () => page.waitForTimeout(180); // HUD reads the sim at 10 Hz.
      const containment = async () => {
        const boxes = await page.evaluate(async () => {
          const { fieldRect } = await import('/src/games/towerdefense/render/fieldView.ts');
          const hud = document.querySelector('.hud').getBoundingClientRect(), L = window.__td.ui().layout;
          const field = fieldRect(L.field);
          return { top: hud.top, fieldBottom: field.y + field.h, W: innerWidth, H: innerHeight,
            controls: [...document.querySelectorAll('.hud button')].map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, block: b.classList.contains('block') }; }) };
        });
        assert.ok(boxes.fieldBottom <= boxes.top + .5, 'field stays above the HUD');
        for (const b of boxes.controls) {
          assert.ok(b.x >= -.5 && b.x + b.w <= boxes.W + .5 && b.y >= boxes.top - .5 && b.y + b.h <= boxes.H + .5, 'control contained in HUD');
          if (b.block) assert.ok(b.h >= 44 && b.w >= 44, 'touch blocks remain reachable');
        }
      };
      assert.equal(await page.locator('.hud-actions').count(), legend ? 0 : 2);
      assert.equal(await page.locator('.hood').count(), legend ? 2 : 0);
      await settle(); await containment();
      await tap('a'); assert.equal((await snapshot()).towers.length, 1); assert.equal((await snapshot()).workshop, null);
      const pad = (await snapshot()).towers[0].pad; await advance(120);
      const world = await page.evaluate(pad => window.__td.ui().pads.find(p => p.id === pad), pad);
      await page.touchscreen.tap(world.x, world.y); await advance(1 / 30); await settle();
      assert.equal((await snapshot()).workshop.pad, pad);
      await page.screenshot({ path: `${output}/${name}-${legend ? 'controller' : 'touch'}-workshop.png` });
      const quote = (await snapshot()).workshop.rows[0], revision = (await snapshot()).workshop.revision;
      await page.keyboard.press('l'); await advance(1 / 30);
      assert.ok((await snapshot()).workshop.revision > revision, 'keyboard confirm reached the workshop');
      assert.equal((await snapshot()).towers.find(t => t.pad === pad).level, quote.affordable ? 2 : 1, 'purchase respects the current price');
      await tap('b'); assert.equal((await snapshot()).workshop, null); assert.equal((await snapshot()).actions[0].activeS, 0);
      await settle();
      for (let i = 0; i < 50 && !(await snapshot()).enemies.length; i++) await advance(1);
      await tap('b'); await tap('y'); assert.ok((await snapshot()).actions[0].activeS > 0); assert.ok((await snapshot()).actions[1].activeS > 0);
      await settle();
      for (let i = 0; i < 10; i++) await advance(1 / 30); // compose loaded alien frames for screenshots.
      await containment();
      assert.ok(await key('b').locator('.pk-fill').count());
      assert.ok(parseFloat(await key('b').evaluate(b => b.style.getPropertyValue('--fill'))) < 100);
      await page.screenshot({ path: `${output}/${name}-${legend ? 'controller' : 'touch'}.png` });
      const before = await page.evaluate(() => window.__td.ui().layout.field);
      await page.evaluate(on => window.__td.legend(on), !legend); await settle(); await containment();
      const after = await page.evaluate(() => window.__td.ui().layout.field);
      assert.ok(after.k > 0 && before.k > 0, 'both layouts retain a playable field');
      assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
      await page.evaluate(() => window.__td.dispose()); await page.close();
      console.log(`${name} ${legend ? 'controller' : 'touch'}: filled HUD controls, mixed workshop input, menu isolation, containment, layout toggle`);
    }
  }
  const quotePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await quotePage.goto(`${base}/dev/towerdefense.html?manual=1&sec=1&crew=0&script=intervals&seed=3&legend=0`, { waitUntil: 'networkidle' });
  await quotePage.waitForFunction(() => window.__td, null, { timeout: 120000 });
  await quotePage.waitForSelector('.hud');
  const quote = await quotePage.locator('[data-control="a"]').evaluate(b => ({ label: b.textContent,
    height: b.querySelector('span').clientHeight, content: b.querySelector('span').scrollHeight, cost: window.__td.snapshot().suggestion.cost }));
  assert.ok(quote.label.includes(`${quote.cost} scrap`)); assert.ok(quote.content <= quote.height + 1, 'construction quote fits the phone HUD');
  await quotePage.screenshot({ path: `${output}/phone-lull.png` }); await quotePage.close();
  for (const legend of [1, 0]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await page.goto(`${base}/dev/towerdefense.html?manual=1&sec=120&script=intervals&seed=3&legend=${legend}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    await page.waitForSelector('.hud');
    const snapshot = () => page.evaluate(() => window.__td.snapshot());
    const advance = seconds => page.evaluate(s => window.__td.advance(s), seconds);
    const recharge = async () => { for (let i = 0; i < 100 && (await snapshot()).railCharges < 3; i++) await advance(10); assert.equal((await snapshot()).railCharges, 3); await page.waitForTimeout(180); };
    const down = async () => { const b = await page.locator('.hud [data-control="z"]').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); };
    await recharge(); await down(); await advance(.1); await page.mouse.up(); await advance(1 / 30); assert.equal((await snapshot()).railCharges, 2);
    await recharge(); await down(); await advance(.6); await page.mouse.up(); await advance(1 / 30); assert.equal((await snapshot()).railCharges, 0);
    await recharge(); await down(); await advance(.1); await page.mouse.move(20, 20); await page.mouse.up(); await advance(1 / 30); assert.equal((await snapshot()).railCharges, 3);
    await down(); await advance(.1); await page.evaluate(on => window.__td.legend(on), !legend); await page.waitForTimeout(180); await page.mouse.up(); await advance(1 / 30); assert.equal((await snapshot()).railCharges, 3);
    await page.evaluate(() => window.__td.dispose()); await page.close();
    console.log(`Rail ${legend ? 'controller' : 'touch'}: tap one, hold all, drag/switch cancellation`);
  }
  }
  for (const legend of [1, 0]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await page.goto(`${base}/dev/towerdefense.html?manual=1&crew=0&boss=1&seed=1&legend=${legend}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    await page.waitForSelector('.hud');
    await page.evaluate(() => { for (let i = 0; i < 3600 && !window.__td.snapshot().boss?.telegraph; i++) window.__td.advance(1 / 30); });
    await page.waitForTimeout(180);
    assert.equal((await page.evaluate(() => window.__td.snapshot().boss))?.weapon, 'rail', 'fixture reaches the Rail boss window');
    const boost = page.locator('.hud [data-control="up"]'), b = await boost.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.evaluate(() => window.__td.advance(1 / 30));
    assert.equal(await page.evaluate(() => window.__td.snapshot().boss?.sprintBoost), true);
    await page.screenshot({ path: `${output}/boss-${legend ? 'controller' : 'touch'}.png` });
    await page.mouse.up(); await page.evaluate(() => window.__td.advance(1 / 30));
    assert.equal(await page.evaluate(() => window.__td.snapshot().boss?.sprintBoost), false);
    await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.__td.advance(1 / 30));
    assert.equal(await page.evaluate(() => window.__td.snapshot().boss?.sprintBoost), true);
    await page.locator('.hud [data-control="a"]').tap(); await page.evaluate(() => window.__td.advance(1 / 30));
    assert.ok(await page.evaluate(() => window.__td.snapshot().workshop));
    assert.equal(await page.evaluate(() => window.__td.snapshot().boss?.sprintBoost), false);
    await page.keyboard.up('ArrowUp'); await page.evaluate(() => window.__td.dispose()); await page.close();
    console.log(`Boss ${legend ? 'controller' : 'touch'}: touch/Up boost, release, mixed construction cancellation`);
  }
} finally { await browser.close(); }
