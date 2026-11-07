import { execSync } from 'node:child_process';
import { searchPads, makeRoad, score, crossings, type P } from './lib.ts';
import { panel } from './render.ts';
const mod = await import(process.argv[2]);
const out = process.argv[3], seeds = (process.argv[4] ?? '1,2,3').split(',').map(Number);
const grid: P[] = Array.from({ length: 12 }, (_, i) => ({ x: 12 + (i % 4) * 18, y: 20 + Math.floor(i / 4) * 30 }));
const files: string[] = [];
for (const [i, d] of mod.designs.entries()) {
  const R = makeRoad(d);
  if (d.bridges && d.bridges.length === 0) d.bridges = crossings(R.road);
  const fixed = d.name.startsWith('Now');
  const runs = fixed ? [{ pads: d.pads!, v: 0, valid: true, score: score(d, R, d.pads!) }]
    : seeds.map(s => searchPads(d, s, d.pads ?? grid, Number(process.argv[5] ?? 30000))).sort((a, b) => b.v - a.v);
  const best = runs[0];
  const { svg } = panel(d, best.pads, best.valid ? '' : 'pads INVALID');
  const f = `${out}-${i}.svg`; (await import('node:fs')).writeFileSync(f, svg); files.push(f);
  console.log(JSON.stringify({ name: d.name, valid: best.valid, ...best.score, pads: best.pads }));
}
execSync(`magick ${files.join(' ')} +append ${out}.png`);
