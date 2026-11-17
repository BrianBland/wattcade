// Shared by the Penrose Pedals level-design scripts: open dev/penrose.html headless and expose the engine to page code.
// Needs `npm run dev` running (PENROSE_BASE overrides the URL, CHROMIUM_PATH the browser).
import { chromium } from 'playwright-core';

export async function openEngine() {
  const base = process.env.PENROSE_BASE ?? 'http://127.0.0.1:5173';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/dev/penrose.html?level=0`);
  await page.waitForFunction(() => window.__pp?.r?.engine?.level);
  // window.__ppRun(i, solve, secs): play level i without drawing, on the engine autopilot or cruising at 80 rpm.
  await page.evaluate(() => {
    window.__ppRun = (i, solve, secs) => {
      const e = window.__pp.r.engine; e.load(i); e.setAutopilot(solve); e.rider.effort = null; e.rider.cad = 80; e.rider.gear = 4;
      let last = ''; const L = e.level, f = L.flash; L.flash = (s) => { if (s) last = s; f(s); };
      for (let k = 0; k < 60 * secs; k++) { e.simulate(1 / 60); if (e.index !== i || e.level.state !== 'play') return `${e.level.state}@${Math.round(k / 60)}${e.level.state === 'restart' ? ` (${last})` : ''}`; }
      return `play@${secs}`;
    };
  });
  return { browser, page, errors };
}
