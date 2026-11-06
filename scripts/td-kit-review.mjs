// Renders ground kits on the three test maps and runs the brief's automated checks.
// Needs the dev server: npm run dev -- --port 5203   (TD_BASE overrides the URL)
// Usage: node scripts/td-kit-review.mjs <kit>[,<kit>...] [--blind] [--out=/tmp/td-kit-review]
//   → <out>/<kits>.png (portrait maps + landscape ring) and <out>/<kits>.json (checks; "fails" lists missed gates)
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const kits = process.argv[2];
if (!kits) { console.error('usage: node scripts/td-kit-review.mjs <kit>[,<kit>...] [--blind] [--out=dir]'); process.exit(2); }
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? '/tmp/td-kit-review';
const base = process.env.TD_BASE ?? 'http://127.0.0.1:5203';
const blind = process.argv.includes('--blind') ? '&blind=1' : '';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const name = kits.replace(/,/g, '+');
  const page = await browser.newPage({ viewport: { width: 3600, height: 1400 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/dev/td-ground.html?check=${kits}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  const checks = await page.evaluate(() => window.__kitCheck);
  await writeFile(`${out}/${name}.json`, JSON.stringify(checks, null, 2));
  await page.goto(`${base}/dev/td-ground.html?kit=${kits}${blind}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  for (const c of checks) console.log(`${c.kit}: ${c.pass ? 'PASS' : 'FAIL'}${c.fails.length ? '\n  - ' + c.fails.join('\n  - ') : ''}`);
  if (errors.length) console.log('page errors:', errors.join(' | '));
  console.log(`wrote ${out}/${name}.png and ${out}/${name}.json`);
} finally { await browser.close(); }
