// Round 1 picker-icon helpers (run from the repo root with Vite on :5199). Captures real renderer frames / runs dev/icon-lab.html.
import { chromium } from 'playwright-core';
const [,, id, query, W, H, out, frames='1', stepMs='33'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +(process.env.DPR||1) });
page.on('pageerror', e => console.warn(id, e.message));
await page.addInitScript(() => { let vt = performance.now(); const t0 = Date.now() - vt; performance.now = () => vt; Date.now = () => Math.floor(t0 + vt); window.__vclock = (ms) => { vt += ms; }; });
await page.goto(`http://localhost:5199/dev/capture.html?game=${id}&manual=1&${query}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__advance, null, { polling: 500, timeout: 900000 });
if (process.env.NOHUD) await page.addStyleTag({ content: '#app *{visibility:hidden!important} #app canvas{visibility:visible!important}' });
for (let i = 0; i < 60; i++) await page.evaluate(() => window.__advance(33.33));
for (let f = 0; f < +frames; f++) {
  await page.screenshot({ path: `${out}-${f}.png`, timeout: 300000 });
  for (let i = 0; i < +stepMs/33; i++) await page.evaluate(() => window.__advance(33.33));
}
await browser.close();
