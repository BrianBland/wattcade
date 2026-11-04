import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? 'docs/visual-polish/hamster';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.REVIEW_URL ?? 'http://127.0.0.1:5212';
async function open(params = '') {
  await page.goto(`${base}/dev/hud-live.html?game=hamster&manual=1&fake=0&shop=1&menu=1${params}`);
  await page.waitForFunction(() => window.__hudLive?.ready);
  await page.evaluate(() => window.__hudLive.advance(10));
  // Let renderer interpolation settle without advancing the economy.
  for (let i = 0; i < 100; i++) { await page.waitForTimeout(20); await page.evaluate(() => window.__hudLive.advance(0)); }
}
try {
  await open();
  await page.screenshot({ path: `${out}/shoebox-ipad.png` });
  await page.mouse.click(875, 80); await page.evaluate(() => window.__hudLive.advance(.1));
  assert.equal(await page.evaluate(() => window.__hudLive.snapshot().tab), 'market');
  await page.screenshot({ path: `${out}/market-ipad.png` });
  // Render-only fixtures inspect era artwork and trial layout, not progression/balance.
  await page.evaluate(async () => {
    const api = window.__hudLive, r = api.renderer();
    const { createGameSession, testProfile, NullInput } = await import('/src/core/index.ts');
    const { module: game } = await import('/src/games/hamster/index.ts');
    const session = createGameSession({ game, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3, simOpts: { preset: { gens: [20, 5, 1, 5, 2, 1], bank: 1e8 } } });
    session.step(450); session.sim.receive({ type: 'tab', i: 2 }); session.step(1);
    r.prevEra = -1; r.scroll = 0; r.parts = []; r.render(session.sim.snapshot(), session.ctx.bike(), {});
    session.sim.dispose?.();
  });
  await page.screenshot({ path: `${out}/garage-market-ipad.png` });
  await open();
  await page.evaluate(() => {
    const api = window.__hudLive, r = api.renderer();
    r.render({ ...api.snapshot(), trial: { phase: 'offer', left: 25, compliance: 0, duration: 180, ftpFraction: .8 } }, { cadence3s: 90 }, {});
  });
  const accept = await page.evaluate(() => window.__hudLive.renderer().acceptRect);
  assert.equal(accept.w, 104); assert.equal(accept.h, 44);
  await page.screenshot({ path: `${out}/trial-ipad.png` });
  await open();
  const latest = await page.evaluate(() => window.__hudLive.renderer().latestRect);
  assert(latest);
  await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.__hudLive.advance(.1)); await page.keyboard.up('ArrowUp');
  const before = await page.evaluate(() => window.__hudLive.snapshot().buySeq);
  await page.mouse.click(latest.x + 40, latest.y + 12); await page.evaluate(() => window.__hudLive.advance(.1));
  assert.equal(await page.evaluate(() => window.__hudLive.snapshot().buySeq), before, 'navigation must not buy');
  assert.equal(await page.evaluate(() => { const s = window.__hudLive.snapshot(); return s.row === s.items.filter(i => !i.locked).length - 1; }), true);
  await page.setViewportSize({ width: 390, height: 844 }); await open('&legend=0');
  await page.screenshot({ path: `${out}/phone.png` });
  await page.evaluate(() => { const a = window.__hudLive.renderer().tabRects[2]; window.__marketTab = a; });
  const tab = await page.evaluate(() => window.__marketTab);
  await page.mouse.click(tab.x + tab.w / 2, tab.y + 20); await page.evaluate(() => window.__hudLive.advance(.1));
  await page.screenshot({ path: `${out}/market-phone.png` });
  assert.deepEqual(errors, []); console.log('Hamster visual captures, market navigation and latest-unlock checks passed.');
} finally { await browser.close(); }
