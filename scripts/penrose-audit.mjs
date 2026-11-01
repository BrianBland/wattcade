// Screen-space audit of Penrose Pedals levels: per camera angle, roads that overlap on screen without meeting,
// road samples hidden behind something else, and the perspective joins. Pass campaign numbers (1-based) or items
// ('turntable', '3:11', 'cg:297'); no arguments audits the whole campaign. Needs `npm run dev` running.
import { openEngine } from './penrose-lib.mjs';
const want = process.argv.slice(2);
const { browser, page, errors } = await openEngine();
try {
  const out = await page.evaluate((want) => {
    const e = window.__pp.r.engine, t = e.tools, res = [];
    const idx = want.length ? want.map((w) => (/^\d+$/.test(w) ? +w - 1 : e.levels.findIndex((d) => d.item === w || d.id === w))) : e.levels.map((_, i) => i);
    want.forEach((w, k) => { if (idx[k] < 0) idx[k] = t.preview(w); });
    for (const i of idx) { if (i < 0) continue; e.load(i); for (let k = 0; k < 3; k++) e.simulate(1 / 60); const d = e.levels[i]; res.push({ level: `${i + 1} ${d.name} (${d.item})`, views: t.audit() }); }
    return res;
  }, want);
  for (const r of out) { console.log(r.level); for (const v of r.views) console.log(`  yaw ${v.yaw}: overlaps ${JSON.stringify(v.over)} hidden ${JSON.stringify(v.hid)} joins ${v.joins.join(' ')}`); }
  if (errors.length) { console.log(errors.join('\n')); process.exitCode = 1; }
} finally { await browser.close(); }
