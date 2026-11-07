import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { designs as d4 } from './designs4.ts';
import { designs as d6 } from './designs6.ts';
import { makeRoad, crossings, searchPads, type Design } from './lib.ts';
import { splineLine } from '../../src/games/towerdefense/sim/road';
const pick = (ds: Design[], n: string) => ds.find(d => d.name.startsWith(n))!;
const out = [];
for (const d of [pick(d4, 'Now'), pick(d6, 'C2b'), pick(d4, 'A1')]) {
  const R = makeRoad(d);
  if (d.bridges && d.bridges.length === 0) d.bridges = crossings(R.road);
  const pads = d.name.startsWith('Now') ? d.pads! : [1, 2, 3].map(s => searchPads(d, s, d.pads ?? Array.from({ length: 12 }, (_, i) => ({ x: 12 + (i % 4) * 18, y: 20 + Math.floor(i / 4) * 30 })), 25000)).sort((a, b) => b.v - a.v)[0].pads;
  out.push({ name: d.name, line: splineLine(d.wp).map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })), pads, turret: d.turret, tr: d.tr ?? 11, hw: d.hw, shoulder: d.shoulder, bridges: d.bridges ?? [], over: d.over ?? 'first' });
}
writeFileSync(fileURLToPath(new URL('../../dev/td-ground-maps.json', import.meta.url)), JSON.stringify(out));
console.log(out.map(o => `${o.name}: ${o.line.length} pts, ${o.pads.length} pads, bridges ${JSON.stringify(o.bridges)}`).join('\n'));
