/**
 * Headless balance gate for generated levels: plays each level with passive riders and flags levels whose depth (median
 * waves survived) sits more than `band` waves from the generated levels' median. Level 0 at the narrow-road sizes is
 * printed for reference: searched pads cover the road better than level 0's, so generated levels run deeper.
 * npx tsx scripts/td-level-gate.ts [--seeds=1,2,3,4] [--styles=zigzag,trident,lasso,ring] [--riders=z2,hook-responsive]
 *   [--minutes=60] [--band=2]
 */
import { runHeadless } from '../src/core';
import { module } from '../src/games/towerdefense';
import { LEVEL_0, narrowed, type TdLevel } from '../src/games/towerdefense/sim/level';
import { ROAD_STYLES, generateLevel, type RoadStyle } from '../src/games/towerdefense/sim/generator';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const seeds = arg('seeds', '1,2,3,4').split(',').map(Number);
const styles = arg('styles', ROAD_STYLES.join(',')).split(',') as RoadStyle[];
const riders = arg('riders', 'z2,hook-responsive').split(',');
const minutes = Number(arg('minutes', '60')), band = Number(arg('band', '2'));
const runSeeds = [11, 12, 13];

/** Median waves survived over a few run seeds, per rider. */
function depth(level: TdLevel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const script of riders) {
    const waves = runSeeds.map(seed => Number(runHeadless({ game: module, script, minutes, seed, simOpts: { autopilot: true, level } }).summary.wavesSurvived));
    out[script] = waves.sort((a, b) => a - b)[1];
  }
  return out;
}

console.log(`reference (level 0, narrow): ${JSON.stringify(depth(narrowed(LEVEL_0)))}`);
const rows = styles.flatMap(style => seeds.map(seed => {
  const g = generateLevel(seed, { style });
  return { style, seed, g, d: depth(g.level) };
}));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mid = Object.fromEntries(riders.map(r => [r, median(rows.map(x => x.d[r]))]));
console.log(`generated median: ${JSON.stringify(mid)}`);
let outliers = 0;
for (const { style, seed, g, d } of rows) {
  const off = riders.filter(r => Math.abs(d[r] - mid[r]) > band);
  if (off.length) outliers++;
  console.log(`${off.length ? 'OUTLIER' : 'ok     '} ${style.padEnd(7)} seed ${seed}: ${JSON.stringify(d)} · length ${g.metrics.length}, pads ${g.level.pads.length}, flame ${g.metrics.flame.toFixed(2)}, gap ${g.metrics.gap.toFixed(0)}`);
}
console.log(`${outliers} outlier(s) beyond ±${band} waves of the generated median`);
process.exitCode = outliers ? 1 : 0;
