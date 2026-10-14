import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = '/tmp/towerdefense-smoke'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5199';
try {
  for (const [name, width, height] of [['landscape', 1180, 820], ['portrait', 820, 1180], ['phone', 390, 844], ['short', 844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/dev/towerdefense.html?manual=1&inset=140&crew=0&sec=1`);
    await page.waitForFunction(() => window.__td);
    const advance = seconds => page.evaluate(s => window.__td.advance(s), seconds);
    const snapshot = () => page.evaluate(() => window.__td.snapshot());
    const clickBox = async b => { await page.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2); await advance(1 / 30); };
    const ui = () => page.evaluate(() => window.__td.ui());
    await page.screenshot({ path: `${output}/${name}-lull.png` });
    // A touch accepts the suggestion. No synthesized click may buy a second tower or open a menu.
    await clickBox((await ui()).layout.dock.construct);
    let s = await snapshot(); assert.equal(s.towers.length, 1); assert.equal(s.workshop, null);
    const pad = s.towers[0].pad;
    await advance(120);
    // Tap a world tower, then confirm the upgrade on the controller.
    const world = (await ui()).pads.find(p => p.id === pad);
    await page.touchscreen.tap(world.x, world.y); await advance(1 / 30);
    s = await snapshot(); assert.equal(s.workshop.pad, pad);
    await page.screenshot({ path: `${output}/${name}-workshop.png` });
    await page.keyboard.press('l'); await advance(1 / 30);
    s = await snapshot(); assert.equal(s.towers.find(t => t.pad === pad).level, 2);
    await page.keyboard.press('k'); await advance(1 / 30); assert.equal((await snapshot()).workshop, null);
    assert.equal((await snapshot()).actions.find(a => a.id === 'overcharge').activeS, 0);
    // Controller opens construction; touch toggles crew and sells the selected tower.
    await page.keyboard.press('ArrowDown'); await advance(1 / 30);
    let ws = (await snapshot()).workshop;
    let menu = (await ui()).menu;
    await clickBox(menu.options[ws.rows.findIndex(r => r.kind === 'crew')]);
    assert.equal((await snapshot()).autoCrew, true);
    await page.evaluate(pad => window.__td.send({ type: 'pad', pad }), pad); await advance(1 / 30);
    // Selecting the same pad closes; reopen if needed.
    if (!(await snapshot()).workshop) { await page.evaluate(pad => window.__td.send({ type: 'pad', pad }), pad); await advance(1 / 30); }
    ws = (await snapshot()).workshop; menu = (await ui()).menu;
    await clickBox(menu.options[ws.rows.findIndex(r => r.kind === 'sell')]);
    assert.equal((await snapshot()).towers.length, 0);
    await clickBox((await ui()).menu.close);
    assert.equal((await snapshot()).workshop, null);
    // Repair is reachable by tapping the base.
    const L = (await ui()).layout;
    await page.touchscreen.tap(L.field.x + 0.5 * L.field.s, L.field.y + 0.9 * L.field.s); await advance(1 / 30);
    assert.equal((await snapshot()).workshop.rows[0].kind, 'repair');
    await clickBox((await ui()).menu.close);
    assert.deepEqual(errors, []); await page.evaluate(() => window.__td.dispose());
    assert.equal(await page.locator('canvas').count(), 0);
    console.log(`${name}: suggestion tap, mixed upgrade, crew toggle, sell, base repair, clean console`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  await page.goto(`${base}/dev/towerdefense.html?manual=1&inset=140&sec=120&script=intervals&seed=3`);
  await page.waitForFunction(() => window.__td);
  const recharge = async () => {
    for (let i = 0; i < 60 && await page.evaluate(() => window.__td.snapshot().railCharges < 3); i++) await page.evaluate(() => window.__td.advance(10));
    assert.equal(await page.evaluate(() => window.__td.snapshot().railCharges), 3);
  };
  await recharge();
  for (let i = 0; i < 60 && await page.evaluate(() => !window.__td.snapshot().actions.slice(0, 2).every(a => a.usable)); i++) await page.evaluate(() => window.__td.advance(1));
  const combat = await page.evaluate(() => window.__td.ui().layout.dock.actions);
  await page.touchscreen.tap(combat[0].x + combat[0].w / 2, combat[0].y + combat[0].h / 2); await page.evaluate(() => window.__td.advance(1 / 30));
  assert.ok(await page.evaluate(() => window.__td.snapshot().actions[0].activeS > 0));
  await page.touchscreen.tap(combat[1].x + combat[1].w / 2, combat[1].y + combat[1].h / 2); await page.evaluate(() => window.__td.advance(1 / 30));
  assert.ok(await page.evaluate(() => window.__td.snapshot().actions[1].activeS > 0));
  await page.screenshot({ path: `${output}/combat-actions.png` });
  const b = await page.evaluate(() => window.__td.ui().layout.dock.actions[2]);
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down();
  await page.evaluate(() => window.__td.advance(0.6)); await page.mouse.up(); await page.evaluate(() => window.__td.advance(1 / 30));
  assert.equal(await page.evaluate(() => window.__td.snapshot().railCharges), 0);
  await recharge();
  await page.mouse.down(); await page.evaluate(() => window.__td.advance(0.1));
  await page.mouse.move(20, 20); await page.mouse.up(); await page.evaluate(() => window.__td.advance(1 / 30));
  assert.equal(await page.evaluate(() => window.__td.snapshot().railCharges), 3);
  console.log('Rail: captured hold dumps all; dragging away cancels without a follow-up shot');
  await page.evaluate(() => window.__td.dispose()); await page.close();
} finally { await browser.close(); }
