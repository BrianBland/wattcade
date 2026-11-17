// Round 1 picker-icon helpers (run from the repo root with Vite on :5199). Captures real renderer frames / runs dev/icon-lab.html.
import { chromium } from 'playwright-core'; import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/claude-0/icons/out', qs = process.argv[3] || ''; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on('console', m => m.type() === 'error' && console.log('console:', m.text())); p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:5199/dev/' + (process.env.PAGE || 'icon-lab.html') + qs);
await p.waitForFunction(() => window.__icons || window.__err, null, { timeout: 120000 });
const r = await p.evaluate(() => window.__icons || window.__err);
if (typeof r === 'string') { console.log(r); process.exit(1); }
for (const [k, v] of Object.entries(r)) writeFileSync(`${out}/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
await b.close(); console.log(Object.keys(r).join(' '));
