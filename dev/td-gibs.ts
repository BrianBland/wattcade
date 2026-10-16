// Controlled gib demo: a Warrior, a Ram, a Bulwark and a Hive Tyrant walk, then die at t = 1 s on plain ground.
//   /dev/td-gibs.html  (window.__draw(t) renders sim time t; frames are deterministic for a given t sequence)
import { KINDS, type Kind } from '../src/games/towerdefense/sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../src/games/towerdefense/sim/types';
import { AlienLayer, type View } from '../src/games/towerdefense/render/aliens/layer';

const W = 1280, H = 720, DPR = 2, K = 12; // px per field unit
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * DPR; cv.height = H * DPR; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
const g = cv.getContext('2d')!;
const layer = new AlienLayer('/');
const v: View = { X: (x) => x * K, Y: (y) => y * K, k: K, dpr: DPR };
const cast: Array<[Kind, number, number]> = [['brute', 20, 38], ['charger', 44, 38], ['armor', 68, 38], ['boss', 94, 34]];
const enemy = (i: number, kind: Kind, x: number, y: number): EnemyView => ({
  id: i + 1, kind, lane: 0, x, y, angle: 0, dist: 50, radius: KINDS[kind].radius, element: KINDS[kind].color === 'gold' || KINDS[kind].color === 'prism' ? 'purple' : KINDS[kind].color as EnemyView['element'],
  gold: kind === 'boss', hp: 10, maxHp: 10, hurt: 0, charging: false, shiftIn: 0, next: null, progress: 0.5, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0,
  hitT: -1, hitCls: 'neutral', hitDmg: 0,
});
let last = -1;
function snap(t: number): TdSnapshot {
  const alive = t < 1, fx: Fx[] = alive ? [] : cast.map(([kind, x, y], i) => ({ id: 10 + i, t0: 1, life: 0.7, kind: 'death', x, y: y - 1 * 1.2, color: kind === 'boss' ? 'gold' : KINDS[kind].color as 'red', big: true, eid: i + 1, ekind: kind, fire: false }));
  return { t, wave: 1, lull: 0, enemies: alive ? cast.map(([k, x, y], i) => enemy(i, k, x, y - t * 1.2)) : [], fx } as unknown as TdSnapshot;
}
function draw(t: number) {
  const s = snap(t), dt = last < 0 ? 0 : Math.max(0, t - last); last = t;
  if (t === 0) layer.update({ ...s, fx: [{ id: 1, t0: 0, life: 0, kind: 'text', x: 0, y: 0, text: '', color: '' }] } as TdSnapshot, v, 0, () => {}); // prime fx history
  layer.update(s, v, dt, () => {});
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#5e4632'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 300; i++) g.fillRect((i * 97) % W, (i * 57) % H, 3, 3);
  layer.drawGround(g, v, t); layer.draw(g, s, v, t, () => {}); layer.drawGibs(g, v, t);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#fff'; g.font = '600 18px system-ui'; g.fillText(`t = ${t.toFixed(2)} s`, 16, 28);
}
const w = window as unknown as { __draw: (t: number) => void; __ready: boolean };
layer.loaded.then(async () => { await layer.prepare(v); w.__draw = draw; w.__ready = true; });
