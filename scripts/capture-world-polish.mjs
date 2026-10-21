const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp/wattcade-biomes';
mkdirSync(out, { recursive: true });
const ids = ['countryside','seaside','underwater','jungle','desert','volcano','snow','moon','autumn','marsh','market','sky'];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const [startBiome, id] of ids.entries()) {
    const opts = encodeURIComponent(JSON.stringify({ startBiome, startDistance: 500, terrainSeed: 17 }));
    await page.goto(`${reviewUrl}/dev/capture.html?game=warmup&manual=1&hour=14&opts=${opts}`);
    await page.waitForFunction(() => window.__advance);
    await page.evaluate(() => window.__advance(1000));
    await page.screenshot({ path: `${out}/${id}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured all 12 live biomes in ${out}`);
} finally { await browser.close(); }
