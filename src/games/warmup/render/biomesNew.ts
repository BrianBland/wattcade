// Approved B1–B4: broad flat shapes, grouped landmarks and quiet animated life.
import { hash01 } from '../sim/terrain';
import { jaggedSkyRock } from './skyRock';
import { disc, rect, silhouette, tri, type BiomeLook, type G } from './paint';

const wrap = (x: number, span: number) => ((x % span) + span) % span;
function grove(g: G, h: number, x: number, y: number) {
  const colors = ['#d49332', '#bd6534', '#e2aa42'];
  for (let i = 0; i < 3; i++) {
    const dx = x + i * 15, tall = 27 + hash01(i + Math.floor(h * 300)) * 10;
    rect(g, '#74503a', dx - 1, y - tall, 3, tall);
    const c = colors[(i + Math.floor(h * 30)) % colors.length];
    rect(g, c, dx - 6, y - tall - 11, 12, 22);
    rect(g, c, dx - 9, y - tall - 8, 18, 16);
    rect(g, c, dx - 11, y - tall - 4, 22, 8);
    rect(g, '#bd7731', dx + 4, y - tall + 3, 5, 5);
  }
}
function bridge(g: G, x: number, y: number) {
  rect(g, '#76b1bd', x - 12, y - 1, 29, 3);
  rect(g, '#74503a', x - 14, y - 5, 32, 2);
  rect(g, '#8b643d', x - 14, y - 11, 32, 1);
  for (const dx of [-12, -2, 8, 16]) rect(g, '#74503a', x + dx, y - 13, 1, 11);
}

const autumn: BiomeLook = {
  sky: ['#6db5df', '#e4dfc6'], haze: '#bd9c91', ridge: '#bc8956', mid: '#8b9754', ground: '#7f8a49', groundDark: '#667541',
  road: '#555460', roadEdge: '#e0c782', roadKind: 'asphalt', stars: 0, actor: 'bird', particles: 'leaves', rider: 'road', outdoor: true,
  ambient: { vol: 0.018, freq: 800, q: 0.5 },
  backdrop(g, w, y, u) { silhouette(g, '#bd9c91', w, y, u, 24, 90, 71); silhouette(g, '#bc896f', w, y + 10, u * 1.4, 20, 65, 72); },
  midProp(g, h, x, y) { if (h < 0.18) grove(g, h, x, y); else if (h > 0.88 && h < 0.92) bridge(g, x, y); },
  foreProp(g, h, x, y) { if (h < 0.16) { rect(g, '#c78735', x, y - 1, 2, 1); rect(g, '#dba34b', x + 3, y + 1, 1, 1); } },
  celestial(g, w) { disc(g, '#fff0af', w * 0.82, 24, 8); },
};

/** A short ballistic hop followed by a long rest. Position and landing ripple
 * come from the same phase; no frame-rate-dependent movement or state. */
export function frogPose(t: number, seed: number) {
  const period = 5 + seed * 3, total = t + seed * 19, phase = wrap(total, period);
  const forward = Math.floor(total / period) % 2 === 0;
  const jump = phase < 0.8 ? phase / 0.8 : null;
  const u = jump ?? 1;
  return { x: (forward ? u : 1 - u) * 10, dir: forward ? 1 : -1, lift: jump === null ? 0 : 4 * jump * (1 - jump) * 7,
    stretch: jump === null ? 0 : Math.sin(jump * Math.PI), ripple: phase >= 0.8 && phase < 1.4 ? (phase - 0.8) / 0.6 : null };
}
function frog(g: G, x: number, y: number, h: number, t: number) {
  const p = frogPose(t, h), fx = x + p.x, fy = y - p.lift;
  if (p.ripple !== null) { g.save(); g.globalAlpha *= 1 - p.ripple; g.strokeStyle = '#acd3b5'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(fx, y + 1, 2 + p.ripple * 4, 0.7 + p.ripple, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
  g.save(); g.translate(fx, fy); g.scale(p.dir, 1);
  rect(g, '#537b3f', -2 - p.stretch, -1, 3, 1);
  rect(g, '#79a94f', -2, -3, 4, 2);
  rect(g, '#9cc56d', 1, -4, 2, 2);
  rect(g, '#253e35', 2, -4, 1, 1); g.restore();
}
function reeds(g: G, h: number, x: number, y: number, t: number) {
  for (let i = 0; i < 4; i++) {
    const tall = 15 + hash01(i + Math.floor(h * 500)) * 12, sway = Math.sin(t * 1.2 + h * 10 + i) * 0.7;
    g.strokeStyle = i % 2 ? '#899d4c' : '#6f8e50'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + i * 2, y); g.lineTo(x + i * 2 + sway, y - tall); g.stroke();
    if (i % 2 === 0) rect(g, '#b59e56', x + i * 2 + sway, y - tall - 3, 1, 3);
  }
}
function heron(g: G, x: number, y: number, t: number) {
  const turn = Math.sin(t * 0.4) * 0.5;
  rect(g, '#527f80', x - 1, y - 5, 1, 5); rect(g, '#527f80', x + 2, y - 5, 1, 5);
  rect(g, '#eef1d7', x - 3, y - 9, 6, 4); rect(g, '#eef1d7', x + 2, y - 15, 2, 9);
  rect(g, '#eef1d7', x + 2 + turn, y - 16, 4, 2); rect(g, '#d8ac5a', x + 5 + turn, y - 15, 3, 1);
  rect(g, '#294f51', x + 4 + turn, y - 16, 1, 1);
}
const marsh: BiomeLook = {
  sky: ['#a5d9ca', '#dce8cd'], haze: '#8ab8aa', ridge: '#73a99b', mid: '#81b9b5', ground: '#77aead', groundDark: '#9ac7bd',
  road: '#d6bb8e', roadEdge: '#96785c', roadKind: 'planks', roadStructure: 'boardwalk', stars: 0, actor: 'gull', rider: 'road', outdoor: true,
  ambient: { vol: 0.025, freq: 380, q: 0.5 },
  backdrop(g, w, y, u, t) {
    silhouette(g, '#8ab8aa', w, y - 3, u, 18, 70, 81); silhouette(g, '#689c87', w, y + 8, u * 1.4, 16, 38, 82);
    rect(g, '#81b9b5', 0, y + 12, w, 36);
    for (let i = 0; i < 12; i++) rect(g, '#9ccdc2', wrap(i * 41 - u * 0.3 + Math.sin(t + i), w), y + 18 + (i % 4) * 6, 7, 1);
  },
  midProp(g, h, x, y, t) {
    if (h < 0.2) reeds(g, h, x, y, t);
    else if (h < 0.25) frog(g, x, y - 1, h, t);
    else if (h > 0.9 && h < 0.94) heron(g, x, y, t);
    else if (h < 0.38) rect(g, '#829b4b', x - 3, y - 1, 6, 1);
  },
  foreProp(g, h, x, y) { if (h < 0.12) rect(g, '#9ccdc2', x, y, 6, 1); },
  celestial(g, w) { disc(g, '#f5e7aa', w * 0.82, 24, 8); },
};

function stall(g: G, x: number, y: number, col: string, t: number, phase: number) {
  rect(g, '#75513f', x - 8, y - 11, 16, 11); rect(g, '#3a3545', x - 6, y - 10, 12, 6);
  for (let i = 0; i < 4; i++) rect(g, i % 2 ? '#e6d7b1' : col, x - 9 + i * 4.5, y - 15, 5, 4);
  rect(g, '#c39454', x - 8, y - 4, 16, 1); rect(g, '#efd18a', x - 5, y - 7, 3, 3); rect(g, '#d4a453', x + 2, y - 6, 3, 2);
  const sway = Math.sin(t * 0.8 + phase) * 0.6;
  rect(g, '#5b4b49', x + sway, y - 24, 1, 4); rect(g, '#c99448', x - 2 + sway, y - 21, 5, 6); rect(g, '#f0d27e', x - 1 + sway, y - 20, 3, 4);
}
const market: BiomeLook = {
  sky: ['#142e5b', '#3b5077'], haze: '#344366', ridge: '#354364', mid: '#403c56', ground: '#504454', groundDark: '#443b4c',
  road: '#53535e', roadEdge: '#b5a789', roadKind: 'asphalt', stars: 0.6, lights: 0.55, dusk: 0.15, actor: 'none', rider: 'road', outdoor: false,
  ambient: { vol: 0.012, freq: 600, q: 0.5 },
  backdrop(g, w, y, u) {
    for (let k = Math.floor(u / 41) - 1; k < (u + w) / 41 + 1; k++) {
      const x = k * 41 - u, h = 13 + hash01(k * 31) * 24;
      rect(g, '#293a60', x, y - h, 34, h + 25);
      if (hash01(k * 3) < 0.5) tri(g, '#293a60', x - 2, y - h, x + 36, y - h, x + 17, y - h - 12);
      if (hash01(k * 7) < 0.55) rect(g, '#c3a365', x + 6, y - h + 5, 2, 3);
    }
  },
  midProp(g, h, x, y, t) {
    if (h < 0.045) { g.save(); g.translate(x, y); g.scale(2.2, 2.2); stall(g, -20, 0, '#b95e50', t, h); stall(g, 0, 0, '#458d88', t, h + 1); stall(g, 20, 0, '#c4a475', t, h + 2); g.restore(); }
    else if (h > 0.85 && h < 0.9) { rect(g, '#634a45', x - 3, y - 5, 6, 5); rect(g, '#836346', x - 3, y - 4, 6, 1); }
  },
  foreProp() {},
  celestial(g, w) { disc(g, '#e9d7a0', w * 0.82, 24, 7); },
};

function island(g: G, x: number, y: number, size: number) {
  tri(g, '#a39cc7', x - size, y, x + size, y, x, y + size * 0.75);
  tri(g, '#928bb8', x, y + size * 0.75, x + size, y, x + size * 0.5, y + size * 0.2);
  rect(g, '#afc594', x - size, y - 2, size * 2, 3);
  rect(g, '#afc594', x - size * 0.3, y - 7, size * 0.2, 6);
  rect(g, '#98b18c', x + size * 0.3, y - 11, 1, 10);
  rect(g, '#afc594', x + size * 0.3 - 3, y - 13, 7, 6);
  rect(g, '#afc594', x + size * 0.3 - 1, y - 15, 3, 3);
}
const sky: BiomeLook = {
  sky: ['#9daef0', '#e1d9ed'], haze: '#b0a9d0', ridge: '#cac3de', mid: '#b3c783', ground: '#a8b875', groundDark: '#8ba16b',
  road: '#ece0b8', roadEdge: '#b6a28c', roadKind: 'stone', roadStructure: 'floating', stars: 0, actor: 'skywhale', rider: 'road', outdoor: false,
  ambient: { vol: 0.015, freq: 550, q: 0.4 },
  backdrop(g, w, y, u) {
    for (let k = Math.floor(u / 80) - 1; k < (u + w) / 80 + 1; k++) {
      const x = k * 80 - u, h = hash01(k * 43 + 3);
      if (h > 0.12) island(g, x + (h - 0.5) * 22, y - 14 - h * 34, 15 + h * 15);
    }
  },
  midProp(g, h, x, y, t) {
    if (h < 0.07) {
      rect(g, '#a5b87a', x, y - 13, 1, 13);
      for (let i = 0; i < 4; i++) { const a = t * 0.9 + i * Math.PI / 2; tri(g, i % 2 ? '#f0e5c7' : '#bd717e', x, y - 13, x + Math.cos(a) * 5, y - 13 + Math.sin(a) * 5, x + Math.cos(a + 0.6) * 3, y - 13 + Math.sin(a + 0.6) * 3); }
    } else if (h < 0.16) { rect(g, '#8fa66a', x, y - 3, 1, 3); rect(g, '#fff0cd', x - 1, y - 4, 3, 1); rect(g, '#f2ce70', x, y - 5, 1, 3); }
  },
  foreProp() {},
  celestial(g, w) { disc(g, '#f8edc9', w * 0.82, 24, 7); },
};

/** Continuous road deck with water supports or an airy island underside.
 * Called after road painting, before the rider, so contact/grade never changes. */
export function drawRoadStructure(g: G, kind: 'boardwalk' | 'floating', w: number, h: number, roadY: (x: number) => number, scroll: number, t: number) {
  if (kind === 'boardwalk') {
    // Long cross beams, substantial piers and diagonal braces follow grade.
    for (let x = 0; x < w; x++) rect(g, '#795a43', x, roadY(x) + 6, 1, 4);
    for (let k = Math.floor(scroll / 42) - 1; k < (scroll + w) / 42 + 1; k++) {
      const x = Math.round(k * 42 - scroll), y = roadY(x), nx = x + 42, ny = roadY(nx);
      g.strokeStyle = '#4e5147'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 3, y + 11); g.lineTo(nx, ny + 36);
      g.moveTo(x + 3, y + 36); g.lineTo(nx, ny + 11); g.stroke();
      rect(g, '#5c4e41', x, y + 5, 5, 40); rect(g, '#927453', x, y + 5, 2, 36);
      rect(g, '#b8d5c4', x - 4, y + 46, 13, 1);
      rect(g, '#8abbb3', x - 9, y + 49, 19, 1);
    }
    return;
  }
  // Cloud sea is visible below the broken cliff fragments and under the bridge.
  for (let x = 0; x < w; x++) {
    const y = Math.round(roadY(x));
    rect(g, '#ddd7ec', x, y + 6, 1, h - y);
  }
  for (let k = Math.floor(scroll * 0.12 / 90) - 1; k < (scroll * 0.12 + w) / 90 + 1; k++) {
    const x = k * 90 - scroll * 0.12, y = h - 14 + hash01(k * 5) * 8;
    rect(g, '#f1ebf1', x - 28, y, 56, 12); rect(g, '#f1ebf1', x - 18, y - 6, 36, 7); rect(g, '#f9f2ee', x - 7, y - 11, 15, 6);
  }
  for (let k = Math.floor(scroll / 280) - 1; k < (scroll + w) / 280 + 1; k++) {
    const left = k * 280 - 16 - scroll;
    jaggedSkyRock(g, left, 226, x => roadY(x) + 7, k, 44 + hash01(k * 17) * 24, true);
  }
  for (let x = 0; x < w; x++) {
    const world = x + scroll, phase = wrap(world, 280), y = Math.round(roadY(x));
    if (phase > 210 && phase < 264) {
      // Short shallow stone arch: thick at the abutments, open at the crown.
      const u = (phase - 210) / 54, depth = 6 + Math.pow(Math.abs(u * 2 - 1), 2) * 22;
      rect(g, '#b8aa9b', x, y + 6, 1, depth);
      rect(g, '#ded1b1', x, y + 6, 1, Math.max(3, depth - 4));
      if (Math.floor(world / 7) % 2 === 0) rect(g, '#978e8a', x, y + depth + 2, 1, 2);
      continue;
    }
    if (wrap(world, 31) < 8) rect(g, '#94a46b', x, y + 6, 1, 3 + hash01(Math.floor(world / 31)) * 6);
  }
  for (let k = Math.floor(scroll / 47) - 1; k < (scroll + w) / 47 + 1; k++) {
    const x = k * 47 - scroll, y = roadY(x), phase = wrap(k * 47, 280);
    if (phase > 210 && phase < 264) continue;
    const len = 15 + hash01(k * 13) * 16, sway = Math.sin(t * .6 + k) * .6;
    rect(g, '#6f8c5d', x + sway, y + 7, 1, len);
    for (let j = 4; j < len; j += 5) rect(g, '#9db278', x + sway + (j % 2 ? -2 : 0), y + 7 + j, 3, 2);
  }
  // A few nearer clouds pass in front of the lowest rocks, giving the cliff
  // fragments depth instead of displaying every island as a cutout diagram.
  for (let k = Math.floor(scroll * .18 / 150) - 1; k < (scroll * .18 + w) / 150 + 1; k++) {
    const x = k * 150 - scroll * .18 + 54, y = h - 5 + hash01(k * 29) * 4;
    rect(g, '#f1ebf1', x - 24, y, 48, 10);
    rect(g, '#f1ebf1', x - 16, y - 5, 32, 6);
    rect(g, '#f9f2ee', x - 5, y - 9, 13, 5);
  }
}

export const NEW_LOOKS = { autumn, marsh, market, sky };
