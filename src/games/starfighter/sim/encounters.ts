import type { EnemyView } from './types';
import { clamp } from './director';
export const MAX_ENEMIES = 80, MAX_BOLTS = 160;
/** Terrain scroll speed (units/s). Ground units ride the terrain at exactly this speed; the renderer scrolls scenery with it. */
export const GROUND_SPEED = 22;
/** Spawn beyond the widest supported field; enter along a continuous flight path. */
export function entryFor(index: number, count: number, pattern: number, center: number): NonNullable<EnemyView['entry']> {
  const lane = index - (count - 1) / 2;
  const toX = clamp(center + lane * 9, -43, 43);
  const toY = pattern === 0 ? -12 - Math.abs(lane) * 4 : pattern === 1 ? -20 - index * 2.5 : -16;
  const side = pattern === 1 ? -1 : 1;
  return { fromX: pattern === 0 ? toX : side * (220 + index * 12), fromY: pattern === 0 ? -500 - index * 12 : -60-index*8,
    toX, toY, duration: 6.5 + index * 0.12 };
}
/** Elite wings fly a high line across the far field from one flank to the other, then leave. */
export function eliteEntry(index: number, side: number, y: number): NonNullable<EnemyView['entry']> {
  return { fromX: side * (95 + index * 9), fromY: y - index * 1.5, toX: -side * (95 - index * 9), toY: y - index * 1.5, duration: 13 };
}
/** Formation key for targeting: boss batteries group with their flagship. */
export const groupOf = (e: EnemyView) => e.parentId ?? (e.kind === 'boss' ? e.id : e.formation ?? -e.id);
export function advanceEntry(e: EnemyView): boolean {
  if (!e.entry || e.age >= e.entry.duration) return false;
  const u = clamp(e.age/e.entry.duration, 0, 1), ease = 1-Math.pow(1-u,3);
  e.x = e.entry.fromX + (e.entry.toX-e.entry.fromX)*ease;
  e.y = e.entry.fromY + (e.entry.toY-e.entry.fromY)*ease;
  return true;
}
export function inCombat(e: EnemyView): boolean {
  // Ground units are visible further ahead (they ride the faster terrain), so they become targetable earlier.
  return e.hp > 0 && e.y >= (e.ground ? -60 : -28) && e.y < 72 && Math.abs(e.x) < 55;
}
/** Seconds between volleys by enemy kind; the sim also waits for a beat before releasing. */
export const FIRE_EVERY: Record<EnemyView['kind'], number> = { boss: 2.2, tank: 3, turret: 3.4, weaver: 3.6, gunner: 3.8, armor: 3.8, drone: 4.5 };
/** Only designated gunners in a formation fire, keeping density moderate and readable. */
export const firesInFormation = (kind: EnemyView['kind'], index: number) => kind === 'armor' ? index % 2 === 0 : index % 3 === 1;
/** Small, slow, readable patterns: aimed singles, narrow fans, and a rotating flagship fan with petals. */
export function bulletPattern(e: EnemyView, shipX: number, shipY: number): Array<{ vx: number; vy: number; kind: 'pink' | 'amber' }> {
  const aimed = Math.atan2(shipY-e.y, shipX-e.x), shots: Array<{vx:number;vy:number;kind:'pink'|'amber'}> = [];
  const add = (angle:number,speed:number,kind:'pink'|'amber') => shots.push({vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,kind});
  const fan = (n:number,spread:number,speed:number,kind:'pink'|'amber') => { for(let i=0;i<n;i++) add(aimed+(i-(n-1)/2)*spread,speed,kind); };
  if(e.kind==='boss') {
    for(let i=0;i<7;i++) add(Math.PI*0.5 + (i-3)*0.2 + Math.sin(e.age*0.6)*0.3, 16,'pink');
    for(let i=0;i<6;i++) add(i*Math.PI/3+e.age*0.35,14,'amber');
  } else if(e.kind==='tank') fan(2,0.1,20,'amber');
  else if(e.kind==='turret') fan(3,0.22,16,'amber');
  else if(e.kind==='weaver') fan(3,0.26,17,'pink');
  else if(e.kind==='gunner' || e.kind==='armor') fan(3,0.18,18,'pink');
  else add(aimed,18,'pink');
  return shots;
}
/** A slow, wide wall; choreography opens a gate in it where the route will be. */
export function wallPattern(e: EnemyView, shipX: number, shipY: number): Array<{ vx: number; vy: number; kind: 'pink' | 'amber' }> {
  const aimed = Math.atan2(shipY-e.y, shipX-e.x);
  return Array.from({ length: 13 }, (_, i) => { const a = aimed + (i - 6) * 0.085; return { vx: Math.cos(a) * 15, vy: Math.sin(a) * 15, kind: 'amber' as const }; });
}
