// Under the Sea, Jungle, Desert Canyon, Volcano, Snowy Pass. Same rules as biomes.ts: primitives in the low-res buffer.
import { hash01 } from '../sim/terrain';
import { disc, noise1, rect, silhouette, tri, type BiomeLook, type G } from './paint';

const wrap = (x: number, span: number) => ((x % span) + span) % span;

// ---------------- under the sea ----------------
function kelp(g: G, h: number, x: number, y: number, t: number) {
  const n = 3 + Math.floor(h * 10) % 3, tall = 18 + h * 16;
  g.strokeStyle = h > 0.1 ? '#2f8f5a' : '#3fae6a'; g.lineWidth = 1.6;
  for (let k = 0; k < n; k++) {
    const bx = x + (k - n / 2) * 2.5;
    g.beginPath(); g.moveTo(bx, y);
    for (let s = 1; s <= 6; s++) { const yy = y - (tall * s) / 6; g.lineTo(bx + Math.sin(t * 1.3 + s * 0.8 + k + h * 9) * (s * 0.6), yy); }
    g.stroke();
  }
}
function coral(g: G, h: number, x: number, y: number) {
  const c = ['#ff6b8a', '#ff9f43', '#c56cf0', '#ffd23b'][Math.floor(h * 97) % 4];
  g.strokeStyle = c; g.lineWidth = 2; g.lineCap = 'round';
  const branch = (bx: number, by: number, a: number, len: number, d: number) => {
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    if (d > 0) { branch(ex, ey, a - 0.5, len * 0.7, d - 1); branch(ex, ey, a + 0.5, len * 0.7, d - 1); }
  };
  branch(x, y, -Math.PI / 2, 6 + h * 3, 2);
}
function wreck(g: G, x: number, y: number) {
  g.fillStyle = '#4a3a2a'; g.beginPath(); g.moveTo(x - 16, y - 8); g.lineTo(x + 14, y - 12); g.lineTo(x + 10, y); g.lineTo(x - 12, y); g.closePath(); g.fill();
  rect(g, '#3a2c1e', x - 2, y - 26, 2, 16); rect(g, '#5a4632', x - 9, y - 22, 12, 1);
  for (let i = 0; i < 3; i++) disc(g, '#1a2a3a', x - 8 + i * 6, y - 6, 1.4);
}
function chest(g: G, x: number, y: number, t: number) {
  rect(g, '#7a4a1a', x - 5, y - 5, 10, 5); rect(g, '#9a6a2a', x - 5, y - 8, 10, 3); rect(g, '#ffd23b', x - 1, y - 6, 2, 2);
  if (Math.sin(t * 2.5) > 0.7) { rect(g, '#fff8c0', x + 3, y - 10, 1, 1); rect(g, '#fff8c0', x - 4, y - 11, 1, 1); }
}
const underwater: BiomeLook = {
  sky: ['#06304a', '#1b7a9a'], haze: '#0f4a66', ridge: '#16597a', mid: '#c9b27a', ground: '#d8c08a', groundDark: '#b89c66',
  road: '#8a8fa0', roadEdge: '#5a6070', roadKind: 'dust', stars: 0,
  actor: 'fish', particles: 'bubbles', rider: 'scuba', outdoor: false, ambient: { vol: 0.05, freq: 180, q: 0.4 },
  backdrop(g, w, y, u) { silhouette(g, '#0c3d58', w, y, u, 30, 80, 21, 0.3); silhouette(g, '#11506e', w, y + 10, u * 1.5, 16, 50, 22); },
  midProp(g, h, x, y, t) {
    if (h < 0.3) kelp(g, h, x, y, t);
    else if (h < 0.48) coral(g, h, x, y);
    else if (h < 0.51) wreck(g, x, y);
    else if (h < 0.54) chest(g, x, y, t);
    else if (h < 0.62) { disc(g, '#7a8a9a', x, y - 3, 4); disc(g, '#ff6b8a', x + 2, y - 7, 1.5); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.15) { g.fillStyle = '#ff9f43'; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.fillRect(Math.round(x + Math.cos(a) * 2), Math.round(y - 2 + Math.sin(a) * 2), 1, 1); } rect(g, '#ff9f43', x, y - 2, 1, 1); }
    else if (h < 0.35) disc(g, '#f4e4c8', x, y - 1, 1.3);
    else if (h < 0.5) { g.strokeStyle = '#3fae6a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y - 4); g.stroke(); }
  },
  celestial(g, w, h, t) {
    // the surface far above, and light shafts that sway
    g.fillStyle = '#7fd4ea40'; for (let x = 0; x < w; x += 6) g.fillRect(x, 2 + Math.sin(x / 9 + t * 1.5) * 1.5, 4, 1);
    for (let i = 0; i < 5; i++) {
      const x = wrap(i * 83 + Math.sin(t * 0.3 + i) * 10, w + 40) - 20;
      g.fillStyle = '#bff3ff14'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 40, h * 0.75); g.lineTo(x + 18, h * 0.75); g.closePath(); g.fill();
    }
  },
};

// ---------------- jungle ----------------
function bigTree(g: G, h: number, x: number, y: number, t: number) {
  rect(g, '#4a3220', x - 2, y - 26, 4, 26);
  disc(g, '#1f6b2a', x, y - 30, 10); disc(g, '#2a8a36', x - 6, y - 27, 7); disc(g, '#2a8a36', x + 6, y - 28, 7); disc(g, '#3aa046', x - 2, y - 33, 5);
  g.strokeStyle = '#2f7a2a'; g.lineWidth = 1;
  for (let i = 0; i < 2; i++) { const vx = x - 5 + i * 9; g.beginPath(); g.moveTo(vx, y - 24); g.quadraticCurveTo(vx + Math.sin(t + h * 9 + i) * 2, y - 14, vx + 1, y - 8 - i * 3); g.stroke(); }
}
function fern(g: G, h: number, x: number, y: number) {
  g.strokeStyle = h > 0.5 ? '#2e9e4a' : '#46b85a'; g.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + i * 3, y - 8, x + i * 6, y - 5 + Math.abs(i)); g.stroke(); }
}
function temple(g: G, x: number, y: number) {
  for (let i = 0; i < 4; i++) rect(g, i % 2 ? '#8a8a6a' : '#7a7a5a', x - 14 + i * 3, y - 5 - i * 5, 28 - i * 6, 5);
  rect(g, '#2a2a1a', x - 2, y - 24, 4, 4); rect(g, '#4a8a3a', x - 12, y - 6, 3, 2); rect(g, '#4a8a3a', x + 7, y - 16, 2, 3);
}
const jungle: BiomeLook = {
  sky: ['#5fb3d9', '#d6f0c8'], haze: '#4a8a5a', ridge: '#3f8a46', mid: '#2f6e34', ground: '#3a5a22', groundDark: '#2a4418',
  road: '#7a5634', roadEdge: '#5a3e24', roadKind: 'dust', stars: 0,
  actor: 'parrot', particles: 'fireflies', rider: 'road', outdoor: true, ambient: { vol: 0.02, freq: 3200, q: 1.2 },
  backdrop(g, w, y, u, t) {
    silhouette(g, '#5a9a6a', w, y, u, 30, 40, 31); silhouette(g, '#3f7f4a', w, y + 8, u * 1.6, 22, 22, 32);
    // a waterfall off a cliff
    const x = wrap(w * 0.6 - u * 0.6, w + 80) - 40;
    g.fillStyle = '#356f40'; g.beginPath(); g.moveTo(x - 22, y + 40); g.lineTo(x - 12, y - 24); g.lineTo(x + 12, y - 24); g.lineTo(x + 22, y + 40); g.closePath(); g.fill();
    for (const [dx, r] of [[-11, 6], [-4, 5], [5, 6], [12, 5]] as const) disc(g, '#3f8a46', x + dx, y - 25, r);
    g.fillStyle = '#d8f4ff'; for (let i = 0; i < 4; i++) g.fillRect(Math.round(x - 4 + i * 2), y - 22, 1, 60);
    g.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) g.fillRect(Math.round(x - 4 + i * 1.5), Math.round(y - 22 + wrap(t * 30 + i * 9, 56)), 1, 2);
  },
  midProp(g, h, x, y, t) {
    if (h < 0.28) bigTree(g, h, x, y, t);
    else if (h < 0.5) fern(g, h, x, y);
    else if (h < 0.53) temple(g, x, y);
    else if (h < 0.6) { disc(g, '#c0392b', x, y - 3, 3); rect(g, '#f5f5f5', x - 2, y - 4, 1, 1); rect(g, '#f5f5f5', x + 1, y - 3, 1, 1); rect(g, '#e8dcc0', x - 1, y - 1, 2, 2); }
    else if (h < 0.66) { rect(g, '#8a6a3a', x, y - 16, 2, 16); tri(g, '#3aa046', x + 1, y - 18, x - 8, y - 12, x + 1, y - 14); tri(g, '#3aa046', x + 1, y - 18, x + 10, y - 12, x + 1, y - 14); disc(g, '#ffd23b', x + 3, y - 13, 1.5); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.4) { g.fillStyle = '#4ab85a'; g.fillRect(x, y - 4, 1, 4); g.fillRect(x + 2, y - 5, 1, 5); }
    else if (h < 0.5) { rect(g, '#f1e4c8', x, y - 2, 1, 2); disc(g, '#e74c3c', x + 0.5, y - 3, 1.6); }
    else if (h < 0.56) disc(g, '#ff6bd6', x, y - 2, 1.3);
  },
  celestial(g, w) { disc(g, '#fff6c8', w * 0.7, 20, 8); },
};

// ---------------- desert canyon ----------------
function saguaro(g: G, h: number, x: number, y: number) {
  const tall = 14 + h * 14;
  rect(g, '#3f8a46', x - 2, y - tall, 4, tall);
  rect(g, '#3f8a46', x - 7, y - tall * 0.7, 3, 7); rect(g, '#3f8a46', x - 7, y - tall * 0.7 + 4, 6, 3);
  rect(g, '#3f8a46', x + 4, y - tall * 0.55, 3, 6); rect(g, '#3f8a46', x + 1, y - tall * 0.55 + 3, 6, 3);
  rect(g, '#5aa85a', x - 1, y - tall, 1, tall);
}
function mesa(g: G, x: number, base: number, wd: number, ht: number, c: string, band: string) {
  g.fillStyle = c; g.beginPath(); g.moveTo(x - wd / 2 - 8, base); g.lineTo(x - wd / 2, base - ht); g.lineTo(x + wd / 2, base - ht); g.lineTo(x + wd / 2 + 8, base); g.closePath(); g.fill();
  rect(g, band, x - wd / 2 - 2, base - ht * 0.55, wd + 4, 2); rect(g, band, x - wd / 2 - 4, base - ht * 0.3, wd + 8, 1);
}
const desert: BiomeLook = {
  sky: ['#5aa0e0', '#f6e2b8'], haze: '#d89a6a', ridge: '#d9a066', mid: '#e0b07a', ground: '#e8bf84', groundDark: '#cf9f62',
  road: '#6a6264', roadEdge: '#4a4446', roadKind: 'asphalt', stars: 0,
  actor: 'vulture', particles: 'dust', rider: 'road', outdoor: true, ambient: { vol: 0.03, freq: 900, q: 0.4 },
  backdrop(g, w, y, u) {
    for (let i = -1; i < 5; i++) {
      const k = Math.floor(u / 140) + i, x = k * 140 - u + 60 + hash01(k * 3) * 50;
      mesa(g, x, y + 6, 40 + hash01(k * 5) * 40, 22 + hash01(k * 7) * 18, '#c8784a', '#a85a32');
    }
  },
  midProp(g, h, x, y) {
    if (h < 0.26) saguaro(g, h, x, y);
    else if (h < 0.4) { disc(g, '#b8865a', x, y - 3, 3 + h * 4); disc(g, '#cf9f6a', x - 1, y - 4, 1.5); }
    else if (h < 0.44) { rect(g, '#6b4a2a', x, y - 14, 2, 14); rect(g, '#f4ecd8', x - 6, y - 14, 14, 5); rect(g, '#c0392b', x - 4, y - 12, 10, 1); }
    else if (h < 0.48) { rect(g, '#f4f0e6', x - 3, y - 3, 6, 3); rect(g, '#f4f0e6', x - 5, y - 5, 2, 2); rect(g, '#f4f0e6', x + 3, y - 5, 2, 2); rect(g, '#222', x - 2, y - 2, 1, 1); rect(g, '#222', x + 1, y - 2, 1, 1); }
    else if (h < 0.55) { g.fillStyle = '#5a8a3a'; for (let i = 0; i < 3; i++) g.fillRect(x - 2 + i * 2, y - 4 + (i % 2), 1, 4); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.3) rect(g, '#b8865a', x, y - 1, 2, 1);
    else if (h < 0.38) { rect(g, '#3f8a46', x, y - 4, 2, 4); rect(g, '#3f8a46', x - 2, y - 3, 1, 2); }
  },
  celestial(g, w) { disc(g, '#fff2b0', w * 0.25, 26, 11); disc(g, '#ffe680', w * 0.25, 26, 9); },
};

// ---------------- volcano ----------------
const volcano: BiomeLook = {
  sky: ['#2a0c1a', '#a8382a'], haze: '#3a1a1a', ridge: '#3a2626', mid: '#2e2222', ground: '#2a2020', groundDark: '#ff6a1a',
  road: '#4a3a38', roadEdge: '#ff7a2a', roadKind: 'dust', stars: 0.3,
  actor: 'ember', particles: 'ash', rider: 'road', outdoor: false, ambient: { vol: 0.07, freq: 90, q: 0.5 },
  backdrop(g, w, y, u, t) {
    const x = wrap(w * 0.55 - u * 0.4, w + 200) - 100;
    g.fillStyle = '#1e1214'; g.beginPath(); g.moveTo(x - 90, y + 10); g.lineTo(x - 14, y - 52); g.lineTo(x + 14, y - 52); g.lineTo(x + 90, y + 10); g.closePath(); g.fill();
    // glow at the crater, lava streams, smoke plume
    disc(g, '#ff6a1a', x, y - 52, 7 + Math.sin(t * 3) * 1);
    g.strokeStyle = '#ff8a2a'; g.lineWidth = 2;
    for (const [dx, k] of [[-8, 1], [6, 2]] as const) { g.beginPath(); g.moveTo(x + dx * 0.5, y - 50); g.quadraticCurveTo(x + dx * 3, y - 25, x + dx * 6 + Math.sin(t + k) * 2, y + 6); g.stroke(); }
    for (let i = 0; i < 7; i++) {
      const a = wrap(t * 6 + i * 9, 60);
      g.globalAlpha = Math.max(0, 0.55 - a / 110); disc(g, '#5a4a4a', x + Math.sin(i + t * 0.3) * 6 + a * 0.6, y - 56 - a, 5 + a * 0.18);
    }
    g.globalAlpha = 1;
    silhouette(g, '#2a1818', w, y + 10, u * 1.4, 14, 30, 41, 0.6);
  },
  midProp(g, h, x, y, t) {
    if (h < 0.3) { tri(g, '#151018', x - 5, y, x + 5, y, x + (h - 0.15) * 20, y - 9 - h * 12); rect(g, '#5a3a6a', x - 1, y - 5, 1, 2); }
    else if (h < 0.42) { g.fillStyle = '#ff6a1a'; g.beginPath(); g.ellipse(x, y - 1, 8, 2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd23b'; g.beginPath(); g.ellipse(x + Math.sin(t * 2 + h * 9) * 2, y - 1, 3, 1, 0, 0, Math.PI * 2); g.fill(); }
    else if (h < 0.5) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 14); g.moveTo(x, y - 9); g.lineTo(x - 5, y - 13); g.moveTo(x, y - 11); g.lineTo(x + 4, y - 15); g.stroke(); }
    else if (h < 0.56) { rect(g, '#3a2a2a', x - 2, y - 2, 4, 2); for (let i = 0; i < 3; i++) { const a = wrap(t * 8 + i * 6, 18); g.globalAlpha = 0.5 - a / 40; disc(g, '#e8e0e0', x + Math.sin(a / 3 + i) * 2, y - 4 - a, 2 + a / 8); } g.globalAlpha = 1; }
  },
  foreProp(g, h, x, y) {
    if (h < 0.3) rect(g, '#1a1418', x, y - 2, 3, 2);
    else if (h < 0.4) rect(g, '#ff7a2a', x, y - 1, 2, 1);
  },
  celestial(g, w) { disc(g, '#ff9a6a55', w * 0.2, 30, 10); },
};

// ---------------- snowy pass ----------------
function pine(g: G, h: number, x: number, y: number) {
  const s = 0.8 + h * 0.8;
  rect(g, '#4a3220', x - 1, y - 4 * s, 2, 4 * s);
  for (let i = 0; i < 3; i++) {
    const yy = y - 4 * s - i * 5 * s, ww = (8 - i * 2) * s;
    tri(g, '#1f5a3a', x - ww, yy, x + ww, yy, x, yy - 8 * s);
    tri(g, '#f4f8ff', x - ww * 0.5, yy - 4 * s, x + ww * 0.5, yy - 4 * s, x, yy - 8 * s);
  }
}
function snowman(g: G, x: number, y: number) {
  disc(g, '#f4f8ff', x, y - 4, 4); disc(g, '#f4f8ff', x, y - 10, 3); rect(g, '#222', x - 1, y - 11, 1, 1); rect(g, '#222', x + 1, y - 11, 1, 1);
  rect(g, '#ff8a2a', x + 2, y - 10, 2, 1); rect(g, '#2a2a3a', x - 3, y - 14, 6, 1); rect(g, '#2a2a3a', x - 2, y - 17, 4, 3); rect(g, '#e74c3c', x - 3, y - 8, 6, 1);
}
function cabin(g: G, x: number, y: number, t: number) {
  rect(g, '#7a4a2a', x - 8, y - 9, 16, 9); tri(g, '#f4f8ff', x - 10, y - 9, x + 10, y - 9, x, y - 16);
  rect(g, '#ffd23b', x - 5, y - 6, 3, 3); rect(g, '#ffd23b', x + 2, y - 6, 3, 3); rect(g, '#5a3a22', x + 4, y - 18, 2, 5);
  for (let i = 0; i < 3; i++) { const a = wrap(t * 5 + i * 5, 15); g.globalAlpha = 0.5 - a / 32; disc(g, '#e8eef6', x + 5 + a * 0.4, y - 19 - a, 1.5 + a / 8); }
  g.globalAlpha = 1;
}
const snow: BiomeLook = {
  sky: ['#6aa8e0', '#e8f2fc'], haze: '#c8d8ec', ridge: '#e4ecf6', mid: '#eef4fb', ground: '#f6f9fd', groundDark: '#c8d4e4',
  road: '#7a7e8a', roadEdge: '#5a5e6a', roadKind: 'asphalt', stars: 0,
  actor: 'bird', particles: 'snow', rider: 'road', outdoor: true, ambient: { vol: 0.04, freq: 1200, q: 0.3 },
  backdrop(g, w, y, u) {
    // a range of peaks: far row (paler) then near row, each with a snow cap
    for (const [row, par, col, cap] of [[0, 0.6, '#aebfd6', '#f4f8ff'], [1, 1, '#8ea4c2', '#ffffff']] as const) {
      const span = 46, uu = u * par, k0 = Math.floor(uu / span) - 2;
      for (let k = k0; k < k0 + w / span + 4; k++) {
        const x = k * span - uu + hash01(k * 11 + row) * 20, ht = 26 + hash01(k * 13 + row * 7) * 26 - row * 6, half = 22 + hash01(k * 17) * 14, base = y + 12 + row * 6;
        tri(g, col, x - half, base, x + half, base, x, base - ht);
        tri(g, cap, x - half * 0.38, base - ht * 0.62, x + half * 0.38, base - ht * 0.62, x, base - ht);
        tri(g, col, x - half * 0.38, base - ht * 0.62, x - half * 0.12, base - ht * 0.62, x - half * 0.25, base - ht * 0.52);
      }
    }
  },
  midProp(g, h, x, y, t) {
    if (h < 0.38) pine(g, h, x, y);
    else if (h < 0.42) snowman(g, x, y);
    else if (h < 0.46) cabin(g, x, y, t);
    else if (h < 0.55) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y - 1, 6, 2.5, 0, Math.PI, 0); g.fill(); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.3) rect(g, '#dfe8f4', x, y - 1, 3, 1);
    else if (h < 0.36) { rect(g, '#a8d8ff', x, y - 2, 1, 2); rect(g, '#a8d8ff', x + 1, y - 3, 1, 1); }
  },
  celestial(g, w) { disc(g, '#fffbe8', w * 0.8, 22, 8); },
};

export const MORE_LOOKS = { underwater, jungle, desert, volcano, snow };
