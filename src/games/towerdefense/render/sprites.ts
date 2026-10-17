// Procedural sprites for Dynamo Defense. All sizes are in field units scaled by `k` (px per unit).
import type { Element, TowerKind, Weapon } from '../sim/defs';
import type { EnemyView, TowerView } from '../sim/types';

export const COL: Record<Element | 'gold', string> = { blue: '#4aa8ff', red: '#ff5a3c', purple: '#b46cff', gold: '#ffd24a' };
export const DARK: Record<Element | 'gold', string> = { blue: '#123a66', red: '#5e1a10', purple: '#3a1a66', gold: '#5e4a10' };
export const LIGHT: Record<Element | 'gold', string> = { blue: '#bfe0ff', red: '#ffc4b0', purple: '#e6d0ff', gold: '#fff2b0' };
export const WEAPON_COLOR: Record<Weapon, string> = { gatling: COL.blue, flame: COL.red, rail: COL.purple };
const TAU = Math.PI * 2;

/** `#rgb` / `#rrggbb` -> `rgba(...)` with alpha `a` (anything else is returned unchanged). */
export function rgba(color: string, a: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

const glowCache = new Map<string, HTMLCanvasElement>();
/** Soft radial glow sprite (cached per colour). Draw with drawImage scaled to 2r. */
export function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.35, rgba(color, 0.67)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
export function glowAt(g: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, a = 1) {
  if (r <= 0 || a <= 0) return;
  g.globalAlpha = Math.min(1, a); g.drawImage(glow(color), x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
}
function poly(g: CanvasRenderingContext2D, n: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath();
}

/** One enemy at (x, y) px. `heading` = travel direction (radians, canvas convention), `t` = seconds for animation. */
export function drawEnemy(g: CanvasRenderingContext2D, e: EnemyView, x: number, y: number, k: number, heading: number, t: number) {
  const el = e.gold ? 'gold' : e.element, c = COL[el], d = DARK[el], l = LIGHT[el];
  const r = e.radius * k, bob = Math.sin(t * 6 + e.id) * r * 0.06;
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(x, y + r * 0.75, r * 0.95, r * 0.38, 0, 0, TAU); g.fill();
  g.save(); g.translate(x, y + bob);
  switch (e.kind) {
    case 'mini': { // little drone: body + two rotors
      g.rotate(heading);
      g.strokeStyle = l; g.lineWidth = Math.max(1, r * 0.25);
      const s = t * 40 + e.id;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(0, sx * r * 0.9 - Math.cos(s) * r * 0.5); g.lineTo(0, sx * r * 0.9 + Math.cos(s) * r * 0.5); g.stroke(); }
      g.fillStyle = c; g.beginPath(); g.arc(0, 0, r * 0.75, 0, TAU); g.fill();
      g.fillStyle = l; g.beginPath(); g.arc(r * 0.25, 0, r * 0.28, 0, TAU); g.fill();
      break;
    }
    case 'dart': {
      g.rotate(heading);
      g.fillStyle = c; g.beginPath(); g.moveTo(r * 1.4, 0); g.lineTo(-r, r * 0.85); g.lineTo(-r * 0.45, 0); g.lineTo(-r, -r * 0.85); g.closePath(); g.fill();
      g.fillStyle = l; g.beginPath(); g.moveTo(r * 1.1, 0); g.lineTo(-r * 0.2, r * 0.3); g.lineTo(-r * 0.2, -r * 0.3); g.closePath(); g.fill();
      glowAt(g, c, -r * 1.1, 0, r * 0.9, 0.6);
      break;
    }
    case 'brute': { // hulking block with horns and eyes
      g.fillStyle = d; g.beginPath(); g.roundRect(-r, -r * 0.85, r * 2, r * 1.75, r * 0.45); g.fill();
      g.fillStyle = c; g.beginPath(); g.roundRect(-r * 0.86, -r * 0.8, r * 1.72, r * 1.45, r * 0.4); g.fill();
      g.fillStyle = l;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * r * 0.55, -r * 0.7); g.lineTo(sx * r * 1.05, -r * 1.35); g.lineTo(sx * r * 0.85, -r * 0.55); g.closePath(); g.fill(); }
      g.fillStyle = '#fff6c0'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.32, -r * 0.2, r * 0.15, 0, TAU); g.fill(); }
      g.fillStyle = d; g.fillRect(-r * 0.4, r * 0.25, r * 0.8, r * 0.14);
      break;
    }
    case 'charger': { // rhino wedge, speed lines while charging
      g.rotate(heading);
      if (e.charging) { g.strokeStyle = l + '99'; g.lineWidth = Math.max(1, r * 0.12); for (const sy of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(-r * 1.3, sy * r); g.lineTo(-r * 2.4 - Math.sin(t * 30 + sy) * r * 0.4, sy * r); g.stroke(); } }
      g.fillStyle = d; g.beginPath(); g.moveTo(r * 1.3, 0); g.lineTo(-r, r); g.lineTo(-r * 1.2, 0); g.lineTo(-r, -r); g.closePath(); g.fill();
      g.fillStyle = c; g.beginPath(); g.moveTo(r * 1.05, 0); g.lineTo(-r * 0.8, r * 0.75); g.lineTo(-r * 0.95, 0); g.lineTo(-r * 0.8, -r * 0.75); g.closePath(); g.fill();
      g.fillStyle = l; g.beginPath(); g.moveTo(r * 1.6, 0); g.lineTo(r * 0.7, r * 0.22); g.lineTo(r * 0.7, -r * 0.22); g.closePath(); g.fill();
      if (e.charging) glowAt(g, c, 0, 0, r * 2, 0.35);
      break;
    }
    case 'armor': { // bastion: layered hexagon
      g.fillStyle = d; poly(g, 6, r * 1.05, t * 0.2); g.fill();
      g.fillStyle = c; poly(g, 6, r * 0.82, t * 0.2); g.fill();
      g.strokeStyle = l; g.lineWidth = Math.max(1, r * 0.12); poly(g, 6, r * 0.55, t * 0.2 + Math.PI / 6); g.stroke();
      g.fillStyle = l; g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
      break;
    }
    case 'carrier': { // big hull with pod bays
      g.rotate(heading);
      g.fillStyle = d; g.beginPath(); g.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, r, r * 0.7, 0, 0, TAU); g.fill();
      for (let i = 0; i < 3; i++) {
        const px = (i - 1) * r * 0.55, pulse = 0.5 + 0.5 * Math.sin(t * 4 + i);
        g.fillStyle = DARK.blue; g.beginPath(); g.arc(px, 0, r * 0.22, 0, TAU); g.fill();
        g.fillStyle = COL.blue; g.globalAlpha = pulse; g.beginPath(); g.arc(px, 0, r * 0.14, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
      break;
    }
    case 'prism': { // spinning crystal: current colour, outlined in the colour it shifts to next
      const spin = t * 1.5 + e.id;
      if (e.next && e.shiftIn < 1.2) { g.strokeStyle = COL[e.next]; g.lineWidth = Math.max(1.5, r * 0.22); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); poly(g, 4, r * 1.35, spin); g.stroke(); g.globalAlpha = 1; }
      g.fillStyle = d; poly(g, 4, r * 1.15, spin); g.fill();
      g.fillStyle = c; poly(g, 4, r * 0.95, spin); g.fill();
      g.fillStyle = l; poly(g, 4, r * 0.42, -spin * 1.5); g.fill();
      break;
    }
    case 'boss': { // Goliath art stays; the phase colour drives the segmented armour
      const sc = e.exposed ? '#7dffb0' : COL[e.element];
      if (e.telegraph || e.exposed) {
        g.strokeStyle = sc; g.lineWidth = Math.max(2, r * 0.15); g.globalAlpha = e.exposed ? 0.9 : 0.4 + 0.4 * Math.sin(t * 16);
        g.beginPath(); g.arc(0, 0, r * 1.9, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      glowAt(g, sc, 0, 0, r * 2.4, 0.35);
      g.fillStyle = '#3a2e10'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.fillStyle = COL.gold; g.beginPath(); g.arc(0, 0, r * 0.78, 0, TAU); g.fill();
      g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(0, 0, r * 0.32 + Math.sin(t * 5) * r * 0.05, 0, TAU); g.fill();
      g.lineWidth = Math.max(2, r * 0.22); g.strokeStyle = sc;
      for (let i = 0; i < 6; i++) { const a = t * 0.8 + (i / 6) * TAU; g.beginPath(); g.arc(0, 0, r * 1.3, a, a + TAU / 9); g.stroke(); }
      if (e.next && e.shiftIn < 1.5) { // announce the next phase colour
        g.strokeStyle = COL[e.next]; g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 18); g.lineWidth = Math.max(1.5, r * 0.12);
        g.beginPath(); g.arc(0, 0, r * 1.62, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      break;
    }
  }
  if (e.hurt > 0) { g.globalAlpha = Math.min(1, e.hurt / 0.12) * 0.35; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.fill(); g.globalAlpha = 1; }
  g.restore();
  // HP bar on damaged heavies
  if (e.kind !== 'mini' && e.kind !== 'dart' && e.hp < e.maxHp) {
    const w = Math.max(14, r * 2.2), h = Math.max(3, k * 0.6), by = y - r * (e.kind === 'boss' ? 1.9 : 1.45) - h;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - w / 2 - 1, by - 1, w + 2, h + 2);
    g.fillStyle = e.gold ? COL.gold : '#7dffb0'; g.fillRect(x - w / 2, by, w * Math.max(0, e.hp / e.maxHp), h);
  }
}

/** A tower on its pad at (x, y) px. */
export function drawTower(g: CanvasRenderingContext2D, tw: TowerView, x: number, y: number, k: number, t: number, grid: number) {
  const r = 3.4 * k, flash = Math.max(0, 1 - (t - tw.firedAt) / 0.25);
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(0, r * 0.55, r * 1.05, r * 0.42, 0, 0, TAU); g.fill();
  g.fillStyle = '#2c3446'; poly(g, 6, r, Math.PI / 6); g.fill();
  g.strokeStyle = '#46526c'; g.lineWidth = Math.max(1, k * 0.3); poly(g, 6, r, Math.PI / 6); g.stroke();
  const on = grid > 0.05;
  if (tw.kind === 'tesla') {
    for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? '#8a6a3a' : '#c49a52'; g.fillRect(-r * 0.32, -r * (0.2 + i * 0.32), r * 0.64, r * 0.22); }
    g.fillStyle = '#3a4258'; g.fillRect(-r * 0.12, -r * 1.25, r * 0.24, r * 0.4);
    const orb = r * (0.34 + 0.12 * tw.charge);
    if (on) glowAt(g, COL.blue, 0, -r * 1.35, r * (1 + tw.charge + flash * 1.5), 0.55 + flash * 0.4);
    g.fillStyle = on ? LIGHT.blue : '#5a6a80'; g.beginPath(); g.arc(0, -r * 1.35, orb, 0, TAU); g.fill();
  } else if (tw.kind === 'flamer') { // squat fuel tank and a flared nozzle; the renderer draws its cone
    g.fillStyle = '#4a3a36'; g.beginPath(); g.arc(0, 0, r * 0.66, 0, TAU); g.fill();
    g.rotate(tw.angle);
    g.fillStyle = '#6a5048'; g.fillRect(-r * 0.22, -r * 0.95, r * 0.44, r * 0.7);
    g.fillStyle = '#8a6a50'; g.beginPath(); g.moveTo(-r * 0.22, -r * 0.95); g.lineTo(-r * 0.38, -r * 1.2); g.lineTo(r * 0.38, -r * 1.2); g.lineTo(r * 0.22, -r * 0.95); g.closePath(); g.fill();
    if (on) glowAt(g, '#ff9a50', 0, -r * 0.1, r * (0.5 + flash * 0.5), 0.4 + flash * 0.4);
  } else {
    g.strokeStyle = '#5a6278'; g.lineWidth = Math.max(1, k * 0.35);
    for (const a of [-0.5, 0.5, Math.PI]) { g.beginPath(); g.moveTo(0, -r * 0.5); g.lineTo(Math.sin(a) * r * 0.7, Math.cos(a) * r * 0.5); g.stroke(); }
    g.translate(0, -r * 0.75); g.rotate(tw.angle + t * 0.3 * (on ? 1 : 0));
    if (on) glowAt(g, COL.purple, 0, 0, r * (0.9 + tw.charge * 0.8 + flash), 0.45 + flash * 0.5);
    g.fillStyle = on ? COL.purple : '#55506a'; poly(g, 4, r * 0.55, 0); g.fill();
    g.fillStyle = LIGHT.purple; poly(g, 4, r * 0.25, 0); g.fill();
  }
  g.restore();
  // level pips
  for (let i = 0; i < tw.level; i++) {
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.arc(x + (i - (tw.level - 1) / 2) * k * 1.3, y + r * 1.05, Math.max(1.5, k * 0.42), 0, TAU); g.fill();
  }
}

/** Dynamo base + turret. `spin` = coil rotation (radians), `swapK` 0..1 barrel deployed. */
export function drawBase(g: CanvasRenderingContext2D, o: {
  x: number; y: number; k: number; t: number; spin: number; grid: number; color: string; hpFrac: number; hurt: number;
  weapon: Weapon; aim: number; swapK: number; muzzle: number; overdrive: boolean; railCharge: number; flaming: boolean;
}) {
  const { x, y, k, t } = o, R = 6 * k;
  g.save(); g.translate(x, y);
  if (o.overdrive) glowAt(g, '#ff9a2a', 0, 0, R * (2.4 + Math.sin(t * 14) * 0.2), 0.55);
  glowAt(g, o.color, 0, 0, R * (1.2 + o.grid * 0.8), 0.25 + 0.3 * Math.min(1, o.grid));
  // platform + HP ring
  g.fillStyle = '#1c2230'; g.beginPath(); g.arc(0, 0, R * 1.15, 0, TAU); g.fill();
  g.lineWidth = Math.max(3, k * 0.9); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.stroke();
  const hc = o.hpFrac > 0.5 ? '#7dffb0' : o.hpFrac > 0.25 ? '#ffd24a' : '#ff5a3c';
  g.strokeStyle = hc; g.beginPath(); g.arc(0, 0, R * 1.08, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, o.hpFrac)); g.stroke();
  // spinning dynamo coils
  for (let i = 0; i < 8; i++) {
    const a = o.spin + (i / 8) * TAU;
    g.fillStyle = i % 2 ? '#b07a3a' : '#d49a52';
    g.save(); g.rotate(a); g.fillRect(R * 0.62, -R * 0.12, R * 0.3, R * 0.24); g.restore();
  }
  g.fillStyle = '#2a3242'; g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
  g.fillStyle = o.color; g.globalAlpha = 0.5 + 0.5 * Math.min(1, o.grid); g.beginPath(); g.arc(0, 0, R * 0.4, 0, TAU); g.fill(); g.globalAlpha = 1;
  // turret
  g.rotate(o.aim);
  const wc = WEAPON_COLOR[o.weapon], ext = o.swapK;
  if (o.weapon === 'gatling') {
    for (const sx of [-1, 0, 1]) { const ph = Math.sin(o.spin * 3 + sx * 2.1); g.fillStyle = sx === 0 ? '#9aa6bb' : '#6c778c'; g.fillRect(sx * R * 0.17 * (0.7 + 0.3 * ph) - R * 0.07, -R * (0.5 + 0.75 * ext), R * 0.14, R * 0.75 * ext + R * 0.2); }
  } else if (o.weapon === 'flame') {
    g.fillStyle = '#6c5850'; g.fillRect(-R * 0.18, -R * (0.45 + 0.6 * ext), R * 0.36, R * 0.6 * ext + R * 0.2);
    g.fillStyle = wc; g.beginPath(); g.moveTo(-R * 0.26, -R * (0.45 + 0.6 * ext)); g.lineTo(R * 0.26, -R * (0.45 + 0.6 * ext)); g.lineTo(R * 0.16, -R * (0.6 + 0.6 * ext)); g.lineTo(-R * 0.16, -R * (0.6 + 0.6 * ext)); g.closePath(); g.fill();
    if (o.flaming) glowAt(g, '#ffb050', 0, -R * (0.7 + 0.6 * ext), R * 0.5, 0.9);
  } else {
    for (const sx of [-1, 1]) { g.fillStyle = '#6c6488'; g.fillRect(sx * R * 0.16 - R * 0.06, -R * (0.5 + 1.0 * ext), R * 0.12, R * 1.0 * ext + R * 0.2); }
    g.fillStyle = wc; g.globalAlpha = 0.4 + 0.6 * o.railCharge;
    g.fillRect(-R * 0.08, -R * (0.45 + 0.95 * ext), R * 0.16, R * 0.95 * ext); g.globalAlpha = 1;
  }
  g.fillStyle = '#3c465c'; g.beginPath(); g.arc(0, 0, R * 0.36, 0, TAU); g.fill();
  g.fillStyle = wc; g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU); g.fill();
  if (o.muzzle > 0) glowAt(g, '#ffe8a0', 0, -R * (1.35 * ext + 0.3), R * 0.6 * o.muzzle, o.muzzle);
  g.restore();
  if (o.hurt < 0.4) { glowAt(g, '#ff3020', x, y, R * 2.2, (0.4 - o.hurt) * 1.6); }
}

export const TOWER_ICON_COLOR: Record<TowerKind, string> = { tesla: COL.blue, flamer: COL.red, lens: COL.purple };
