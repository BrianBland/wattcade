// What each biome looks like. Everything is drawn with primitives into a low-res buffer, so it reads as pixel art.
// Props are picked per world slot from a hash, so the same spot always holds the same tree.
import { hash01, type BiomeId } from '../sim/terrain';

export type G = CanvasRenderingContext2D;

export interface BiomeLook {
  sky: [string, string];          // top, horizon
  haze: string;                   // far backdrop colour
  ridge: string;                  // the real-terrain ridge (the road ahead, seen from afar)
  mid: string;                    // mid ground band
  ground: string; groundDark: string;
  road: string; roadEdge: string; roadKind: 'asphalt' | 'planks' | 'dust';
  stars: number;                  // 0..1 star visibility
  /** Distant scenery band (parallax ~0.05). `u` = layer scroll in px, `y` = band base. */
  backdrop(g: G, w: number, y: number, u: number, t: number): void;
  /** Mid-layer prop standing on (x, y). Return without drawing to leave the slot empty. */
  midProp(g: G, h: number, x: number, y: number, t: number): void;
  /** Small foreground bit below the road. */
  foreProp(g: G, h: number, x: number, y: number): void;
  /** Sky decoration (sun, Earth, ...). */
  celestial(g: G, w: number, h: number, t: number): void;
}

const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const disc = (g: G, c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const tri = (g: G, c: string, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
  g.fillStyle = c; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
};
/** Smooth 1D value noise in [0,1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash01(i + seed * 1013) * (1 - s) + hash01(i + 1 + seed * 1013) * s;
}
function silhouette(g: G, c: string, w: number, base: number, u: number, amp: number, scale: number, seed: number, jag = 0) {
  g.fillStyle = c; g.beginPath(); g.moveTo(0, base + 40);
  for (let x = 0; x <= w; x += 2) {
    const n = noise1((x + u) / scale, seed) * 0.7 + noise1((x + u) / (scale / 3), seed + 1) * 0.3;
    const j = jag ? Math.abs(((x + u) % 9) - 4.5) * jag : 0;
    g.lineTo(x, base - n * amp - j);
  }
  g.lineTo(w, base + 40); g.closePath(); g.fill();
}

// ---------------- countryside ----------------
function tree(g: G, h: number, x: number, y: number) {
  const s = 0.8 + h * 0.6;
  rect(g, '#5b3a22', x - 1, y - 7 * s, 2, 7 * s);
  disc(g, h > 0.5 ? '#2f7d32' : '#3f9a3a', x, y - 10 * s, 5 * s);
  disc(g, '#56b04a', x - 1.5 * s, y - 11.5 * s, 2.5 * s);
}
function windmill(g: G, x: number, y: number, t: number) {
  tri(g, '#e8dcc0', x - 4, y, x + 4, y, x, y - 20);
  rect(g, '#7a4a2a', x - 1, y - 4, 2, 4);
  g.strokeStyle = '#f4f0e6'; g.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = t * 1.2 + (i * Math.PI) / 2;
    g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + Math.cos(a) * 10, y - 18 + Math.sin(a) * 10); g.stroke();
  }
}
function barn(g: G, x: number, y: number) {
  rect(g, '#a8322b', x - 8, y - 9, 16, 9);
  tri(g, '#6e1f1a', x - 10, y - 9, x + 10, y - 9, x, y - 15);
  rect(g, '#f2e6c8', x - 2, y - 6, 4, 6);
}
function sheep(g: G, x: number, y: number) {
  disc(g, '#f4f4ee', x, y - 3, 3); disc(g, '#f4f4ee', x + 2, y - 3.5, 2.5);
  rect(g, '#222', x + 4, y - 4, 2, 2); rect(g, '#222', x - 2, y - 1, 1, 1); rect(g, '#222', x + 2, y - 1, 1, 1);
}

const countryside: BiomeLook = {
  sky: ['#4fa3e8', '#cfeaf7'], haze: '#9cc3d9', ridge: '#7fb36a', mid: '#5f9e4c', ground: '#4f8f3a', groundDark: '#3f7a2e',
  road: '#5c5a63', roadEdge: '#3a3940', roadKind: 'asphalt', stars: 0,
  backdrop(g, w, y, u) { silhouette(g, '#9cc3d9', w, y, u, 26, 90, 3); silhouette(g, '#86b3a0', w, y + 8, u * 1.6, 16, 60, 4); },
  midProp(g, h, x, y, t) {
    if (h < 0.42) tree(g, h, x, y);
    else if (h < 0.47) windmill(g, x, y, t);
    else if (h < 0.52) barn(g, x, y);
    else if (h < 0.62) { sheep(g, x, y); if (h > 0.57) sheep(g, x + 7, y + 1); }
    else if (h < 0.72) { g.fillStyle = '#7a5a3a'; for (let i = 0; i < 4; i++) g.fillRect(x - 6 + i * 4, y - 4, 1, 4); g.fillRect(x - 6, y - 3, 13, 1); }
    else if (h < 0.76) { disc(g, '#e5c25a', x, y - 2.5, 3); rect(g, '#c9a640', x - 3, y - 2, 6, 1); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.5) { g.fillStyle = '#6fbf4a'; g.fillRect(x, y - 3, 1, 3); g.fillRect(x + 2, y - 4, 1, 4); g.fillRect(x + 4, y - 2, 1, 2); }
    else if (h < 0.65) { rect(g, '#3f7a2e', x, y - 3, 1, 3); disc(g, h < 0.57 ? '#ff6b8a' : '#ffe14d', x + 0.5, y - 4, 1.4); }
  },
  celestial(g, w) { disc(g, '#fff6c8', w * 0.82, 24, 9); disc(g, '#fff0a0', w * 0.82, 24, 7); },
};

// ---------------- seaside ----------------
function palm(g: G, h: number, x: number, y: number, t: number) {
  const lean = (h - 0.2) * 8;
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - 10, x + lean, y - 18); g.stroke();
  g.strokeStyle = '#2e9e5a'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.7 + Math.sin(t * 1.5 + h * 9) * 0.05;
    g.beginPath(); g.moveTo(x + lean, y - 18); g.quadraticCurveTo(x + lean + Math.cos(a) * 6, y - 18 + Math.sin(a) * 6 - 2, x + lean + Math.cos(a) * 9, y - 18 + Math.sin(a) * 9 + 3); g.stroke();
  }
}
function hut(g: G, h: number, x: number, y: number) {
  const c = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c'][Math.floor(h * 40) % 4];
  rect(g, c, x - 5, y - 9, 10, 9); for (let i = 0; i < 5; i++) rect(g, '#ffffff66', x - 5 + i * 2, y - 9, 1, 9);
  tri(g, '#f1f3f5', x - 6, y - 9, x + 6, y - 9, x, y - 13);
}
function umbrella(g: G, h: number, x: number, y: number) {
  rect(g, '#ddd', x, y - 9, 1, 9);
  g.fillStyle = h > 0.6 ? '#ff4d6d' : '#ffb020'; g.beginPath(); g.arc(x, y - 8, 6, Math.PI, 0); g.fill();
  rect(g, '#fff', x - 2, y - 13, 1, 5); rect(g, '#fff', x + 2, y - 13, 1, 5);
}

const seaside: BiomeLook = {
  sky: ['#3d8fe0', '#bfe6ff'], haze: '#2f86c9', ridge: '#e4cf95', mid: '#ecd9a2', ground: '#e8d39a', groundDark: '#d4bd80',
  road: '#a77b4f', roadEdge: '#7a5634', roadKind: 'planks', stars: 0,
  backdrop(g, w, y, u, t) {
    rect(g, '#2b7fc4', 0, y - 14, w, 60);
    g.fillStyle = '#7fc4f0';
    for (let i = 0; i < 26; i++) { const x = ((i * 37 - u * 0.5 + t * 4) % (w + 20) + w + 20) % (w + 20) - 10; g.fillRect(x, y - 10 + (i % 5) * 3, 4 + (i % 3) * 2, 1); }
    // distant sail, island and lighthouse
    const sx = ((w * 0.7 - u * 0.15 + t * 2) % (w + 40) + w + 40) % (w + 40) - 20;
    rect(g, '#5a3b22', sx - 4, y - 16, 8, 2); tri(g, '#fff', sx, y - 26, sx, y - 16, sx + 6, y - 17);
    const ix = ((w * 0.25 - u * 0.1) % (w + 60) + w + 60) % (w + 60) - 30;
    g.fillStyle = '#4a8a5a'; g.beginPath(); g.ellipse(ix, y - 14, 16, 4, 0, Math.PI, 0); g.fill();
    rect(g, '#f2f2f2', ix - 1, y - 26, 3, 9); rect(g, '#e03131', ix - 1, y - 23, 3, 2);
    if (Math.sin(t * 2) > 0.6) disc(g, '#fff6a0', ix + 0.5, y - 27, 1.5);
  },
  midProp(g, h, x, y, t) {
    if (h < 0.3) palm(g, h, x, y, t);
    else if (h < 0.4) hut(g, h, x, y);
    else if (h < 0.5) umbrella(g, h, x, y);
    else if (h < 0.54) { disc(g, '#b9b4a8', x, y - 2, 3); disc(g, '#cfcabe', x + 3, y - 1.5, 2); }
    else if (h < 0.58) { g.strokeStyle = '#ff922b'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 3, y - 6); g.lineTo(x + 3, y - 6); g.lineTo(x, y - 1); g.closePath(); g.stroke(); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.25) { disc(g, '#fff4e6', x, y - 1, 1.5); rect(g, '#f4a', x, y - 2, 1, 1); }
    else if (h < 0.4) { rect(g, '#c9a96a', x, y - 1, 3, 1); }
    else if (h < 0.45) { g.fillStyle = '#ff6b6b'; g.fillRect(x, y - 2, 3, 2); g.fillRect(x - 1, y - 3, 1, 1); g.fillRect(x + 3, y - 3, 1, 1); }
  },
  celestial(g, w) { disc(g, '#fff9db', w * 0.18, 22, 8); },
};

// ---------------- moon ----------------
function crater(g: G, x: number, y: number, r: number) {
  g.fillStyle = '#6b6b78'; g.beginPath(); g.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9a9aa8'; g.beginPath(); g.ellipse(x, y - r * 0.12, r * 0.8, r * 0.22, 0, 0, Math.PI); g.fill();
}
function lander(g: G, x: number, y: number) {
  g.strokeStyle = '#c9c9d4'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x - 4, y - 6); g.moveTo(x + 7, y); g.lineTo(x + 4, y - 6); g.stroke();
  rect(g, '#d4a72c', x - 5, y - 9, 10, 4); rect(g, '#bfc3cc', x - 3, y - 14, 6, 5); rect(g, '#2b2f3a', x - 1, y - 12, 2, 2);
}
function flag(g: G, x: number, y: number) {
  rect(g, '#ddd', x, y - 14, 1, 14); rect(g, '#fff', x + 1, y - 14, 8, 5);
  rect(g, '#e03131', x + 1, y - 13, 8, 1); rect(g, '#e03131', x + 1, y - 11, 8, 1); rect(g, '#1c3faa', x + 1, y - 14, 3, 3);
}
function dish(g: G, x: number, y: number, t: number) {
  rect(g, '#aaa', x, y - 7, 1, 7);
  g.fillStyle = '#e9ecef'; g.beginPath(); g.ellipse(x, y - 9, 5, 2.5, -0.5 + Math.sin(t * 0.4) * 0.2, 0, Math.PI * 2); g.fill();
  if (Math.sin(t * 3) > 0.3) disc(g, '#ff4d6d', x + 2, y - 11, 1);
}

const moon: BiomeLook = {
  sky: ['#05040d', '#1a1830'], haze: '#3a3a4a', ridge: '#5a5a68', mid: '#77777f', ground: '#8e8e98', groundDark: '#74747e',
  road: '#a7a7b0', roadEdge: '#5e5e68', roadKind: 'dust', stars: 1,
  backdrop(g, w, y, u) { silhouette(g, '#30303e', w, y, u, 34, 70, 9, 0.8); silhouette(g, '#45454f', w, y + 8, u * 1.5, 18, 40, 11, 0.5); },
  midProp(g, h, x, y, t) {
    if (h < 0.3) crater(g, x, y, 4 + h * 10);
    else if (h < 0.42) { disc(g, '#9898a2', x, y - 3, 3 + h * 4); disc(g, '#b0b0ba', x - 1, y - 4, 1.5); }
    else if (h < 0.45) lander(g, x, y);
    else if (h < 0.48) flag(g, x, y);
    else if (h < 0.52) dish(g, x, y, t);
  },
  foreProp(g, h, x, y) {
    if (h < 0.35) rect(g, '#9d9da7', x, y - 2, 2 + h * 4, 2);
    else if (h < 0.5) { g.fillStyle = '#5e5e68'; g.beginPath(); g.ellipse(x, y - 1, 3, 1, 0, 0, Math.PI * 2); g.fill(); }
  },
  celestial(g, w, _h, t) {
    const x = w * 0.78, y = 30;
    disc(g, '#1d5fbf', x, y, 12); // Earth, slowly turning: continents drift across
    g.save(); g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3fa34d';
    for (let i = 0; i < 5; i++) { const cx = x - 16 + (((i * 11 + t * 0.6) % 34) + 34) % 34; g.beginPath(); g.ellipse(cx, y - 6 + i * 3, 4, 2.5, 0.3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffffaa'; g.fillRect(x - 12, y - 2, 24, 1); g.fillRect(x - 8, y + 5, 14, 1);
    g.fillStyle = '#00000066'; g.beginPath(); g.arc(x + 5, y, 12, -Math.PI / 2, Math.PI / 2); g.fill();
    g.restore();
  },
};

export const LOOKS: Record<BiomeId, BiomeLook> = { countryside, seaside, moon };
