// Dev-only: a staged Dynamo Defense moment for the picker icon. The real renderer, with a hand-built snapshot:
// the dynamo firing at the brood, a tesla tower beside it arcing through two aliens, all within one crop.
//   /dev/td-icon.html?sec=418&manual=1&near=0.9&weapon=gatling
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module } from '../src/games/towerdefense';
import { BASE_X, BASE_Y, KINDS, PADS, ROAD_LENGTH, roadAt, type Kind, type Weapon } from '../src/games/towerdefense/sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../src/games/towerdefense/sim/types';
const q = new URLSearchParams(location.search);
const profile = testProfile({ color: '#4cc9f0' });
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'sprints' }, seed: Number(q.get('seed') ?? 1), simOpts: { autopilot: true } });
session.step(Math.round(Number(q.get('sec') ?? 418) * 30));
const renderer = await module.loadRenderer();
renderer.mount(document.getElementById('app')!, { profile, send: () => {}, insets: { top: 0, left: 0, right: 0, bottom: 0 } });
await renderer.ready?.();
document.getElementById('hud')!.remove();
const weapon = (q.get('weapon') ?? 'gatling') as Weapon;
const padNear = PADS.map((p, i) => ({ i, d: Math.hypot(p.x - BASE_X, p.y - BASE_Y) })).sort((a, b) => a.d - b.d);
const pad = Number(q.get('pad') ?? padNear[0].i);
const near = Number(q.get('near') ?? 0.9);
const plan: Array<[Kind, number, number]> = [['brute', near - 0.07, 0], ['mini', near - 0.04, -1.2], ['mini', near - 0.035, 1.1], ['armor', near - 0.01, 0.3], ['mini', near + 0.015, -0.9], ['charger', near + 0.03, 0.8], ['mini', near - 0.1, 0.6], ['brute', near - 0.13, -0.4]];
function snapshot(): TdSnapshot {
  const s = session.sim.snapshot() as TdSnapshot;
  const enemies: EnemyView[] = plan.map(([kind, prog, off], i) => {
    const def = KINDS[kind], p = roadAt(ROAD_LENGTH * Math.min(0.995, prog)), x = p.x + p.nx * off, y = p.y + p.ny * off;
    const element = (q.get('el') ?? 'blue') as 'blue';
    return { id: 20000 + i, kind, route: -1, flying: false, x, y, angle: Math.atan2(-p.nx, p.ny), dist: Math.hypot(x - BASE_X, y - BASE_Y), radius: def.radius, element, gold: false, hp: def.hp * 0.7, maxHp: def.hp, hurt: i === 3 ? 0.1 : 0, charging: false, shiftIn: 5, next: null, progress: prog, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0, shield: 0, hitT: -1, hitCls: 'neutral', hitDmg: 0 };
  });
  const tp = PADS[pad], t = s.t;
  const byTower = [...enemies].sort((a, b) => Math.hypot(a.x - tp.x, a.y - tp.y) - Math.hypot(b.x - tp.x, b.y - tp.y));
  const byBase = [...enemies].sort((a, b) => a.dist - b.dist);
  const target = byBase[0];
  const fx: Fx[] = [
    { id: 1, t0: t - 0.02, life: 0.5, kind: 'zap', pts: [{ x: tp.x, y: tp.y - 3 }, { x: byTower[0].x, y: byTower[0].y }, { x: byTower[1].x, y: byTower[1].y }, { x: byTower[2].x, y: byTower[2].y }] },
    { id: 2, t0: t - 0.02, life: 0.3, kind: 'tracer', x0: BASE_X, y0: BASE_Y, x1: target.x, y1: target.y, hit: true },
    { id: 3, t0: t - 0.06, life: 0.3, kind: 'tracer', x0: BASE_X, y0: BASE_Y, x1: byBase[1].x, y1: byBase[1].y, hit: true },
  ];
  const towers = s.towers.map((tw) => ({ ...tw })).filter((tw) => tw.pad !== pad);
  towers.push({ pad, kind: 'tesla', level: 5, angle: 0, charge: 1, firedAt: t - 0.03 });
  return { ...s, wave: 9, lull: 0, enemies, phase: 'run', over: false, banner: null, boss: null, effort: null, weapon, aimAngle: Math.atan2(target.x - BASE_X, BASE_Y - target.y),
    flaming: weapon === 'flame', flamePower: 1, flameRange: 60, grid: 1.2, brood: { ...s.brood, weapon, countdownS: 0 }, towers, fx } as TdSnapshot;
}
function draw() { renderer.render(snapshot(), session.bikeStore.get(), session.ctx.input()); }
let acc = 0;
function advance(ms: number) { (window as unknown as { __vclock?: (ms: number) => void }).__vclock?.(ms); acc += ms / 1000; const n = Math.floor(acc * 30); acc -= n / 30; if (n) session.step(n); draw(); }
Object.assign(window, { __advance: advance, __info: { pad, base: [BASE_X, BASE_Y], padXY: PADS[pad], near: padNear.slice(0, 4) } });
addEventListener('resize', () => renderer.resize?.(innerWidth, innerHeight));
draw();
