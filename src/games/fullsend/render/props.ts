// Set-piece props for the Full Send mockup, drawn into the low-res buffer in the warm-up's pixel style.
import type { BiomeId } from '../../warmup/sim/terrain';
import { hash01 } from '../../warmup/sim/terrain';
import type { G } from '../../warmup/render/biomes';
import type { ChaserKind } from '../sim/tour';

const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

/** One column of a canyon: dark walls fading down to a biome floor (lava, glacier water, river). */
export function drawCanyonFloor(g: G, x: number, topY: number, floorY: number, H: number, biome: BiomeId, t: number, dd: number) {
  const lava = biome === 'volcano', ice = biome === 'snow', sky = biome === 'sky' || biome === 'moon';
  if (sky) { // nothing below but sky (sky islands) or a crater
    if (biome === 'moon') { rect(g, '#2a2a36', x, floorY + 6, 1, H); }
    return;
  }
  const wall = lava ? '#2a1414' : ice ? '#7fb6d8' : '#4a3426';
  const deep = lava ? '#1a0a0a' : ice ? '#3f7fa8' : '#2a1d16';
  for (let y = Math.round(topY); y < H; y++) {
    const k = Math.min(1, (y - topY) / Math.max(1, floorY - topY));
    g.fillStyle = k < 0.5 ? wall : deep; g.fillRect(x, y, 1, 1);
    if (y > floorY) break;
  }
  const fy = Math.round(floorY);
  const surf = lava ? (Math.sin(dd * 0.7 + t * 3) > 0.6 ? '#ffd23b' : '#ff6a1a') : ice ? '#bfe9ff' : '#4aa3d8';
  rect(g, surf, x, fy, 1, 2);
  rect(g, lava ? '#c8340f' : ice ? '#5fa8d0' : '#2f7fb8', x, fy + 2, 1, H - fy);
  if (lava && hash01(Math.floor(dd) * 13 + Math.floor(t * 2)) < 0.03) rect(g, '#ffe066', x, fy - 3, 1, 2); // bubbles
}

/** A flooded tunnel: water from the road up to a rock ceiling. */
export function drawWater(g: G, x0: number, x1: number, roadY: number, ceilY: number, H: number, t: number) {
  const a = Math.max(-10, x0), b = Math.min(g.canvas.width + 10, x1);
  if (b <= a) return;
  g.globalAlpha = 0.38; g.fillStyle = '#1f6fd0'; g.fillRect(Math.round(a), Math.round(ceilY), Math.round(b - a), Math.round(roadY - ceilY + 6));
  g.globalAlpha = 1;
  g.fillStyle = '#34303f'; g.fillRect(Math.round(a), 0, Math.round(b - a), Math.round(ceilY));
  g.fillStyle = '#4c465c';
  for (let x = Math.round(a); x < b; x += 3) g.fillRect(x, Math.round(ceilY) - 2 - Math.round(hash01(x * 7) * 3), 3, 3);
  g.fillStyle = '#d8f6ffaa';
  for (let i = 0; i < 26; i++) {
    const x = a + hash01(i * 3 + 1) * (b - a), y = roadY - ((t * (12 + hash01(i) * 10) + hash01(i * 3 + 2) * 60) % Math.max(10, roadY - ceilY));
    g.fillRect(Math.round(x + Math.sin(t * 2 + i) * 2), Math.round(y), 1, 1);
  }
  if (x1 > -20 && x1 < g.canvas.width + 20) { rect(g, '#ffffffaa', x1 - 1, ceilY, 2, roadY - ceilY); } // the surface exit
}

const TAU = Math.PI * 2;
/** Loop styles per biome: track surface, structure, accent. */
const LOOP_STYLE: Partial<Record<BiomeId, { deck: string; side: string; rail: string; accent: string; kind: 'vine' | 'lacquer' | 'steel' | 'ice' }>> = {
  jungle: { deck: '#7a5a34', side: '#4a3420', rail: '#2f6b2a', accent: '#e8463a', kind: 'vine' },
  market: { deck: '#b8323a', side: '#7a1a22', rail: '#ffcf5a', accent: '#ffe066', kind: 'lacquer' },
  snow: { deck: '#dff3ff', side: '#8cc8e8', rail: '#ffffff', accent: '#7af0ff', kind: 'ice' },
};
const STEEL = { deck: '#5e6678', side: '#3a4052', rail: '#c6ccd6', accent: '#ffd23b', kind: 'steel' as const };

/** A giant loop of radius `r` px around (cx, cy), drawn as a banked track ribbon with supports. */
export function drawLoop(g: G, cx: number, cy: number, r: number, biome: BiomeId, t: number, roadY: number) {
  const st = LOOP_STYLE[biome] ?? STEEL;
  // supports: an A-frame tower each side and a spine under the top
  g.strokeStyle = st.side; g.lineWidth = 2;
  const legs: Array<[number, number]> = [[-0.62, 1], [0.62, 1]];
  for (const [sx] of legs) {
    const ax = cx + sx * r * 1.25, top = cy - r * 0.15;
    g.beginPath(); g.moveTo(ax, roadY); g.lineTo(cx + sx * r * 0.96, top); g.stroke();
    g.beginPath(); g.moveTo(ax + sx * 10, roadY); g.lineTo(cx + sx * r * 0.99, cy + r * 0.25); g.stroke();
    g.lineWidth = 1;
    for (let k = 0.15; k < 0.95; k += 0.2) { // cross-bracing
      const y1 = roadY - (roadY - top) * k, y2 = roadY - (roadY - top) * (k + 0.2);
      const x1 = ax + (cx + sx * r * 0.96 - ax) * k, x2 = ax + sx * 10 + (cx + sx * r * 0.99 - ax - sx * 10) * (k + 0.2);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.lineWidth = 2;
  }
  g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy - r * 0.55); g.stroke();
  // the ribbon: shadowed underside, deck, rails, ties
  const ring = (rad: number, w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); };
  ring(r + 4, 3, st.side);
  ring(r + 1.5, 4, st.deck);
  ring(r - 1, 1, st.rail);
  ring(r + 4.5, 1, mixDark(st.side));
  for (let i = 0; i < 48; i++) { // ties / planks
    const a = (i / 48) * TAU, c = Math.cos(a), s = Math.sin(a);
    g.strokeStyle = i % 2 ? st.side : st.rail; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + c * (r - 0.5), cy + s * (r - 0.5)); g.lineTo(cx + c * (r + 3.5), cy + s * (r + 3.5)); g.stroke();
  }
  if (st.kind === 'vine') { // vines spiral round the ribbon, leaves, flowers and hanging creepers
    g.strokeStyle = '#3f8a3a'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i <= 200; i++) { const a = (i / 200) * TAU, rr = r + 1.5 + Math.sin(a * 22) * 3.2; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU + 0.05, rr = r + 1.5 + Math.sin(a * 22) * 3.2, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      rect(g, i % 3 ? '#5fbf3a' : '#2f7a2a', x - 1, y - 1, 3, 2);
      if (i % 7 === 0) rect(g, st.accent, x, y - 2, 2, 2);
    }
    for (let i = 0; i < 7; i++) { // creepers hanging inside the top half
      const a = Math.PI + 0.35 + (i / 6) * (Math.PI - 0.7), x0 = cx + Math.cos(a) * (r - 1), y0 = cy + Math.sin(a) * (r - 1);
      const len = 10 + hash01(i * 9) * 18, sway = Math.sin(t * 1.3 + i) * 2;
      g.strokeStyle = '#2f7a2a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + sway, y0 + len * 0.6, x0 + sway * 1.5, y0 + len); g.stroke();
      rect(g, '#5fbf3a', x0 + sway * 1.5 - 1, y0 + len - 1, 2, 2);
    }
  } else if (st.kind === 'lacquer') { // gold trim and swinging lanterns
    ring(r + 5.5, 1, st.rail);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.3 + (i / 8) * (Math.PI - 0.6), x0 = cx + Math.cos(a) * (r - 1), y0 = cy + Math.sin(a) * (r - 1), sw = Math.sin(t * 2 + i) * 1.5;
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + sw, y0 + 8); g.stroke();
      rect(g, '#e8463a', x0 + sw - 2, y0 + 8, 5, 6); rect(g, '#ffd23b', x0 + sw - 2, y0 + 8, 5, 1); rect(g, '#ffd23b', x0 + sw - 2, y0 + 13, 5, 1);
      g.globalAlpha = 0.25; rect(g, '#ffe066', x0 + sw - 4, y0 + 6, 9, 10); g.globalAlpha = 1;
    }
  } else { // chevrons on the deck and rivet lights
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + t * 0.0, x = cx + Math.cos(a) * (r + 1.5), y = cy + Math.sin(a) * (r + 1.5);
      rect(g, Math.floor(t * 6 + i) % 4 === 0 ? st.accent : st.rail, x - 0.5, y - 0.5, 1, 1);
    }
  }
}
const mixDark = (c: string) => c + 'aa';

/** Column `i` of a smash wall. `hit` = seconds since it was smashed (<0 = intact); `topple` = seconds since it fell over after a bounce. */
export function drawObstacle(g: G, x: number, roadY: number, biome: BiomeId, i: number, hit: number, topple: number) {
  const kind = biome === 'countryside' ? 'hay' : biome === 'market' ? 'stall' : biome === 'snow' ? 'ice' : biome === 'autumn' ? 'leaves' : biome === 'underwater' ? 'coral'
    : biome === 'sky' ? 'cloud' : biome === 'moon' ? 'rock' : 'crate';
  const col = { hay: ['#e8c85a', '#b8962e'], stall: ['#c8763a', '#7a4a22'], ice: ['#cfefff', '#8cc8e8'], leaves: ['#d97a2e', '#9a4a1a'], coral: ['#ff7a9a', '#c84a6a'],
    crate: ['#a86b3c', '#6e4424'], cloud: ['#ffffff', '#dfe6f5'], rock: ['#a8a8b4', '#6e6e7c'] }[kind];
  if (kind === 'cloud' && hit < 0) { // a stack of cloud puffs, bobbing
    g.save(); g.translate(Math.round(x), Math.round(roadY));
    if (topple >= 0) g.rotate(Math.min(Math.PI / 2, topple * 3));
    for (let j = 0; j < 4; j++) { const r = 6 + (j % 2) * 2; g.fillStyle = col[j % 2]; g.beginPath(); g.arc(Math.sin(i + j) * 2, -r - j * 8 + Math.sin(i * 3 + j) * 1.5, r, 0, Math.PI * 2); g.fill(); }
    g.restore(); return;
  }
  if (kind === 'rock' && hit < 0) { // a pile of moon rocks
    g.save(); g.translate(Math.round(x), Math.round(roadY));
    if (topple >= 0) g.rotate(Math.min(Math.PI / 2, topple * 3));
    poly(g, col[1], [[-6, 0], [-7, -10], [-2, -20], [5, -18], [7, -6], [5, 0]]);
    poly(g, col[0], [[-5, -2], [-5, -10], [-1, -18], [4, -16], [5, -7]]);
    rect(g, '#80808c', -2, -12, 2, 2); rect(g, '#80808c', 1, -6, 2, 2);
    g.restore(); return;
  }
  if (kind === 'hay') { drawHayColumn(g, x, roadY, i, hit, topple); return; }
  const h = 18 + (i % 3) * 4, w = 10;
  if (hit >= 0) { // debris flying forward and up
    for (let j = 0; j < 7; j++) {
      const vx = 30 + hash01(i * 13 + j) * 60, vy = 30 + hash01(i * 7 + j) * 50, age = Math.min(hit, 2.5);
      const px = x + vx * age, py = roadY - h / 2 - vy * age + 60 * age * age;
      if (py > roadY + 30) continue;
      rect(g, col[j % 2], px, py, 3, 3);
    }
    return;
  }
  g.save(); g.translate(Math.round(x), Math.round(roadY));
  if (topple >= 0) g.rotate(Math.min(Math.PI / 2, topple * 3));
  if (kind === 'stall') { rect(g, col[1], -w / 2, -h, w, h); for (let s2 = 0; s2 < 4; s2++) rect(g, s2 % 2 ? '#ffffff' : '#e8463a', -w / 2 - 1 + s2 * 3, -h - 3, 3, 3); rect(g, '#ffd23b', -2, -h + 4, 4, 3); }
  else if (kind === 'leaves') { g.fillStyle = col[0]; g.beginPath(); g.ellipse(0, -h * 0.35, w * 0.7, h * 0.4, 0, Math.PI, 0); g.fill(); rect(g, col[1], -3, -h * 0.5, 2, 2); }
  else if (kind === 'coral') { rect(g, col[0], -1, -h, 3, h); rect(g, col[0], -5, -h * 0.7, 2, h * 0.5); rect(g, col[1], 3, -h * 0.6, 2, h * 0.4); }
  else { rect(g, col[0], -w / 2, -h, w, h); rect(g, col[1], -w / 2, -h, w, 1); rect(g, col[1], -w / 2, -h, 1, h); rect(g, col[1], w / 2 - 1, -h, 1, h); g.strokeStyle = col[1]; g.lineWidth = 1; g.beginPath(); g.moveTo(-w / 2, -h); g.lineTo(w / 2, 0); g.stroke(); }
  g.restore();
}

const HAY = '#e8c85a', HAY_DK = '#b8962e', HAY_LT = '#f6e08a', TWINE = '#8a5a2a';
/** A stack of square hay bales (2–3 high, brick pattern). Smashed bales burst into flying straw. */
function drawHayColumn(g: G, x: number, roadY: number, i: number, hit: number, topple: number) {
  const n = 2 + (hash01(i * 3 + 7) > 0.55 ? 1 : 0), bw = 10, bh = 6;
  if (hit >= 0) {
    const age = Math.min(hit, 2.5);
    for (let j = 0; j < 16; j++) { // straw
      const vx = 20 + hash01(i * 13 + j) * 70, vy = 10 + hash01(i * 7 + j) * 60, px = x + vx * age, py = roadY - 8 - vy * age + 70 * age * age;
      if (py > roadY + 4) continue;
      const a = hash01(j * 5 + i) * Math.PI + age * 6;
      g.strokeStyle = j % 3 ? HAY : HAY_LT; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 3, py + Math.sin(a) * 3); g.stroke();
    }
    for (let j = 0; j < n; j++) { // tumbling half-bales
      const vx = 40 + hash01(i * 17 + j) * 40, vy = 30 + j * 20, px = x + vx * age, py = roadY - bh * (j + 1) - vy * age + 80 * age * age;
      if (py > roadY) continue;
      g.save(); g.translate(px, py); g.rotate(age * (4 + j)); rect(g, HAY, -3, -2, 6, 4); rect(g, TWINE, -1, -2, 1, 4); g.restore();
    }
    return;
  }
  g.save(); g.translate(Math.round(x), Math.round(roadY));
  if (topple >= 0) g.rotate(Math.min(Math.PI / 2, topple * 2.5));
  for (let j = 0; j < n; j++) {
    const off = j % 2 ? 2 : 0, y0 = -bh * (j + 1);
    rect(g, HAY_DK, -bw / 2 + off, y0, bw, bh);
    rect(g, HAY, -bw / 2 + off, y0, bw, bh - 1);
    rect(g, HAY_LT, -bw / 2 + off, y0, bw, 1);
    rect(g, TWINE, -bw / 2 + off + 2, y0, 1, bh); rect(g, TWINE, -bw / 2 + off + 7, y0, 1, bh);
    for (let k = 0; k < 4; k++) rect(g, HAY_DK, -bw / 2 + off + 1 + hash01(i * 31 + j * 7 + k) * 8, y0 + 1 + hash01(i * 11 + k) * 3, 1, 1);
    if (hash01(i + j * 5) > 0.5) { g.strokeStyle = HAY_LT; g.lineWidth = 0.6; g.beginPath(); g.moveTo(bw / 2 + off, y0 + 2); g.lineTo(bw / 2 + off + 2, y0 + 1); g.stroke(); }
  }
  g.restore();
}

/** Straw stuck to the rider and bike after a smash (rider-local coordinates). `amount` 0..1. */
export function drawHayOnRider(g: G, amount: number, t: number) {
  const spots: Array<[number, number]> = [[-3, -24], [1, -22], [-6, -18], [4, -16], [-9, -10], [7, -9], [-1, -12], [2, -26], [-12, -6], [10, -4], [-5, -14], [6, -20]];
  const n = Math.round(amount * spots.length);
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[i], wob = Math.sin(t * 9 + i * 2) * 0.6;
    rect(g, HAY, x - 1, y - 1, 3, 2);
    g.strokeStyle = i % 2 ? HAY_LT : HAY_DK; g.lineWidth = 0.7;
    for (let k = 0; k < 3; k++) { const a = -2.4 + k * 0.5 + wob * 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); g.stroke(); }
  }
  // a few strands shed behind
  for (let i = 0; i < Math.round(amount * 6); i++) {
    const age = (t * 1.7 + i * 0.37) % 1, px = -8 - age * 30, py = -14 + i * 2 + age * age * 14;
    g.globalAlpha = 1 - age; g.strokeStyle = HAY; g.lineWidth = 0.7; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 3, py + Math.sin(i + t * 8)); g.stroke();
  }
  g.globalAlpha = 1;
}

/** Whatever is chasing you in an Outrun. `giveUp` ≥ 0 = seconds since it gave up; `caught` = seconds since it last caught you. */
export function drawChaser(g: G, kind: ChaserKind, x: number, roadY: number, t: number, giveUp: number, caught: number) {
  g.save(); g.translate(Math.round(x), Math.round(roadY));
  if (kind === 'trex') { drawTrex(g, t, giveUp, caught); g.restore(); return; }
  if (kind === 'shark') { drawShark(g, t, giveUp, caught); g.restore(); return; }
  if (kind === 'wheel') { drawStoneWheel(g, t, giveUp, caught); g.restore(); return; }
  if (giveUp >= 0) g.translate(0, Math.min(30, giveUp * giveUp * 20));
  if (kind === 'avalanche') {
    for (let i = 0; i < 14; i++) {
      const a = hash01(i * 3), r = 6 + hash01(i * 5) * 9, bx = -40 + i * 4 + Math.sin(t * 3 + i) * 2, by = -r - a * 40 + Math.sin(t * 5 + i) * 2;
      g.fillStyle = i % 3 ? '#ffffff' : '#dfeefa'; g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'wave') {
    g.fillStyle = '#2f7fd0'; g.beginPath(); g.moveTo(-60, 0); g.lineTo(-60, -50); g.quadraticCurveTo(-10, -72, 8, -46); g.quadraticCurveTo(-6, -50, -8, -38); g.quadraticCurveTo(-4, -16, 6, 0); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; for (let i = 0; i < 8; i++) g.fillRect(Math.round(-6 + Math.sin(t * 6 + i) * 3 + i), Math.round(-50 + i * 2), 2, 2);
  } else {
    const r = 16; g.rotate(t * 6);
    g.fillStyle = '#7a7480'; g.beginPath(); g.arc(0, -r, r, 0, Math.PI * 2); g.fill();
    rect(g, '#5a5460', -8, -r - 3, 6, 4); rect(g, '#5a5460', 3, -r + 5, 5, 3);
  }
  g.restore();
}

type Pt = [number, number];
const poly = (g: G, c: string, pts: Pt[]) => { g.fillStyle = c; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); };
const seg = (g: G, c: string, w: number, a: Pt, b: Pt) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.lineCap = 'butt'; };
const rot = ([px, py]: Pt, [ox, oy]: Pt, a: number): Pt => { const c = Math.cos(a), s = Math.sin(a); return [ox + (px - ox) * c - (py - oy) * s, oy + (px - ox) * s + (py - oy) * c]; };

/** A running T. rex, ~80 px tall, facing right (toward the rider). Feet at y = 0. */
export function drawTrex(g: G, t: number, giveUp: number, caught: number) {
  const C = { skin: '#557d2f', dark: '#355a1c', light: '#7aa548', belly: '#d8cf92', stripe: '#3e6522', mouth: '#7a1414', claw: '#efe6c8' };
  const run = t * 9, bob = Math.abs(Math.sin(run)) * 2.5;
  const lunge = caught < 0.8 ? Math.sin((caught / 0.8) * Math.PI) : 0;
  if (giveUp >= 0) { // trips, faceplants and slides to a stop
    const k = Math.min(1, giveUp / 0.7);
    g.translate(giveUp * 6, 0); g.rotate(k * 0.9); g.translate(0, k * 6);
  }
  g.translate(0, -bob);
  const legPose = (ph: number): { hip: Pt; knee: Pt; ankle: Pt; toe: Pt } => {
    const hip: Pt = [-2, -40], a1 = 0.55 * Math.sin(ph) + 0.15;
    const knee: Pt = [hip[0] + Math.sin(a1) * 17, hip[1] + Math.cos(a1) * 17];
    const a2 = a1 - 1.0 - 0.25 * Math.max(0, Math.cos(ph));
    const ankle: Pt = [knee[0] + Math.sin(a2) * 14, knee[1] + Math.cos(a2) * 14];
    const lift = Math.max(0, -Math.cos(ph)) * 5;
    const ank: Pt = [ankle[0], Math.min(-5, ankle[1] - lift) + bob];
    return { hip, knee, ankle: ank, toe: [ank[0] + 11, Math.min(0, ank[1] + 5) + bob * 0] };
  };
  const leg = (ph: number, skin: string, dark: string) => {
    const p = legPose(ph);
    seg(g, dark, 4, p.knee, p.ankle);                 // shin
    seg(g, dark, 3, p.ankle, p.toe);                  // foot
    for (let k = 0; k < 3; k++) rect(g, C.claw, p.toe[0] - 1 + k * 2 - 2, p.toe[1] - 1, 1, 2);
    g.fillStyle = skin; g.beginPath(); g.ellipse((p.hip[0] + p.knee[0]) / 2, (p.hip[1] + p.knee[1]) / 2, 7, 11, -Math.atan2(p.knee[0] - p.hip[0], p.knee[1] - p.hip[1]), 0, Math.PI * 2); g.fill(); // thigh
  };
  // far leg (darker) behind the body
  leg(run + Math.PI, C.dark, '#25400f');
  // tail: a long taper that swings with the stride
  const sw = Math.sin(run) * 3;
  poly(g, C.skin, [[-10, -50], [-34, -54 + sw * 0.4], [-58, -55 + sw], [-72, -53 + sw * 1.4], [-60, -49 + sw], [-34, -43 + sw * 0.4], [-10, -36]]);
  poly(g, C.dark, [[-34, -43 + sw * 0.4], [-60, -49 + sw], [-72, -53 + sw * 1.4], [-58, -51 + sw], [-34, -46 + sw * 0.4]]);
  // body
  g.fillStyle = C.skin; g.beginPath(); g.ellipse(0, -46, 20, 13, -0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.belly; g.beginPath(); g.ellipse(5, -40, 13, 6, -0.3, 0, Math.PI); g.fill();
  g.fillStyle = C.light; g.beginPath(); g.ellipse(-3, -54, 13, 3, -0.22, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 5; k++) poly(g, C.stripe, [[-14 + k * 6, -55 + k * 1.2], [-11 + k * 6, -56 + k * 1.2], [-9 + k * 6, -49 + k * 1.2]]); // back stripes
  // neck
  poly(g, C.skin, [[8, -55], [18, -66], [28, -64], [20, -48], [12, -44]]);
  poly(g, C.belly, [[16, -50], [24, -62], [26, -60], [20, -47]]);
  // head (lunges forward when it catches you)
  g.save(); g.translate(lunge * 8, lunge * 3); g.rotate(-lunge * 0.15);
  const jaw = 0.25 + Math.max(0, Math.sin(t * 5)) * 0.25 + lunge * 0.35;
  const hinge: Pt = [22, -66];
  // lower jaw (rotates open about the hinge)
  const lj: Pt[] = [[20, -66], [46, -64], [47, -61], [26, -58], [19, -61]].map((p) => rot(p as Pt, hinge, jaw));
  poly(g, C.mouth, [hinge, rot([44, -66], hinge, 0), rot([44, -63], hinge, jaw)]);
  poly(g, C.dark, lj);
  for (let k = 0; k < 6; k++) { const tp = rot([25 + k * 3.6, -64], hinge, jaw); poly(g, C.claw, [tp, [tp[0] + 1.5, tp[1]], [tp[0] + 0.7, tp[1] - 2.2]]); }
  // skull
  poly(g, C.skin, [[16, -70], [22, -78], [38, -79], [48, -76], [51, -71], [50, -66], [22, -66], [16, -64]]);
  poly(g, C.light, [[22, -78], [38, -79], [48, -76], [40, -76], [24, -76]]);
  for (let k = 0; k < 7; k++) poly(g, C.claw, [[24 + k * 3.6, -66], [25.6 + k * 3.6, -66], [24.8 + k * 3.6, -63.5]]); // upper teeth
  rect(g, '#1a1a1a', 47, -75, 1.5, 1.2);                       // nostril
  poly(g, C.dark, [[27, -76], [36, -77], [35, -74], [28, -73]]); // brow ridge
  rect(g, '#ffd23b', 29, -74, 4, 2.5); rect(g, '#111111', 31.5, -74, 1, 2.5); // eye
  g.restore();
  // tiny arm
  seg(g, C.dark, 2.2, [16, -46], [22, -43]); seg(g, C.dark, 1.6, [22, -43], [24, -40]); rect(g, C.claw, 24, -40, 1, 1.5);
  // near leg
  leg(run, C.skin, C.dark);
  // dust kicked up where each foot lands
  for (const ph of [run, run + Math.PI]) {
    const c = Math.cos(ph);
    if (c > 0.7) { g.globalAlpha = (c - 0.7) * 2; g.fillStyle = '#a8988a'; g.beginPath(); g.arc(-4 - (1 - c) * 30, -2, 3 + (1 - c) * 10, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }
}

/**
 * The rocket, bolted onto a rack over the back wheel (rider-local coordinates; road at y = 0, saddle at (-3.6, -13.3),
 * rear axle at (-8, -5.5)). Draw it before the rider so the legs and saddle sit in front. `power` 0..1.6 sets the flame.
 */
export function drawRocket(g: G, power: number, t: number, v: number) {
  const ax: Pt = [-8, -5.5];
  // rack: stays from the rear axle and the seat post up to the rocket's clamps
  seg(g, '#3a4052', 1, ax, [-11, -11.5]); seg(g, '#3a4052', 1, ax, [-5, -11.5]); seg(g, '#3a4052', 1, [-3.4, -12.6], [-5, -11.5]);
  const y0 = -15, len = 15, x0 = -18; // body from x0 to x0 + len, top at y0, 4 px tall
  // exhaust
  const fl = Math.max(0, power) * (12 + Math.sin(t * 40) * 3) + (v > 1 ? 2 : 0);
  if (fl > 1) {
    g.globalAlpha = 0.35; g.fillStyle = '#ffb020'; g.beginPath(); g.ellipse(x0 - 2 - fl * 0.45, y0 + 2, fl * 0.6, 3.2, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    poly(g, '#ff6a1a', [[x0 - 1, y0], [x0 - 2 - fl, y0 + 2 + Math.sin(t * 33) * 0.6], [x0 - 1, y0 + 4]]);
    poly(g, '#ffe066', [[x0 - 1, y0 + 1], [x0 - 2 - fl * 0.55, y0 + 2], [x0 - 1, y0 + 3]]);
    poly(g, '#ffffff', [[x0 - 1, y0 + 1.6], [x0 - 2 - fl * 0.2, y0 + 2], [x0 - 1, y0 + 2.4]]);
    if (power > 1) { g.globalAlpha = 0.45; g.fillStyle = '#9aa3b5'; for (let i = 0; i < 4; i++) g.fillRect(Math.round(x0 - 4 - fl - i * 5 - ((t * 60) % 5)), Math.round(y0 + 1 + Math.sin(t * 9 + i) * 2), 3, 2); g.globalAlpha = 1; }
  }
  // nozzle bell
  poly(g, '#5e6678', [[x0 - 2, y0 - 0.8], [x0 + 1, y0 + 0.6], [x0 + 1, y0 + 3.4], [x0 - 2, y0 + 4.8]]);
  rect(g, '#2a2e3a', x0 - 2, y0 + 0.6, 1, 2.8);
  // body with a highlight and shadow, a white band and a nose cone tucked under the saddle
  rect(g, '#b8323a', x0 + 1, y0, len - 4, 4);
  rect(g, '#ff6a5a', x0 + 1, y0, len - 4, 1);
  rect(g, '#7a1a22', x0 + 1, y0 + 3, len - 4, 1);
  rect(g, '#ffffff', x0 + 6, y0, 2, 4);
  poly(g, '#d8dde8', [[x0 + len - 3, y0], [x0 + len + 1, y0 + 2], [x0 + len - 3, y0 + 4]]);
  // fins
  poly(g, '#e8463a', [[x0 + 1, y0], [x0 + 4, y0], [x0 - 0.5, y0 - 3]]);
  poly(g, '#e8463a', [[x0 + 1, y0 + 4], [x0 + 4, y0 + 4], [x0 - 0.5, y0 + 6.5]]);
  // clamps
  rect(g, '#2a2e3a', x0 + 3.5, y0 - 0.5, 1, 5); rect(g, '#2a2e3a', x0 + 10, y0 - 0.5, 1, 5);
}

/** A great white, ~80 px long, swimming just above the sea floor toward the rider (facing right). Jaws snap on a catch. */
export function drawShark(g: G, t: number, giveUp: number, caught: number) {
  const lunge = caught >= 0 && caught < 0.8 ? Math.sin((caught / 0.8) * Math.PI) : 0;
  if (giveUp >= 0) { g.translate(-giveUp * 25, -giveUp * 10); g.rotate(-Math.min(0.5, giveUp * 0.4)); } // loses interest and peels away
  const sw = Math.sin(t * 7), y0 = -22 + Math.sin(t * 2) * 2;
  g.translate(lunge * 10, y0);
  // tail (swishes), body, belly, fins
  poly(g, '#5d7186', [[-44, 0], [-60, -14 + sw * 5], [-54, 0], [-60, 12 + sw * 5]]);
  poly(g, '#6f849a', [[-46, -3], [-20, -12], [12, -11], [30, -4], [36, 1], [30, 5], [10, 9], [-20, 8], [-46, 3]]);
  poly(g, '#e8eef2', [[-30, 5], [-6, 9], [20, 7], [32, 3], [22, 2], [-4, 4]]);
  poly(g, '#56697d', [[-6, -11], [2, -26], [8, -11]]);
  poly(g, '#56697d', [[2, 6], [-8, 16], [10, 8]]);
  for (let i = 0; i < 3; i++) rect(g, '#4a5a6a', 14 + i * 3, -6, 1, 6); // gills
  rect(g, '#111', 26, -5, 2, 2); // eye
  // mouth: opens on the lunge, teeth
  const open = 2 + lunge * 7;
  poly(g, '#7a1a2a', [[24, 2], [37, 1 - open * 0.3], [37, 2 + open]]);
  g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { g.fillRect(27 + i * 2.5, 1, 1, 2); g.fillRect(27 + i * 2.5, 1 + open, 1, -2); }
  g.globalAlpha = 0.5; g.strokeStyle = '#cdf6ff'; // bubbles off the tail
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-56 - ((t * 30 + i * 9) % 30), -4 - i * 3, 1.5, 0, Math.PI * 2); g.stroke(); }
  g.globalAlpha = 1;
}

/** A huge carved stone wheel (radius ~30 px) rolling after the rider, shedding dust. Topples over when it gives up. */
export function drawStoneWheel(g: G, t: number, giveUp: number, caught: number) {
  const r = 30, spin = t * 7 + (caught >= 0 && caught < 0.6 ? caught * 6 : 0);
  if (giveUp >= 0) { const k = Math.min(1, giveUp / 1.2); g.translate(giveUp * 10, 0); g.rotate(k * 0.25); }
  g.globalAlpha = 0.5; g.fillStyle = '#b89a6a';
  for (let i = 0; i < 8; i++) { const a = ((t * 2 + hash01(i)) % 1); g.beginPath(); g.arc(-r * 0.6 - a * 40, -3 - a * 10 - hash01(i * 3) * 6, 2 + a * 5, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  g.save(); g.translate(0, -r); g.rotate(spin);
  g.fillStyle = '#7a6a54'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#968466'; g.beginPath(); g.arc(-2, -2, r - 4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5a4c3a'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r - 9, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; seg(g, '#5a4c3a', 2, [Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * (r - 10), Math.sin(a) * (r - 10)]); }
  g.fillStyle = '#5a4c3a'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
  rect(g, '#3e7a2a', -r + 6, -4, 5, 3); rect(g, '#3e7a2a', r - 12, 6, 6, 3); // moss
  g.restore();
}
