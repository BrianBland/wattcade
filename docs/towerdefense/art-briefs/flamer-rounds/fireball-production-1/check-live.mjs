// TOWERDEFENSE_BASE=http://127.0.0.1:5208 node path/to/check-live.mjs
// Checks actual fireball drawing against the production muzzle in both field orientations.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const reportDir = fileURLToPath(new URL('.', import.meta.url));
const output = (process.env.TD_ART_REVIEW_OUT ?? '/tmp/wattcade-td-art/fireball') + '/';
await mkdir(output, { recursive: true });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5208';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const [name, width, height] of [['portrait', 820, 1180], ['landscape', 1180, 820]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/dev/towerdefense.html?manual=1&sec=1&seed=1&legend=0`);
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    const result = await page.evaluate(async () => {
      const { toScreen } = await import('/src/games/towerdefense/render/fieldView.ts');
      for (let tick = 0; tick < 192; tick++) {
        const s = window.__td.snapshot();
        if (s.weapon === 'flame' && s.shells.length) break;
        window.__td.advance(5);
      }
      const s = window.__td.snapshot(), { layout: L, base: b } = window.__td.ui();
      if (s.weapon !== 'flame' || !s.shells.length) throw new Error('No live fireball found');
      const manifest = await (await fetch('/td/outpost/manifest.json')).json();
      const anchor = manifest.anchors.muzzle_flamer;
      if (anchor.positions) throw new Error('Obsolete twin muzzle positions');
      const angle = s.aimAngle + (L.field.turned ? Math.PI / 2 : 0), scale = 22 * L.field.k / 440;
      const dx = anchor.position[0] - 260, dy = anchor.position[1] - 260;
      const muzzle = { x: b.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scale,
        y: b.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scale };
      const canvas = document.querySelector('#field canvas'), context = canvas.getContext('2d');
      const original = context.arc, arcs = [];
      context.arc = function (x, y, radius, ...rest) {
        if (this.fillStyle === '#ffe2b0' && Math.abs(radius - 0.9 * L.field.k) < 0.001) arcs.push({ x, y });
        return original.call(this, x, y, radius, ...rest);
      };
      try { window.__td.advance(0); } finally { context.arc = original; }
      const expected = s.shells.map(sh => {
        const end = toScreen(L.field, { x: sh.x1, y: sh.y1 });
        return { x: muzzle.x + (end.x - muzzle.x) * sh.k,
          y: muzzle.y + (end.y - muzzle.y) * sh.k - Math.sin(Math.PI * sh.k) * 12 * L.field.k };
      });
      return { turned: L.field.turned, muzzle, arcs, expected, anchor, t: s.t, wave: s.wave };
    });
    assert.equal(result.arcs.length, result.expected.length);
    for (let i = 0; i < result.arcs.length; i++) {
      assert.ok(Math.hypot(result.arcs[i].x - result.expected[i].x, result.arcs[i].y - result.expected[i].y) < 0.05);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}live-${name}.jpg`, type: 'jpeg', quality: 88 });
    results.push({ name, ...result, errors });
    await page.evaluate(() => window.__td.dispose()); await page.close();
    console.log(`${name}: live fireball matches the production launch mouth`);
  }
  await writeFile(`${reportDir}live-check.json`, JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
