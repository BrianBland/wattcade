// Every Penrose Pedals level must solve on the engine autopilot and survive two minutes of idle riding.
// Start `npm run dev`, then: node scripts/penrose-solve-check.mjs   (PENROSE_BASE, CHROMIUM_PATH to override)
import { chromium } from 'playwright-core';
const base = process.env.PENROSE_BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/dev/penrose.html?level=0`);
  await page.waitForFunction(() => window.__pp?.r?.engine?.level);
  const rows = await page.evaluate(() => {
    const e = window.__pp.r.engine, out = [];
    const run = (i, solve, secs) => {
      e.load(i); e.setAutopilot(solve); e.rider.effort = null; e.rider.cad = 80; e.rider.gear = 4;
      for (let k = 0; k < 60 * secs; k++) { e.simulate(1 / 60); if (e.index !== i || e.level.state !== 'play') return `${e.level.state}@${Math.round(k / 60)}`; }
      return `play@${secs}`;
    };
    for (let i = 0; i < e.levels.length; i++) out.push({ i, name: e.levels[i].name, solve: run(i, true, 600), idle: run(i, false, 120) });
    return out;
  });
  let bad = 0;
  for (const r of rows) { const ok = r.solve.startsWith('won') && r.idle === 'play@120'; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${r.i + 1} ${r.name}: solve ${r.solve}, idle ${r.idle}`); }
  if (errors.length) { console.log(errors.join('\n')); bad++; }
  process.exitCode = bad ? 1 : 0;
} finally { await browser.close(); }
