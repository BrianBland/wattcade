// All eight Codex cut-out aliens on one generic manifest rig.
//   /dev/td-roster.html?view=grid|poses|parade&t=0
import { SPECS, TAU, loadRig, place, rng, travel, type G } from './td-rig';

// ---------- scene helpers ----------
function groundTile(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, r = rng(seed);
  g.fillStyle = '#211d19'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w, y = r() * h, s = 4 + r() * 26;
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.12})` : `rgba(140,120,95,${0.03 + r() * 0.05})`;
    for (const oy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + oy, s, s * 0.7, r() * TAU, 0, TAU); g.fill(); }
  }
  for (let i = 0; i < (w * h) / 4000; i++) {
    const x = r() * w, y = r() * h, s = 1.5 + r() * 3;
    for (const oy of [-h, 0, h]) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 1, y + oy + 1.5, s, 0, TAU); g.fill(); g.fillStyle = `rgb(${70 + r() * 30},${62 + r() * 25},${52 + r() * 20})`; g.beginPath(); g.arc(x, y + oy, s, 0, TAU); g.fill(); }
  }
  return c;
}
function label(g: G, text: string, sub: string, x: number, y: number, color: string) {
  g.textAlign = 'center'; g.font = '800 18px system-ui, sans-serif'; g.fillStyle = color; g.fillText(text.toUpperCase(), x, y);
  g.font = '500 13px system-ui, sans-serif'; g.fillStyle = 'rgba(232,222,208,0.7)'; g.fillText(sub, x, y + 18); g.textAlign = 'left';
}

// ---------- views ----------
const rigs = await Promise.all(SPECS.map(loadRig));
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'grid';
const cv = document.getElementById('c') as HTMLCanvasElement;
const W = view === 'poses' ? 1600 : 1280, H = view === 'poses' ? 900 : 720;
cv.width = W; cv.height = H;
const g = cv.getContext('2d')!;
const tile = groundTile(320, 360, 7), big = groundTile(W, H, 11);

function grid(t: number) {
  const cw = 320, ch = 360;
  rigs.forEach((r, i) => {
    const x0 = (i % 4) * cw, y0 = Math.floor(i / 4) * ch;
    g.save(); g.beginPath(); g.rect(x0, y0, cw, ch); g.clip();
    const scale = 230 / 480, scroll = r.spec.flying ? (t * 110) % ch : (travel(r.spec, t + i * 0.13).dist * scale) % ch;
    g.drawImage(tile, x0, y0 + scroll - ch); g.drawImage(tile, x0, y0 + scroll);
    place(g, r, x0 + cw / 2, y0 + ch / 2 - 18, -Math.PI / 2, 230, { t: t + i * 0.13 });
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x0, y0 + ch - 50, cw, 50);
    label(g, r.spec.label, r.spec.role, x0 + cw / 2, y0 + ch - 28, r.spec.color);
    g.restore();
    g.strokeStyle = 'rgba(217,164,23,0.6)'; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, cw - 2, ch - 2);
  });
}

function poses(t: number) {
  g.fillStyle = '#16130f'; g.fillRect(0, 0, W, H);
  g.font = '800 24px system-ui, sans-serif'; g.fillStyle = '#e8ded0'; g.fillText('Codex cut-out aliens · four gait phases each (left side mirrored, glow layer on)', 24, 38);
  const cw = W / 8, ch = 200, phases = [0, 0.25, 0.5, 0.75];
  rigs.forEach((r, i) => {
    const cx = i * cw + cw / 2;
    label(g, r.spec.label, r.spec.role, cx, 74, r.spec.color);
    phases.forEach((ph, j) => {
      const cy = 120 + j * ch + ch / 2;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * cw + 6, 120 + j * ch + 4, cw - 12, ch - 8);
      place(g, r, cx, cy, -Math.PI / 2, 175, { t: ph / r.spec.gaitHz + (r.spec.tint ? j * 2 : 0) });
    });
  });
}

type Pt = [number, number];
const LANES: Array<[Pt, Pt, Pt, Pt]> = [
  [[260, -80], [80, 260], [520, 420], [340, 800]],
  [[880, -80], [700, 260], [1180, 420], [960, 800]],
];
function bez(c: [Pt, Pt, Pt, Pt], u: number): Pt {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}
const LUTS = LANES.map((c) => { const L = [0]; let prev = bez(c, 0); for (let i = 1; i <= 400; i++) { const p = bez(c, i / 400); L.push(L[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; } return L; });
function laneAt(li: number, dist: number): { p: Pt; a: number } {
  const L = LUTS[li], len = L[400], dd = ((dist % len) + len) % len; let i = 1; while (i < 400 && L[i] < dd) i++;
  const u = (i - 1 + (dd - L[i - 1]) / (L[i] - L[i - 1] || 1)) / 400, c = LANES[li];
  const p = bez(c, u), qq = bez(c, Math.min(1, u + 0.004)), o = bez(c, Math.max(0, u - 0.004));
  return { p, a: Math.atan2(qq[1] - o[1], qq[0] - o[0]) };
}
function parade(t: number) {
  g.drawImage(big, 0, 0);
  for (const c of LANES) {
    const path = () => { g.beginPath(); g.moveTo(...c[0]); g.bezierCurveTo(...c[1], ...c[2], ...c[3]); };
    g.lineCap = 'round';
    path(); g.strokeStyle = '#4a4238'; g.lineWidth = 230; g.stroke();
    path(); g.strokeStyle = '#0b0a09'; g.lineWidth = 220; g.stroke();
    path(); g.strokeStyle = '#2b261f'; g.lineWidth = 210; g.stroke();
    path(); g.strokeStyle = '#353027'; g.lineWidth = 120; g.stroke();
  }
  // lane 0: blue + red broods; lane 1: purple brood + Stalker + boss. Skitters swarm in a stream.
  const troops: Array<[number, number, number, number]> = [ // rig index, lane, start distance, lateral offset
    [0, 0, 40, -40], [0, 0, 90, 30], [0, 0, 140, -10], [0, 0, 190, 45], [0, 0, 240, -35], [0, 0, 300, 10],
    [2, 0, 420, -25], [3, 0, 560, 30], [2, 0, 700, -10],
    [4, 1, 60, 0], [5, 1, 260, -20], [6, 1, 470, 30], [7, 1, 720, 0],
  ];
  const flying: Array<[number, number, number]> = [[1, 0.0, 380], [1, 0.35, 520]];
  for (const [ri, li, d0, lat] of troops) {
    const r = rigs[ri], tt = t + ri * 0.21 + d0 * 0.01;
    const { p, a } = laneAt(li, d0 + (travel(r.spec, tt).dist - travel(r.spec, ri * 0.21 + d0 * 0.01).dist) * (r.spec.gamePx / 480));
    place(g, r, p[0] - Math.sin(a) * lat, p[1] + Math.cos(a) * lat, a, r.spec.gamePx, { t: tt });
  }
  for (const [ri, off, xx] of flying) { // gliders fly straight over the rock
    const y = ((t * 75 + off * 900) % 900) - 90;
    place(g, rigs[ri], xx + 140 * Math.sin(t * 0.8 + off * 6), y, Math.PI / 2 + 0.25 * Math.cos(t * 0.8 + off * 6), rigs[ri].spec.gamePx, { t: t + off });
  }
  g.font = '700 18px system-ui, sans-serif'; g.fillStyle = 'rgba(232,222,208,0.85)'; g.fillText('Game scale: Skitter 42 px · Warrior 105 px · Hive Tyrant 185 px', 18, 30);
}

function draw(t: number) { if (view === 'poses') poses(t); else if (view === 'parade') parade(t); else grid(t); }
draw(Number(q.get('t') ?? 0));
(window as unknown as { __draw: (t: number) => void; __ready: boolean }).__draw = draw;
(window as unknown as { __ready: boolean }).__ready = true;
