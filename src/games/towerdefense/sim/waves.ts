// Wave composition. Pure: everything random comes from the `rng` argument.
import { KIND_FROM, KINDS, type Element, type Kind } from './defs';

export interface Spawn { at: number; kind: Kind; lane: number }
export interface WavePlan {
  wave: number; boss: boolean; mainLane: number; spawns: Spawn[];
  /** Heavy count per lane per colour (gold = boss, prism = shifting) for the forecast panel. */
  lanes: Array<Record<Element | 'gold' | 'prism', number>>;
}
export interface WaveOpts { spawnWindowS: number; countScale: number }

/** How many of each heavy kind wave `w` sends (before lane assignment). */
export function waveCounts(w: number, countScale = 1): Partial<Record<Kind, number>> {
  const boss = w % 5 === 0;
  const k = (boss ? 0.6 : 1) * countScale;
  const n = (from: Kind, f: number) => (w >= KIND_FROM[from] ? Math.max(0, Math.round(f * k)) : 0);
  return {
    brute: n('brute', 2 + w * 0.8),
    armor: n('armor', 1 + Math.floor(w / 4)),
    dart: n('dart', 4 * Math.floor((w - 1) / 3)),
    charger: n('charger', Math.floor((w - 3) / 3)),
    carrier: n('carrier', Math.floor((w - 5) / 4)),
    prism: n('prism', Math.floor((w - 8) / 3)),
    boss: boss ? 1 : 0,
  };
}

export function planWave(w: number, rng: () => number, o: WaveOpts): WavePlan {
  const mainLane = Math.floor(rng() * 3) % 3;
  const second = w >= 8 ? (mainLane + 1 + (rng() < 0.5 ? 0 : 1)) % 3 : -1;
  const pickLane = () => {
    const r = rng();
    if (r < (second >= 0 ? 0.45 : 0.6)) return mainLane;
    if (second >= 0 && r < 0.75) return second;
    return Math.floor(rng() * 3) % 3;
  };
  const window = o.spawnWindowS + Math.min(10, w * 0.25);
  const spawns: Spawn[] = [];
  const counts = waveCounts(w, o.countScale);
  for (const kind of Object.keys(counts) as Kind[]) {
    const c = counts[kind] ?? 0;
    if (kind === 'boss') { if (c) spawns.push({ at: 3, kind, lane: mainLane }); continue; }
    if (kind === 'dart') { // darts come in packs of 4 down one lane
      for (let p = 0; p < c / 4; p++) {
        const at = 2 + rng() * window, lane = pickLane();
        for (let i = 0; i < 4; i++) spawns.push({ at: at + i * 0.35, kind, lane });
      }
      continue;
    }
    for (let i = 0; i < c; i++) spawns.push({ at: 1 + rng() * window, kind, lane: pickLane() });
  }
  spawns.sort((a, b) => a.at - b.at);
  const lanes = [0, 1, 2].map(() => ({ blue: 0, red: 0, purple: 0, gold: 0, prism: 0 }));
  for (const s of spawns) lanes[s.lane][KINDS[s.kind].color]++;
  return { wave: w, boss: (counts.boss ?? 0) > 0, mainLane, spawns, lanes };
}
