// Copy beside the production proofs; run with TOWERDEFENSE_BASE=http://127.0.0.1:5208.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const reportDir = fileURLToPath(new URL('.', import.meta.url));
const output = (process.env.TD_ART_REVIEW_OUT ?? '/tmp/wattcade-td-art/flamer') + '/';
await mkdir(output, { recursive: true });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5208';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const [name, width, height] of [['portrait', 820, 1180], ['landscape', 1180, 820]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().includes('/td/')) failed.push(r.url()); });
    await page.goto(`${base}/dev/td-battlefield.html?sec=619&manual=1&inset=110`);
    await page.waitForFunction(() => window.__renderer && window.__snapshot, null, { timeout: 120000 });
    await page.addStyleTag({ url: `${base}/src/styles/main.css` });
    const result = await page.evaluate(async () => {
      const { PADS } = await import('/src/games/towerdefense/sim/defs.ts');
      const r = window.__renderer, original = window.__snapshot;
      const m = await (await fetch('/td/towers/flamer/manifest.json')).json();
      const a = m.anchors.muzzle, nozzle = m.parts.find(p => p.name === a.parent);
      const pick = (fallback, tiers, level) => {
        const keys = Object.keys(tiers ?? {}).map(Number).filter(n => n <= level).sort((a, b) => b - a);
        return keys.length ? tiers[keys[0]] : fallback;
      };
      const bike = { crankRevs: 20, powerZone: 3, power3s: 180, power10s: 180, cadence3s: 80,
        hr5s: 120, ftpFraction: 0.75, gear: 6, trainerMode: 'ERG', raw: { power: 180, cadence: 80, speedKph: 25 } };
      const towers = [1, 2, 3, 4, 5].map((level, i) => ({ pad: i, kind: 'flamer', level,
        angle: [-0.8, 0.3, 1.1, 2.2, -2.4][i], charge: 1, firedAt: original.t - 0.1 }));
      const s = { ...original, phase: 'run', grid: 1, over: false, lull: 0, banner: null,
        boss: null, effort: null, workshop: null, garage: null, towers, enemies: [], fx: [], burns: [], shells: [] };
      // These are settled aim/recoil poses, after main's new build/upgrade drop animation.
      r.drops = new Map(towers.map(tw => [tw.pad, { kind: tw.kind, level: tw.level, from: 0,
        at: s.t - 2, built: true, landed: 2 }]));
      const context = r.canvas.getContext('2d'), drawImage = context.drawImage, radial = context.createRadialGradient;
      const effects = [], cones = [], headFiles = new Set();
      context.drawImage = function (image, ...args) {
        const src = image.src ?? '';
        if (src.includes('/flamer/')) {
          headFiles.add(src.split('/flamer/')[1]);
          if (args.length === 8) effects.push({ file: src.split('/flamer/')[1], args,
            matrix: Array.from([this.getTransform().a, this.getTransform().b, this.getTransform().c,
              this.getTransform().d, this.getTransform().e, this.getTransform().f]) });
        }
        return drawImage.call(this, image, ...args);
      };
      context.createRadialGradient = function (...args) {
        if (args[2] === 0 && args[0] === args[3] && args[1] === args[4]) cones.push(args);
        return radial.call(this, ...args);
      };
      try { r.render(s, bike); } finally { context.drawImage = drawImage; context.createRadialGradient = radial; }
      const checks = towers.map((tw, i) => {
        const p = r.view.P(PADS[tw.pad].x, PADS[tw.pad].y), angle = tw.angle + r.view.rot;
        const tip = pick(a.position, a.positionsByLevel, tw.level);
        const pulse = nozzle.recoil.distancePx * (1 - 0.1 / 0.3);
        const dx = tip[0] - 112, dy = tip[1] - 112 + pulse, scale = 8.4 * r.view.k / 136;
        const expected = { x: p.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scale,
          y: p.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scale };
        const actual = r.machinery.towerMuzzle(tw, r.view, s.t);
        const effect = effects[i], animation = m.animations.attack, offset = pick(animation.effect.offset, animation.effect.offsetsByLevel, tw.level);
        const matrix = effect?.matrix;
        const effectTip = matrix ? { x: (matrix[0] * tip[0] + matrix[2] * tip[1] + matrix[4]) / r.dpr,
          y: (matrix[1] * tip[0] + matrix[3] * tip[1] + matrix[5]) / r.dpr } : null;
        return { level: tw.level, expected, actual, effectTip, expectedOffset: offset,
          drawnOffset: effect?.args.slice(4, 6), coneAtTip: cones.some(c => Math.hypot(c[0] - expected.x, c[1] - expected.y) < 0.05) };
      });
      return { turned: r.view.turned, checks, effectCount: effects.length, headFiles: [...headFiles] };
    });
    assert.equal(result.effectCount, 5);
    for (const file of ['parts/head.png', 'parts/nozzle.png', 'parts/upgrade_l3.png', 'parts/nozzle_l3.png', 'parts/upgrade_l5.png', 'parts/nozzle_l5.png'])
      assert.ok(result.headFiles.includes(file), `Settled production part must draw: ${file}`);
    for (const check of result.checks) {
      assert.ok(Math.hypot(check.actual.x - check.expected.x, check.actual.y - check.expected.y) < 0.05);
      assert.ok(check.effectTip && Math.hypot(check.effectTip.x - check.expected.x, check.effectTip.y - check.expected.y) < 0.05);
      assert.deepEqual(check.drawnOffset, check.expectedOffset);
      assert.ok(check.coneAtTip, `L${check.level} flame cone must begin at its nozzle`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await page.screenshot({ path: `${output}live-${name}.jpg`, type: 'jpeg', quality: 88 });
    results.push({ name, ...result, errors, failed });
    console.log(`${name}: L1–L5 production heads, pulse, tier flare offsets and flame-cone origins match`);
    await page.evaluate(() => window.__renderer.unmount()); await page.close();
  }
  const hud = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  await hud.goto(`${base}/dev/towerdefense.html?manual=1&sec=531&seed=1&legend=0`);
  await hud.waitForFunction(() => window.__td, null, { timeout: 120000 });
  for (const legend of [false, true]) {
    await hud.evaluate(on => window.__td.legend(on), legend); await hud.waitForTimeout(250);
    const boxes = await hud.evaluate(() => {
      const L = window.__td.ui().layout;
      return { status: L.status, current: L.current, limit: L.UH,
        contained: [...document.querySelectorAll('.td-status, .td-current')].every(el =>
          el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) };
    });
    assert.ok(boxes.current.y > 410 && boxes.status.y < 20);
    assert.ok(boxes.current.y + boxes.current.h <= boxes.limit);
    assert.ok(boxes.contained);
    const mode = legend ? 'controller' : 'touch';
    await hud.screenshot({ path: `${output}hud-landscape-${mode}.jpg`, type: 'jpeg', quality: 88 });
    results.push({ hudMode: mode, ...boxes });
  }
  await hud.evaluate(() => window.__td.dispose()); await hud.close();
  // The approved production asset is required; the loading gate must expose a failure.
  const missing = await browser.newPage();
  await missing.route('**/td/towers/flamer/manifest.json', route => route.fulfill({ status: 404, body: '{}' }));
  const rejected = missing.waitForEvent('pageerror', { timeout: 30000 }).then(e => e.message);
  await missing.goto(`${base}/dev/towerdefense.html?manual=1`);
  const failure = await rejected;
  assert.match(failure, /Unable to load battlefield manifest.*flamer/);
  results.push({ missingAssetRejects: true }); await missing.close();
  await writeFile(`${reportDir}live-check.json`, JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
