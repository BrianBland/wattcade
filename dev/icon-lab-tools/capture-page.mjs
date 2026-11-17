// Round 1 picker-icon helpers (run from the repo root with Vite on :5199). Captures real renderer frames / runs dev/icon-lab.html.
import { chromium } from 'playwright-core';
const [,, url, W, H, out, wait='2500'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +(process.env.DPR||1) });
p.on('pageerror', e => console.warn(e.message));
await p.goto(url); await p.waitForTimeout(+wait);
if (process.env.NOLBL) await p.addStyleTag({ content: '#lbl{display:none!important}' });
await p.screenshot({ path: out, timeout: 300000 }); await b.close();
