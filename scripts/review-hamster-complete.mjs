import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = 'docs/visual-polish/hamster/complete'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const cdp = await page.context().newCDPSession(page);
const capture = async name => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64')); };
async function paint() { await page.evaluate(() => { const { r } = window.__complete; for (let i = 0; i < 30; i++) { r.last = performance.now() / 1000 - .016; r.render(); } }); }
try {
  await page.goto(`${process.env.REVIEW_URL ?? 'http://127.0.0.1:5212'}/dev/hud-live.html?game=hamster&manual=1&fake=0&shop=1&menu=1`);
  await page.waitForFunction(() => window.__hudLive?.ready);
  const names = ['shoebox', 'garage', 'startup', 'utility', 'megaproject', 'planet', 'star', 'galaxy'];
  for (let era = 0; era < 8; era++) {
    await page.evaluate(async era => {
      const { createGameSession, testProfile, NullInput } = await import('/src/core/index.ts');
      const { module: game } = await import('/src/games/hamster/index.ts');
      const r = window.__hudLive.renderer();
      window.__baseRender ??= r.render.bind(r); window.__complete?.session.sim.dispose?.();
      const gens = Array.from({ length: (era + 1) * 3 }, (_, i) => i < 3 ? 12 : 3);
      const profile = testProfile({ gameData: { hamster: { v: 1, gens, bank: 10 ** (5 + era * 4), life: 1e32, maxEra: era, unlocks: ['upgrades', 'market', 'vibes', 'rebirth'] } } });
      const session = createGameSession({ game, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 3 });
      session.step(450); session.sim.receive({ type: 'row', i: era * 3 }); session.step(1);
      window.__complete = { session, r, patch: {} };
      r.render = () => { const { session, patch } = window.__complete; window.__baseRender({ ...session.sim.snapshot(), toasts: [], ...patch }, session.ctx.bike(), {}); };
      Object.assign(r, { prevEra: -1, lastOwned: -1, lastBuy: -1, lastToast: 1e9, parts: [], scroll: 0, manualScroll: false, trans: null, eraBanner: null, deliveredAt: -Infinity });
    }, era);
    await paint();
    assert.equal(await page.evaluate(() => window.__complete.session.sim.snapshot().era), era);
    await capture(names[era]); console.log(`Captured ${names[era]}`);
  }
  for (const tab of ['market', 'vibes', 'rebirth']) {
    await page.evaluate(tab => { const { session } = window.__complete; session.sim.receive({ type: 'tab', i: session.sim.snapshot().tabs.findIndex(t => t.id === tab) }); session.step(1); }, tab);
    await paint(); await capture(tab);
    if (tab === 'rebirth') {
      const r = await page.evaluate(() => window.__complete.r.rowRects[0]); assert(r.h >= 190);
    }
  }
  // Verify actual row bounds, tab interaction, and a large explicit trial button.
  await page.evaluate(() => { const { session } = window.__complete; session.sim.receive({ type: 'tab', i: 0 }); session.step(1); window.__complete.patch = { trial: { phase: 'offer', left: 25, compliance: 0, duration: 180, ftpFraction: .8 } }; });
  await paint(); await capture('trial-ipad');
  const accept = await page.evaluate(() => window.__complete.r.acceptRect); assert(accept.w >= 44 && accept.h >= 44);
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.__complete.r.resize(390, 844)); await paint(); await capture('trial-phone');
  const button = await page.evaluate(() => window.__complete.r.acceptRect); assert(button.x >= 0 && button.x + button.w <= 390);
  await page.evaluate(() => { window.__complete.patch = {}; const { session } = window.__complete; session.sim.receive({ type: 'tab', i: session.sim.snapshot().tabs.findIndex(t => t.id === 'market') }); session.step(1); });
  await paint();
  const first = await page.evaluate(() => { const r = window.__complete.r; return { scroll: r.scroll, row: r.rowRects[0], list: r.listRect }; });
  assert.equal(first.scroll, 0, 'first market item must remain at the top on a short screen');
  assert(first.row.y >= first.list.y && first.row.h >= 124, 'first market item must be fully visible');
  await capture('market-phone');
  assert.deepEqual(errors, []); console.log('All eight eras, market/vibes/rebirth, trial sizing and narrow layouts passed.');
} finally { await browser.close(); }
