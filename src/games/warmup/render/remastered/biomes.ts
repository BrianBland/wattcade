import { sceneMid } from './art';
// What each biome looks like. Everything is drawn with primitives into a low-res buffer, so it reads as pixel art.
// Props are picked per world slot from a hash, so the same spot always holds the same tree.
import type { BiomeId } from '../../sim/terrain';
import { disc, rect, silhouette, tri, type BiomeLook, type G } from '../paint';
import { contactShadow, grass, oak, polygon, rock } from './scenery';
import { MORE_LOOKS } from './biomesMore';
export { noise1, type G, type BiomeLook } from '../paint';

// ---------------- countryside ----------------
function tree(g: G, h: number, x: number, y: number) {
  oak(g, Math.min(1, h * 2.4), x, y);
}
function windmill(g: G, x: number, y: number, t: number) {
  contactShadow(g, x, y, 7);
  tri(g, '#e8dcc0', x - 4, y, x + 4, y, x, y - 20);
  polygon(g, '#b9a47f', [[x, y - 20], [x + 4, y], [x + 1, y]]);
  rect(g, '#ab8b63', x - 1, y - 13, 2, 2);
  rect(g, '#7a4a2a', x - 1, y - 4, 2, 4);
  g.strokeStyle = '#f4f0e6'; g.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = t * 1.2 + (i * Math.PI) / 2;
    g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + Math.cos(a) * 10, y - 18 + Math.sin(a) * 10); g.stroke();
  }
}
function barn(g: G, x: number, y: number) {
  contactShadow(g, x, y, 13);
  rect(g, '#883d37', x - 10, y - 12, 20, 12);
  rect(g, '#bd6650', x - 10, y - 12, 13, 12);
  polygon(g, '#543b3b', [[x - 13, y - 12], [x - 2, y - 20], [x + 13, y - 12]]);
  polygon(g, '#947367', [[x - 13, y - 12], [x - 2, y - 20], [x + 3, y - 12]]);
  rect(g, '#e5ccb0', x - 11, y - 12, 23, 1);
  for (let i = 0; i < 5; i++) rect(g, '#a34c40', x - 9, y - 10 + i * 2, 12, 1);
  rect(g, '#ecd8b6', x - 2, y - 7, 6, 7); rect(g, '#59433b', x - 1, y - 6, 4, 6);
  rect(g, '#dac6a7', x - 7, y - 9, 3, 3); rect(g, '#607681', x - 6, y - 8, 1, 2);
  rect(g, '#9a6b53', x + 5, y - 19, 2, 5);

}
function sheep(g: G, x: number, y: number) {
  disc(g, '#f4f4ee', x, y - 3, 3); disc(g, '#f4f4ee', x + 2, y - 3.5, 2.5);
  rect(g, '#222', x + 4, y - 4, 2, 2); rect(g, '#222', x - 2, y - 1, 1, 1); rect(g, '#222', x + 2, y - 1, 1, 1);
}

const countryside: BiomeLook = {
  art: 'countryside',
  sky: ['#72b4da', '#e2ebd4'], haze: '#adc7cf', ridge: '#91ab72', mid: '#789d47', ground: '#709342', groundDark: '#4c7033',
  road: '#5c5a63', roadEdge: '#3a3940', roadKind: 'asphalt', stars: 0,
  actor: 'bird', rider: 'road', outdoor: true, ambient: { vol: 0.025, freq: 700 },
  backdrop(g, w, y, u) { silhouette(g, '#adc7cf', w, y - 8, u * .7, 30, 100, 3); silhouette(g, '#89b1a0', w, y + 4, u * 1.3, 24, 70, 4); silhouette(g, '#749b80', w, y + 14, u * 1.9, 16, 45, 5); },
  midProp(g, h, x, y, t) {
    if (sceneMid(g, 'countryside', h, x, y)) return;
    if (h < 0.42) tree(g, h, x, y);
    else if (h < 0.47) windmill(g, x, y, t);
    else if (h < 0.52) barn(g, x, y);
    else if (h < 0.62) { sheep(g, x, y); if (h > 0.57) sheep(g, x + 7, y + 1); }
    else if (h < 0.72) { g.fillStyle = '#7a5a3a'; for (let i = 0; i < 4; i++) g.fillRect(x - 6 + i * 4, y - 4, 1, 4); g.fillRect(x - 6, y - 3, 13, 1); }
    else if (h < 0.76) { disc(g, '#e5c25a', x, y - 2.5, 3); rect(g, '#c9a640', x - 3, y - 2, 6, 1); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.46) grass(g, h, x, y, ['#49692e', '#86a74d', '#b3c571']);
    else if (h < 0.63) { rect(g, '#49692e', x, y - 3, 1, 3); rect(g, h < .54 ? '#e9a6a0' : '#ead488', x - 1, y - 4, 3, 1); rect(g, '#f8efd5', x, y - 5, 1, 3); } else if (h < .69) rock(g, h, x, y, 2 + h, ['#536052', '#7f8c70', '#b7bc94']);
  },
  celestial(g, w) { disc(g, '#fff6c8', w * 0.82, 24, 9); disc(g, '#fff0a0', w * 0.82, 24, 7); },
};

// ---------------- seaside ----------------
function palm(g: G, h: number, x: number, y: number, t: number) {
  const lean = (h - 0.2) * 8;
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - 10, x + lean, y - 18); g.stroke();
  g.strokeStyle = '#d7b77c'; g.lineWidth = .7; g.beginPath(); g.moveTo(x - 1, y); g.quadraticCurveTo(x + lean * .3 - 1, y - 10, x + lean - 1, y - 18); g.stroke();
  contactShadow(g, x, y, 8);
  g.strokeStyle = '#286b4f'; g.lineWidth = 2.8;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.7 + Math.sin(t * 1.5 + h * 9) * 0.05;
    const ex = x + lean + Math.cos(a) * 11, ey = y - 18 + Math.sin(a) * 10 + 3;
    g.strokeStyle = '#286b4f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + lean, y - 18); g.quadraticCurveTo(x + lean + Math.cos(a) * 6, y - 18 + Math.sin(a) * 6 - 2, ex, ey); g.stroke();
    g.strokeStyle = '#71a96b'; g.lineWidth = .8;
    g.beginPath(); g.moveTo(x + lean, y - 19); g.quadraticCurveTo(x + lean + Math.cos(a) * 6, y - 19 + Math.sin(a) * 6 - 2, ex, ey - 1); g.stroke();
  }
}
function hut(g: G, h: number, x: number, y: number) {
  const c = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c'][Math.floor(h * 40) % 4];
  contactShadow(g, x, y, 8);
  rect(g, c, x - 5, y - 9, 10, 9); for (let i = 0; i < 5; i++) rect(g, '#ffffff66', x - 5 + i * 2, y - 9, 1, 9);
  rect(g, '#233b4a40', x + 1, y - 9, 4, 9);
  tri(g, '#f2e9cc', x - 7, y - 9, x + 7, y - 9, x, y - 15);
  tri(g, '#b6b9ab', x, y - 15, x + 7, y - 9, x + 2, y - 9);
  rect(g, '#344a52', x - 2, y - 6, 3, 6);
}
function umbrella(g: G, h: number, x: number, y: number) {
  rect(g, '#ddd', x, y - 9, 1, 9);
  g.fillStyle = h > 0.6 ? '#ff4d6d' : '#ffb020'; g.beginPath(); g.arc(x, y - 8, 6, Math.PI, 0); g.fill();
  rect(g, '#fff', x - 2, y - 13, 1, 5); rect(g, '#fff', x + 2, y - 13, 1, 5);
}

const seaside: BiomeLook = {
  art: 'seaside',
  sky: ['#68b7da', '#deefe4'], haze: '#66a8bd', ridge: '#c9cfa4', mid: '#dfcea2', ground: '#e6d4af', groundDark: '#bba477',
  road: '#a77b4f', roadEdge: '#7a5634', roadKind: 'planks', stars: 0,
  actor: 'gull', rider: 'road', outdoor: true, ambient: { vol: 0.06, freq: 450, q: 0.5 },
  backdrop(g, w, y, u, t) {
    rect(g, '#4b95af', 0, y - 18, w, 60);
    rect(g, '#64b6c6', 0, y - 6, w, 42);
    rect(g, '#a7d8d1', 0, y + 10, w, 25);
    rect(g, '#daede0', 0, y + 18, w, 2);
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
    if (sceneMid(g, 'seaside', h, x, y)) return;
    if (h < 0.3) palm(g, h, x, y, t);
    else if (h < 0.4) hut(g, h, x, y);
    else if (h < 0.5) umbrella(g, h, x, y);
    else if (h < 0.54) { rock(g, h, x, y, 5, ['#73858a', '#a4b4b2', '#d1d6c3']); rock(g, h, x + 5, y, 3, ['#73858a', '#a4b4b2', '#d1d6c3']); }
    else if (h < 0.58) { g.strokeStyle = '#ff922b'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 3, y - 6); g.lineTo(x + 3, y - 6); g.lineTo(x, y - 1); g.closePath(); g.stroke(); }
  },
  foreProp(g, h, x, y) {
    if (h < .17) { rock(g, h, x, y, 2, ['#baa888', '#ddc9aa', '#fff0d6']); } else if (h < .3) grass(g, h, x, y, ['#71885a', '#a1ae70', '#c8cfa0']);
    else if (h < 0.4) { rect(g, '#c9a96a', x, y - 1, 3, 1); }
    else if (h < 0.45) { g.fillStyle = '#ff6b6b'; g.fillRect(x, y - 2, 3, 2); g.fillRect(x - 1, y - 3, 1, 1); g.fillRect(x + 3, y - 3, 1, 1); }
  },
  celestial(g, w) { disc(g, '#fff9db', w * 0.18, 22, 8); },
};

// ---------------- moon ----------------
function crater(g: G, x: number, y: number, r: number) {
  contactShadow(g, x, y + r * .2, r, '#141b3433');
  g.fillStyle = '#b0b6bf'; g.beginPath(); g.ellipse(x, y, r + 1, r * .4 + 1, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#50556a'; g.beginPath(); g.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9a9aa8'; g.beginPath(); g.ellipse(x, y - r * 0.12, r * 0.8, r * 0.22, 0, 0, Math.PI); g.fill();
}
function lander(g: G, x: number, y: number) {
  contactShadow(g, x, y, 10, '#26314d40');
  g.strokeStyle = '#c9c9d4'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x - 4, y - 6); g.moveTo(x + 7, y); g.lineTo(x + 4, y - 6); g.stroke();
  rect(g, '#d4a72c', x - 5, y - 9, 10, 4);
  polygon(g, '#fff0a2', [[x - 5, y - 9], [x + 1, y - 9], [x - 1, y - 5], [x - 5, y - 6]]);
  rect(g, '#8a764b', x + 2, y - 9, 3, 4); rect(g, '#bfc3cc', x - 3, y - 14, 6, 5); rect(g, '#2b2f3a', x - 1, y - 12, 2, 2);
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
  art: 'moon',
  sky: ['#080f22', '#26304b'], haze: '#45516b', ridge: '#68738a', mid: '#818c9e', ground: '#a0aab7', groundDark: '#778296',
  road: '#a7a7b0', roadEdge: '#5e5e68', roadKind: 'dust', stars: 1,
  actor: 'ufo', rider: 'bubble', outdoor: false,
  backdrop(g, w, y, u) { silhouette(g, '#30303e', w, y, u, 34, 70, 9, 0.8); silhouette(g, '#45454f', w, y + 8, u * 1.5, 18, 40, 11, 0.5); },
  midProp(g, h, x, y, t) {
    if (sceneMid(g, 'moon', h, x, y)) return;
    if (h < 0.3) crater(g, x, y, 4 + h * 10);
    else if (h < 0.42) rock(g, h, x, y, 4 + h * 5, ['#4e556b', '#808a9a', '#b5bdc5']);
    else if (h < 0.45) lander(g, x, y);
    else if (h < 0.48) flag(g, x, y);
    else if (h < 0.52) dish(g, x, y, t);
  },
  foreProp(g, h, x, y) {
    if (h < 0.35) rock(g, h, x, y, 2 + h * 4, ['#545e76', '#8e99a9', '#bec7cd']);
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

export const LOOKS: Record<BiomeId, BiomeLook> = { countryside, seaside, moon, ...MORE_LOOKS };
