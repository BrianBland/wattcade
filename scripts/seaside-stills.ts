// Renders the Seaside art-direction stills to docs/seaside/stills/*.png.
//   npx tsx scripts/seaside-stills.ts [highway turnout shop]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { join } from 'node:path';

const names = process.argv.slice(2).length ? process.argv.slice(2) : ['highway', 'turnout', 'shop', 'lou'];
const server = await createServer({ server: { port: 5298, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const n of names) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.warn(`${n}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') console.warn(`${n}: ${m.text()}`); });
    await page.goto(`${base}/dev/seaside.html?still=${n}`);
    const stats = await page.waitForFunction(() => (window as unknown as { __done?: string }).__done, null, { timeout: 600_000 });
    console.log(`— ${n}\n${await stats.jsonValue()}`);
    await page.screenshot({ path: join('docs/seaside/stills', `${n}.png`), clip: { x: 0, y: 0, width: 1600, height: 900 } });
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
