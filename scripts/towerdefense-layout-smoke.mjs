// Real HUD geometry, including legend changes which keep --hud-h unchanged.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = '/tmp/towerdefense-layout';
await mkdir(output, { recursive: true });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5205';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const [name, width, height] of [['landscape', 1180, 820], ['portrait', 820, 1180], ['pro-landscape', 1366, 1024], ['pro-portrait', 1024, 1366], ['phone', 390, 844], ['short', 844, 390]]) {
    if (process.argv[2] && process.argv[2] !== name) continue;
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/dev/towerdefense.html?manual=1&crew=0&sec=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    for (const legend of [true, false, true]) {
      await page.evaluate(on => window.__td.legend(on), legend);
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(async () => {
        const { layout, fieldClearsHud } = await import('/src/games/towerdefense/render/layout.ts');
        const { readHudInsets } = await import('/src/shell/hud/insets.ts');
        const { toWorld } = await import('/src/games/towerdefense/render/fieldView.ts');
        const L = window.__td.ui().layout, inset = readHudInsets(document.getElementById('field'), document.getElementById('probe'));
        const fallback = layout(innerWidth, innerHeight, inset.bottom, true);
        return { clear: fieldClearsHud(L.field, inset.occlusions), scale: L.field.k, oldScale: fallback.field.k,
          reserved: inset.bottom, covered: innerHeight - L.UH, base: toWorld(L.field, window.__td.ui().base),
          uiClear: [L.status, L.current, L.workshop, L.brood, L.garage].every(b => inset.occlusions.every(h =>
            b.x + b.w <= h.x || h.x + h.w <= b.x || b.y + b.h <= h.y || h.y + h.h <= b.y)),
          panels: [...document.querySelectorAll('.td-status, .td-current')].map(el => ({
            contained: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1,
            scrollable: getComputedStyle(el).overflowY === 'auto',
          })),
          controls: [...document.querySelectorAll('.hud button')].map(b => { const r = b.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; }) };
      });
      assert.ok(geometry.clear, `${name} combat sprites clear HUD`);
      assert.ok(geometry.uiClear, `${name} menus clear HUD`);
      for (const panel of geometry.panels) assert.ok(panel.contained || panel.scrollable, 'status copy stays contained or reachable by scrolling');
      assert.ok(geometry.scale >= geometry.oldScale - .001, `${name} never shrinks the field`);
      assert.ok(Math.abs(geometry.base.x - 40) < .001 && Math.abs(geometry.base.y - 101) < .001, 'tap transform uses rendered field');
      for (const c of geometry.controls) assert.ok(c.x >= -.5 && c.y >= -.5 && c.x+c.w <= width+.5 && c.y+c.h <= height+.5, 'HUD button contained');
      await page.screenshot({ path: `${output}/${name}-${legend ? 'controller' : 'touch'}.png` });
      console.log(`${name} ${legend ? 'controller' : 'touch'}: ${JSON.stringify({ scale:geometry.scale, oldScale:geometry.oldScale, reserved:geometry.reserved, covered:geometry.covered })}`);
    }
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.__td.dispose()); await page.close();
  }
} finally { await browser.close(); }
