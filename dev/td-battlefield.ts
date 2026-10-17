// Review the real renderer, inset composition, and a deterministic 150-alien stress fixture.
// /dev/td-battlefield.html?sec=700&inset=110&manual=1&stress=150&weapon=flame
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module } from '../src/games/towerdefense';
import { BASE_X, BASE_Y, KINDS, ROAD_LENGTH, WEAPON_ELEMENT, flightAt, flightLength, roadAt, type Kind, type Weapon } from '../src/games/towerdefense/sim/defs';
import type { EnemyView, TdSnapshot } from '../src/games/towerdefense/sim/types';
const q = new URLSearchParams(location.search);
const profile = testProfile({ color: '#4cc9f0' });
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: q.get('script') ?? 'sprints' }, seed: Number(q.get('seed') ?? 1), simOpts: { autopilot: true } });
session.step(Math.round(Number(q.get('sec') ?? 700) * 30));
const renderer = await module.loadRenderer();
const inset = Number(q.get('inset') ?? 110);
renderer.mount(document.getElementById('app')!, { profile, send: a => session.sim.receive?.(a), insets: { top: 0, left: 0, right: 0, bottom: inset } });
await renderer.ready?.();
const hud = document.getElementById('hud')!; hud.style.height = `${inset}px`; hud.textContent = inset ? `Shell HUD inset · ${inset}px` : '';
const stress = Math.max(0, Math.min(200, Number(q.get('stress') ?? 0)));
const kinds = Object.keys(KINDS) as Kind[];
let frames = 0, times: number[] = [];
function snapshot(): TdSnapshot {
  const s = session.sim.snapshot() as TdSnapshot;
  if (!stress) return s;
  const enemies: EnemyView[] = Array.from({ length: stress }, (_, i) => {
    const kind = i === stress - 1 ? 'boss' : i % 50 < 30 ? 'mini' : i % 50 < 38 ? 'dart' : kinds[2 + i % 5], def = KINDS[kind];
    const route = kind === 'dart' ? i % 3 : -1, progress = 0.08 + ((i * 0.618034 + s.t * 0.003) % 1) * 0.76;
    const p = route < 0 ? roadAt(ROAD_LENGTH * progress) : flightAt(route, flightLength(route) * progress), off = ((i % 5) - 2) * 0.65;
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    return { id: 10000+i, kind, route, flying: route >= 0, x, y, angle: Math.atan2(-p.nx,p.ny), dist: Math.hypot(x-BASE_X,y-BASE_Y), radius: def.radius,
      element: def.color === 'blue' || def.color === 'red' || def.color === 'purple' ? def.color : 'purple', gold: kind === 'boss', hp: def.hp, maxHp: def.hp, hurt: 0, charging: false, shiftIn: 5, next: null, progress, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0 };
  });
  const weapon = (q.get('weapon') ?? 'gatling') as Weapon;
  return { ...s, wave: 15, lull: 0, waveElapsed: 35, waveMaxS: 60, enemies, phase: 'run', over: false, banner: null, boss: null, effort: null, flaming: weapon === 'flame', flamePower: 1.1, flameRange: 70, railCharges: 2, railProgress: 0.5, weapon, aimAngle: -0.25,
    baseHp: q.has('damage') ? 20 : s.baseMaxHp, grid: 1.1, brood: { ...s.brood, weapon, color: WEAPON_ELEMENT[weapon], countdownS: 0 },
    towers: s.towers.map((tw,i)=>({...tw, kind: (['tesla','flamer','lens'] as const)[i%3], level: 3+i%3, firedAt: s.t - ((s.t+i*0.17)%1.6) })), fx: [] };
}
function draw() {
  const s = snapshot(), start = performance.now();
  renderer.render(s, session.bikeStore.get(), session.ctx.input());
  times.push(performance.now()-start); if (times.length>600) times.shift(); frames++;
  Object.assign(window, { __snapshot: s, __renderMs: times, __frames: frames });
}
let acc = 0;
function advance(ms: number) { acc += ms/1000; const n=Math.floor(acc*30); acc -= n/30; if(n)session.step(n); draw(); }
Object.assign(window, { __advance: advance, __renderer: renderer });
addEventListener('resize',()=>renderer.resize?.(innerWidth,innerHeight));
if (!q.has('manual')) { let last=performance.now(); const frame=(now:number)=>{advance(Math.min(100,now-last));last=now;requestAnimationFrame(frame);}; requestAnimationFrame(frame); }
else draw();
