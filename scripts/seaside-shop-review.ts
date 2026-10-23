// Reproducible browser checks and uncommitted PR stills: npx tsx scripts/seaside-shop-review.ts
// OUT defaults to /tmp/seaside-shop-review. CHROMIUM_PATH selects a local browser when needed.
import { createServer } from 'vite';
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { shopLayout } from '../src/games/seaside/render/shopLayout';
import type { SeasideSnapshot } from '../src/games/seaside/sim/types';

const out = process.env.OUT ?? '/tmp/seaside-shop-review'; mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5286, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [], results: string[] = [];
const snap = (p: Page): Promise<SeasideSnapshot> => p.evaluate(() => (window as any).__session.sim.snapshot());
const step = (p: Page, n = 1) => p.evaluate((n) => (window as any).__session.step(n), n);
const painted = (p: Page) => p.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
try {
  const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
  for (const [width, height, bottom] of [[1180, 820, 140], [390, 844, 120], [320, 568, 100], [844, 390, 76]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(e.message));
    const L = shopLayout(width, height, { top: 0, left: 0, right: 0, bottom });
    const tap = async (name: keyof typeof L) => { const b = L[name]; await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2); await step(page); await painted(page); };
    const open = async (scene: string, query = '') => {
      await page.goto(`${base}/dev/seaside-play.html?scene=${scene}&speed=0&inset=${bottom}${query}`);
      await page.waitForFunction(() => (window as any).__session, null, { timeout: 60_000 }); await painted(page);
    };
    const shot = async (name: string) => { await painted(page); await page.screenshot({ path: join(out, `${width}x${height}-${name}.png`) }); };
    await open('shop1', '&cash=150&creel=1');
    assert.equal((await snap(page)).shop?.receipt.lines.length, 2);
    await shot('shop');
    // Actual keyboard events pass through InputHub; render-surface taps pass through receive().
    await page.keyboard.down('ArrowRight'); await step(page); await page.keyboard.up('ArrowRight'); await step(page);
    assert.equal((await snap(page)).shop?.index, 1);
    await tap('next'); assert.equal((await snap(page)).shop?.index, 2);
    await tap('buy'); assert.deepEqual((await snap(page)).economy.extras, ['bucketHat']);
    const cash = (await snap(page)).economy.cash;
    await tap('buy'); assert.equal((await snap(page)).economy.cash, cash);
    await tap('leave'); assert.equal((await snap(page)).economy.rod, 'surf');
    assert.equal((await snap(page)).sceneId, 'toPier');
    await open('pierStand', '&cash=150&creel=1');
    await shot('pier');
    await tap('buy'); assert.equal((await snap(page)).economy.rod, 'deep');
    await shot('deep-packed');
    await tap('leave'); assert.equal((await snap(page)).sceneId, 'bigOne');
    assert.equal((await snap(page)).economy.rod, 'deep');
    await open('shop1'); await shot('short-money');
    await tap('bonus'); assert.equal((await snap(page)).shop?.bonusRemaining, 180);
    await step(page, 30 * 180); await painted(page);
    assert.equal((await snap(page)).shop?.bonusRemaining, null);
    assert.equal((await snap(page)).shop?.bonusAvailable, false);
    await tap('buy'); assert.equal((await snap(page)).economy.rod, 'surf');
    assert.ok((await snap(page)).economy.debt > 0);
    await shot('pay-later');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    results.push(`${width}×${height}: keyboard, touch, purchases, duplicate protection, bonus cap, credit, Deep and overflow passed`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'checks.txt'), results.join('\n') + '\n');
  console.log(results.join('\n'));
} finally { await browser.close(); await server.close(); }
