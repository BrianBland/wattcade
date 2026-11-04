import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const cdp = await page.context().newCDPSession(page);
const capture = async path => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(data, 'base64')); };
const errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.REVIEW_URL ?? 'http://127.0.0.1:5212';
const out = 'docs/visual-polish/hamster';
try {
  for (const [name, era] of [['startup', 2], ['utility', 3]]) {
    await page.goto(`${base}/dev/hud-live.html?game=hamster&manual=1&fake=0&shop=1&menu=1`);
    await page.waitForFunction(() => window.__hudLive?.ready);
    await page.evaluate(async era => {
      const { createGameSession, testProfile, NullInput } = await import('/src/core/index.ts');
      const { module: game } = await import('/src/games/hamster/index.ts');
      const gens = Array.from({ length: (era + 1) * 3 }, (_, i) => i < 3 ? 20 : 3);
      const session = createGameSession({ game, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3, simOpts: { preset: { gens, bank: era === 2 ? 1e12 : 1e16 } } });
      session.step(450); session.sim.receive({ type: 'row', i: era * 3 }); session.step(1);
      const r = window.__hudLive.renderer();
      // HUD resize observers repaint with the harness's starter simulation. Keep all
      // asynchronous paints on this fixture so captures cannot mix two eras.
      const render = r.render.bind(r);
      r.render = (snapshot, bike, input) => render(snapshot.era === era ? snapshot : session.sim.snapshot(), snapshot.era === era ? bike : session.ctx.bike(), input);
      r.prevEra = -1; r.lastOwned = -1; r.lastBuy = -1; r.lastToast = 100000; r.parts = [];
      window.__machinery = { session, r };
      for (let n = 0; n < 45; n++) { r.last = performance.now() / 1000 - .016; r.render(session.sim.snapshot(), session.ctx.bike(), {}); }
    }, era);
    console.log(`${name}: rendered`);
    await capture(`${out}/${name}-ipad.png`);
    // Exercise a real purchase, including the renderer's workforce-change detection.
    const result = await page.evaluate(async () => {
      const { session, r } = window.__machinery, before = session.sim.snapshot();
      session.sim.receive({ type: 'row', i: before.row }); session.step(1);
      const after = session.sim.snapshot();
      r.render(after, session.ctx.bike(), {});
      for (let n = 0; n < 30; n++) { r.last = performance.now() / 1000 - .016; r.render(after, session.ctx.bike(), {}); }
      return { grew: after.totalOwned > before.totalOwned, deliveryActive: r.time - r.deliveredAt < 2.5 };
    });
    assert(result.grew); assert(result.deliveryActive);
    await capture(`${out}/${name}-delivery.png`);
    // Coasting stops the wheel clock and all machinery driven by it.
    const idle = await page.evaluate(() => {
      const { session, r } = window.__machinery, before = r.spin;
      const snapshot = { ...session.sim.snapshot(), unionOn: false };
      r.render(snapshot, { ...session.ctx.bike(), cadence3s: 0 }, {});
      return r.spin === before;
    });
    assert(idle);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { const { session, r } = window.__machinery; r.resize(390, 844); r.render(session.sim.snapshot(), session.ctx.bike(), {}); });
    await capture(`${out}/${name}-phone.png`);
    await page.evaluate(() => window.__machinery.session.sim.dispose?.());
    await page.setViewportSize({ width: 1024, height: 768 });
  }
  assert.deepEqual(errors, []); console.log('Startup/Utility renders, real purchase reactions and stopped wheel clock passed.');
} finally { await browser.close(); }
