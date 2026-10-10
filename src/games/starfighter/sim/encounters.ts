import type { EnemyView } from './types';
import { clamp } from './director';
export const MAX_ENEMIES = 80, MAX_BOLTS = 640;
/** Spawn beyond the widest supported field; enter along a continuous flight path. */
export function entryFor(index: number, count: number, pattern: number, center: number): NonNullable<EnemyView['entry']> {
  const lane = index - (count - 1) / 2;
  const toX = clamp(center + lane * 9, -43, 43);
  const toY = pattern === 0 ? -12 - Math.abs(lane) * 4 : pattern === 1 ? -20 - index * 2.5 : -16;
  const side = pattern === 1 ? -1 : 1;
  return { fromX: pattern === 0 ? toX : side * (220 + index * 12), fromY: pattern === 0 ? -500 - index * 12 : -60-index*8,
    toX, toY, duration: 6.5 + index * 0.12 };
}
export function advanceEntry(e: EnemyView): boolean {
  if (!e.entry || e.age >= e.entry.duration) return false;
  const u = clamp(e.age/e.entry.duration, 0, 1), ease = 1-Math.pow(1-u,3);
  e.x = e.entry.fromX + (e.entry.toX-e.entry.fromX)*ease;
  e.y = e.entry.fromY + (e.entry.toY-e.entry.fromY)*ease;
  return true;
}
export function inCombat(e: EnemyView): boolean {
  return e.hp > 0 && e.y >= -28 && e.y < 72 && Math.abs(e.x) < 55;
}
/** Fans, paired aimed streams, and rotating petals share a bounded projectile budget. */
export function bulletPattern(e: EnemyView, shipX: number, shipY: number): Array<{ vx: number; vy: number; kind: 'pink' | 'amber' }> {
  const aimed = Math.atan2(shipY-e.y, shipX-e.x), shots: Array<{vx:number;vy:number;kind:'pink'|'amber'}> = [];
  const add = (angle:number,speed:number,kind:'pink'|'amber') => shots.push({vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,kind});
  if(e.kind==='boss') {
    for(let i=0;i<17;i++) add(Math.PI*0.5 + (i-8)*0.13 + Math.sin(e.age*0.6)*0.22, 20+(i%2)*3,'pink');
    for(let i=0;i<12;i++) add(i*Math.PI/6+e.age*0.35,18,'amber');
  } else if(e.kind==='tank') {
    for(let i=-2;i<=2;i++) add(aimed+i*0.065,32,'amber');
  } else if(e.kind==='turret') {
    for(let i=-4;i<=4;i++) add(aimed+i*0.13,23,'amber');
  } else if(e.kind==='weaver') {
    for(let i=-2;i<=2;i++) add(aimed+i*0.18,22,'pink');
  } else if(e.kind==='gunner' || e.kind==='armor') {
    for(let i=-2;i<=2;i++) add(aimed+i*0.11,26,'pink');
  } else { add(aimed-0.05,25,'pink');add(aimed+0.05,25,'pink'); }
  return shots;
}
