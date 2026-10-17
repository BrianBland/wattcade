// Writes the single-road paint guides, and overlay checks for any finished paintings.
//   npm run dev -- --port 5203 &   then   node scripts/td-paint-guide.mjs
// Guides:  docs/towerdefense/paint-guide/{portrait,landscape}-guide.png
// Checks:  for each public/td/environment/road/{portrait,landscape}.webp that exists,
//          docs/towerdefense/paint-guide/{portrait,landscape}-check.png
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5203';
const out = 'docs/towerdefense/paint-guide'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const o of ['portrait', 'landscape']) {
    const [w, h] = o === 'portrait' ? [1024, 1536] : [1536, 1024];
    const painting = `public/td/environment/road/${o}.webp`;
    const jobs = [[`${o}-guide.png`, `guide=${o}`]];
    if (existsSync(painting)) jobs.push([`${o}-check.png`, `guide=${o}&check=/td/environment/road/${o}.webp`]);
    for (const [file, query] of jobs) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on('pageerror', e => { throw e; });
      await page.goto(`${base}/dev/td-sketch.html?${query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${file}`, clip: { x: 0, y: 0, width: w, height: h } });
      await page.close();
      console.log(`${out}/${file}`);
    }
  }
} finally { await browser.close(); }
