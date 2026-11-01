// Every Penrose Pedals campaign level must solve on the engine autopilot and survive two minutes of idle riding.
// Start `npm run dev`, then: node scripts/penrose-solve-check.mjs
import { openEngine } from './penrose-lib.mjs';
const { browser, page, errors } = await openEngine();
try {
  const rows = await page.evaluate(() => window.__pp.r.engine.levels.map((d, i) => ({ i, name: d.name, item: d.item, solve: window.__ppRun(i, true, 600), idle: window.__ppRun(i, false, 120) })));
  let bad = 0;
  for (const r of rows) { const ok = r.solve.startsWith('won') && r.idle === 'play@120'; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${r.i + 1} ${r.name} (${r.item}): solve ${r.solve}, idle ${r.idle}`); }
  if (errors.length) { console.log(errors.join('\n')); bad++; }
  process.exitCode = bad ? 1 : 0;
} finally { await browser.close(); }
