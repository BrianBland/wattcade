// Sweep generator seeds for Penrose Pedals level picks. Each seed that plans is built, solved on the autopilot and
// ridden idle; keepers go into src/games/penrose/campaign.ts as '<tier>:<seed>' or 'cg:<seed>'.
//   node scripts/penrose-gen-sweep.mjs tiers                 list the main generator's tiers
//   node scripts/penrose-gen-sweep.mjs gen <tier> <from> <to>  main generator (gen9.ts)
//   node scripts/penrose-gen-sweep.mjs curtain <from> <to>     curtain generator (curtain.ts)
// Needs `npm run dev` running.
import { openEngine } from './penrose-lib.mjs';
const [mode, ...args] = process.argv.slice(2);
const { browser, page, errors } = await openEngine();
try {
  if (mode === 'tiers') console.log((await page.evaluate(() => window.__pp.r.engine.tools.tiers())).map((t) => `${t.index}\t${t.id}\tzone ${t.zone}\t${t.label}`).join('\n'));
  else if (mode === 'gen' || mode === 'curtain') {
    const [a, b, c] = args.map(Number), tier = mode === 'gen' ? a : null, from = mode === 'gen' ? b : a, to = mode === 'gen' ? c : b;
    const rows = await page.evaluate(([mode, tier, from, to]) => {
      const t = window.__pp.r.engine.tools, out = [];
      for (let sd = from; sd < to; sd++) {
        let item, about = '';
        if (mode === 'gen') {
          const r = t.candidates(tier, [sd])[0]; if (!r.plan) continue;
          item = `${tier}:${sd}`; about = `${r.sig} · ${r.sol.stops} stops · ${r.sol.minutes.toFixed(1)} min`;
        } else {
          const pl = t.curtainPlan(sd); if (!pl) continue;
          item = `cg:${sd}`; about = `${pl.name} · holes ${pl.holes.map((h) => h.kind + h.yaw).join(',')}`;
        }
        const i = t.preview(item); if (i < 0) continue;
        out.push({ item, about, solve: window.__ppRun(i, true, 600), idle: window.__ppRun(i, false, 120) });
      }
      return out;
    }, [mode, tier, from, to]);
    let good = 0;
    for (const r of rows) { const ok = r.solve.startsWith('won') && r.idle === 'play@120'; if (ok) good++; console.log(`${ok ? 'ok ' : 'BAD'} ${r.item}  ${r.about}  solve ${r.solve}  idle ${r.idle}`); }
    console.log(`${rows.length} seeds planned of ${to - from}, ${good} solve and are idle safe`);
  } else { console.log('usage: penrose-gen-sweep.mjs tiers | gen <tier> <from> <to> | curtain <from> <to>'); process.exitCode = 2; }
  if (errors.length) { console.log(errors.join('\n')); process.exitCode = 1; }
} finally { await browser.close(); }
