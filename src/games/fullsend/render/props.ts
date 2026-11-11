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

/** A loop of radius (rx, ry) screen px with centre (cx, cy). Vines in the jungle, lanterns in the market, steel elsewhere. */
export function drawLoop(g: G, cx: number, cy: number, rx: number, ry: number, biome: BiomeId, t: number, pass: 'back' | 'front') {
  if (pass === 'front') return;
  const c = biome === 'jungle' ? '#3f8a3a' : biome === 'market' ? '#b8323a' : '#9aa3b5';
  const c2 = biome === 'jungle' ? '#2a5f28' : biome === 'market' ? '#ffcf5a' : '#5e6678';
  g.strokeStyle = c2; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = cx + Math.cos(a) * (rx + 3), y = cy + Math.sin(a) * (ry + 3);
    if (biome === 'jungle') rect(g, '#5fbf3a', x - 1, y, 2, 2);
    else if (biome === 'market') rect(g, Math.sin(t * 4 + i) > 0 ? '#ffe066' : '#ff8a2a', x - 1, y - 1, 2, 3);
  }
  rect(g, c2, cx - rx * 0.7, cy + ry * 0.6, 2, ry * 0.4 + 2); rect(g, c2, cx + rx * 0.7 - 2, cy + ry * 0.6, 2, ry * 0.4 + 2);
}

/** One obstacle of a smash wall. `hit` = seconds since it was smashed (<0 = intact); `topple` = seconds since it fell over after a bounce. */
export function drawObstacle(g: G, x: number, roadY: number, biome: BiomeId, i: number, hit: number, topple: number) {
  const kind = biome === 'countryside' ? 'hay' : biome === 'market' ? 'stall' : biome === 'snow' ? 'ice' : biome === 'autumn' ? 'leaves' : biome === 'underwater' ? 'coral' : 'crate';
  const col = { hay: ['#e8c85a', '#b8962e'], stall: ['#c8763a', '#7a4a22'], ice: ['#cfefff', '#8cc8e8'], leaves: ['#d97a2e', '#9a4a1a'], coral: ['#ff7a9a', '#c84a6a'], crate: ['#a86b3c', '#6e4424'] }[kind];
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
  if (kind === 'hay') { g.fillStyle = col[0]; g.beginPath(); g.ellipse(0, -h / 2, w / 2 + 1, h / 2, 0, 0, Math.PI * 2); g.fill(); rect(g, col[1], -w / 2, -h * 0.6, w, 1); rect(g, col[1], -w / 2, -h * 0.3, w, 1); }
  else if (kind === 'stall') { rect(g, col[1], -w / 2, -h, w, h); for (let s = 0; s < 4; s++) rect(g, s % 2 ? '#ffffff' : '#e8463a', -w / 2 - 1 + s * 3, -h - 3, 3, 3); rect(g, '#ffd23b', -2, -h + 4, 4, 3); }
  else if (kind === 'leaves') { g.fillStyle = col[0]; g.beginPath(); g.ellipse(0, -h * 0.35, w * 0.7, h * 0.4, 0, Math.PI, 0); g.fill(); rect(g, col[1], -3, -h * 0.5, 2, 2); }
  else if (kind === 'coral') { rect(g, col[0], -1, -h, 3, h); rect(g, col[0], -5, -h * 0.7, 2, h * 0.5); rect(g, col[1], 3, -h * 0.6, 2, h * 0.4); }
  else { rect(g, col[0], -w / 2, -h, w, h); rect(g, col[1], -w / 2, -h, w, 1); rect(g, col[1], -w / 2, -h, 1, h); rect(g, col[1], w / 2 - 1, -h, 1, h); if (kind === 'crate') { g.strokeStyle = col[1]; g.lineWidth = 1; g.beginPath(); g.moveTo(-w / 2, -h); g.lineTo(w / 2, 0); g.stroke(); } }
  g.restore();
}

/** Whatever is chasing you in an Outrun. `giveUp` ≥ 0 = seconds since it gave up; `caught` = seconds since it last caught you. */
export function drawChaser(g: G, kind: ChaserKind, x: number, roadY: number, t: number, giveUp: number, caught: number) {
  g.save(); g.translate(Math.round(x), Math.round(roadY));
  if (giveUp >= 0) g.translate(0, Math.min(30, giveUp * giveUp * 20)); // stumbles away / sinks out of the chase
  if (kind === 'trex') {
    const c = '#5d7a2e', dk = '#3f5520', belly = '#a7b86a';
    const step = Math.sin(t * 14), jaw = 2 + Math.max(0, Math.sin(t * 6)) * 4 + (caught < 1 ? 4 : 0);
    // tail
    g.fillStyle = c; g.beginPath(); g.moveTo(-34, -30); g.lineTo(-8, -38); g.lineTo(-8, -26); g.closePath(); g.fill();
    // legs
    rect(g, dk, -6 + step * 3, -22, 5, 14); rect(g, dk, -6 + step * 5, -9, 7, 3);
    rect(g, c, -2 - step * 3, -22, 5, 14); rect(g, c, -2 - step * 5, -9, 7, 3);
    // body
    g.fillStyle = c; g.beginPath(); g.ellipse(-2, -32, 14, 10, -0.25, 0, Math.PI * 2); g.fill();
    g.fillStyle = belly; g.beginPath(); g.ellipse(2, -28, 8, 5, -0.25, 0, Math.PI); g.fill();
    // neck + head
    rect(g, c, 6, -48, 7, 12);
    rect(g, c, 6, -56, 22, 9);              // skull
    rect(g, c, 8, -47 + jaw, 18, 4);        // lower jaw
    rect(g, '#7a1a1a', 10, -47, 16, jaw);   // mouth
    for (let i = 0; i < 6; i++) { rect(g, '#ffffff', 10 + i * 3, -47, 1, 2); rect(g, '#ffffff', 10 + i * 3 + 1, -47 + jaw - 1, 1, 2); }
    rect(g, '#ffe066', 20, -54, 3, 2); rect(g, '#111111', 22, -54, 1, 2); // eye
    rect(g, dk, 16, -56, 6, 1); // brow
    rect(g, c, 10, -34, 5, 2); rect(g, c, 14, -34, 1, 3); // tiny arm
  } else if (kind === 'avalanche') {
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

/** The rocket strapped behind the saddle, in rider-local coordinates. `power` 0..1.6 sets the flame. */
export function drawRocket(g: G, power: number, t: number, v: number) {
  const fl = Math.max(0, power) * (14 + Math.sin(t * 40) * 3) + (v > 1 ? 2 : 0);
  if (fl > 1) {
    g.fillStyle = '#ff6a1a'; g.beginPath(); g.moveTo(-26, -21); g.lineTo(-26 - fl, -18.5); g.lineTo(-26, -16); g.closePath(); g.fill();
    g.fillStyle = '#ffe066'; g.beginPath(); g.moveTo(-26, -20); g.lineTo(-26 - fl * 0.55, -18.5); g.lineTo(-26, -17); g.closePath(); g.fill();
    if (power > 1) { g.globalAlpha = 0.5; g.fillStyle = '#9aa3b5'; for (let i = 0; i < 4; i++) g.fillRect(Math.round(-30 - fl - i * 5 - ((t * 60) % 5)), Math.round(-19 + Math.sin(t * 9 + i) * 2), 3, 2); g.globalAlpha = 1; }
  }
  rect(g, '#5e6678', -27, -21, 3, 5);    // nozzle
  rect(g, '#e8463a', -24, -22, 14, 7);   // body
  rect(g, '#ffffff', -20, -22, 2, 7);    // stripe
  g.fillStyle = '#e8463a'; g.beginPath(); g.moveTo(-10, -22); g.lineTo(-5, -18.5); g.lineTo(-10, -15); g.closePath(); g.fill();
  rect(g, '#b8323a', -22, -24, 4, 2); rect(g, '#b8323a', -22, -15, 4, 2); // fins
}
