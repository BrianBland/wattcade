// Segmented Warrior puppet: Codex's 20-part Warrior (docs/towerdefense/concept/codex/warrior-parts) driven by its
// manifest and walked in code: tripod gait, planted claw tips, travelling body-plate wave, additive glow pulse.
//   /dev/td-warrior.html?t=0
export {};
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const BASE = '/docs/towerdefense/concept/codex/warrior-parts/';
interface Part { name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number }
const manifest = await (await fetch(BASE + 'manifest.json')).json() as { size: [number, number]; centerX: number; parts: Part[] };
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = BASE + src; });
const parts = new Map(manifest.parts.map((p) => [p.name, p]));
const img = new Map<string, HTMLImageElement>(), glowImg = new Map<string, HTMLImageElement>();
await Promise.all(manifest.parts.map(async (p) => { img.set(p.name, await load(p.file)); glowImg.set(p.name, await load(p.glow)); }));

const CX = manifest.centerX, CY = 330;
const PAD = 140, OW = manifest.size[0] + PAD * 2, OH = manifest.size[1] + PAD * 2;
const MIRROR = new DOMMatrix([-1, 0, 0, 1, 2 * CX, 0]);
const PLATES = ['head', 'thorax_1', 'thorax_2', 'thorax_3', 'abdomen_1', 'abdomen_2', 'abdomen_3', 'abdomen_4', 'abdomen_5', 'tail_tip'];
const LEGS = [{ id: 'front', amp: 15 }, { id: 'mid', amp: 12 }, { id: 'rear', amp: 14 }] as const;

interface Pose { t: number; gaitHz: number; dying?: number /* 0..1 */ }
/** Local joint angle (degrees, clockwise) for every part; `_l` keys are the mirrored left side, in mirrored space. */
function angles(p: Pose): Map<string, number> {
  const a = new Map<string, number>(), ph = p.t * p.gaitHz, d = p.dying ?? 0, live = 1 - d;
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  // body: a yaw wave that travels from head to tail, one cycle per stride; plates further back swing more
  PLATES.forEach((n, i) => {
    const back = Math.max(0, i - 2);
    a.set(n, live * (n === 'thorax_2' ? 2.2 * Math.sin(ph * TAU) : (i < 2 ? -1.6 : 2.1 + back * 0.35) * Math.sin(ph * TAU - i * 0.55)) + d * (i - 2) * 2.5);
  });
  for (const side of ['r', 'l'] as const) {
    LEGS.forEach((L, i) => {
      const off = ((i + (side === 'r' ? 0 : 1)) % 2) * 0.5; // tripod: R-front, L-mid, R-rear together
      const f = (ph + off) % 1, stance = f < 0.6, k = stance ? f / 0.6 : (f - 0.6) / 0.4;
      const swing = stance ? -L.amp + 2 * L.amp * k : L.amp - 2 * L.amp * ease(k); // forward (−) → back (+)
      const lift = stance ? 0 : Math.sin(Math.PI * k);
      a.set(`coxa_${L.id}_${side}`, live * swing * 0.6 + d * -10);
      a.set(`femur_${L.id}_${side}`, live * (swing * 0.4 - lift * 9) + d * -25); // femur raises (folds in) on the swing
      a.set(`claw_${L.id}_${side}`, live * (-swing * 0.55 + lift * 14) + d * 55); // counter-rotate to plant the tip; curl when dying
    });
    a.set(`mandible_${side}`, live * (6 * Math.sin(ph * TAU * 0.5 + (side === 'l' ? 0.4 : 0))) - d * 15);
  }
  return a;
}
/** World matrix for a part instance (left instances reflect their limb chain about the centre line). */
function matrices(ang: Map<string, number>): Map<string, DOMMatrix> {
  const out = new Map<string, DOMMatrix>();
  const visit = (name: string, side: 'r' | 'l' | ''): DOMMatrix => {
    const key = side ? `${name}#${side}` : name;
    const hit = out.get(key); if (hit) return hit;
    const p = parts.get(name)!, paired = name.endsWith('_r');
    const parentIsPaired = !!p.parent?.endsWith('_r');
    let m = p.parent ? visit(p.parent, parentIsPaired ? side : '') : new DOMMatrix();
    if (paired && side === 'l' && !parentIsPaired) m = m.multiply(MIRROR); // enter mirrored space at the chain's root
    const angKey = paired ? name.replace(/_r$/, `_${side}`) : name;
    const deg = ang.get(angKey) ?? 0;
    m = m.translate(p.pivot[0], p.pivot[1]).rotate(deg).translate(-p.pivot[0], -p.pivot[1]);
    out.set(key, m); return m;
  };
  for (const p of manifest.parts) { if (p.name.endsWith('_r')) { visit(p.name, 'r'); visit(p.name, 'l'); } else visit(p.name, ''); }
  return out;
}
/** Draws one warrior into an offscreen canvas (assembled-frame pixels, padded). */
function warriorCanvas(p: Pose, glow = 1): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = OW; c.height = OH;
  const g = c.getContext('2d')!;
  const M = matrices(angles(p));
  const order = [...M.keys()].sort((a, b) => parts.get(a.split('#')[0])!.z - parts.get(b.split('#')[0])!.z);
  const base = new DOMMatrix().translate(PAD, PAD);
  for (const pass of ['base', 'glow'] as const) {
    if (pass === 'glow') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow; }
    for (const key of order) {
      const name = key.split('#')[0], pt = parts.get(name)!;
      g.setTransform(base.multiply(M.get(key)!));
      g.drawImage((pass === 'base' ? img : glowImg).get(name)!, pt.offset[0], pt.offset[1]);
    }
  }
  return c;
}

/** Puts a warrior on the main canvas centred at (x, y), facing `heading` (radians, 0 = +x), source scale `s`. */
function place(g: G, x: number, y: number, heading: number, s: number, p: Pose, flash = 0) {
  const d = p.dying ?? 0;
  const pulse = (0.88 + 0.12 * Math.sin(p.t * TAU * 1.3)) * (1 - d);
  const w = warriorCanvas(p, pulse);
  g.save(); g.translate(x, y); g.rotate(heading + Math.PI / 2 + d * 2.6); g.scale(s * (1 - d * 0.12), s * (1 - d * 0.12));
  g.save(); g.filter = 'brightness(0)'; g.globalAlpha = 0.5; g.drawImage(w, -PAD - CX + 12, -PAD - CY + 20); g.restore();
  if (d > 0) g.filter = `brightness(${1 - d * 0.6}) sepia(${d * 0.7})`;
  g.drawImage(w, -PAD - CX, -PAD - CY);
  g.filter = 'none';
  if (flash > 0) {
    const f = document.createElement('canvas'); f.width = w.width; f.height = w.height;
    const fg = f.getContext('2d')!; fg.drawImage(w, 0, 0); fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = `rgba(255,236,210,${flash})`; fg.fillRect(0, 0, f.width, f.height);
    g.drawImage(f, -PAD - CX, -PAD - CY);
  }
  g.restore();
}

// ---------- scene ----------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
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
type Pt = [number, number];
const LANE: Pt[] = [[1010, -60], [760, 180], [1180, 420], [930, 790]];
function bez(u: number): Pt {
  const c = LANE, v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}
const LUT: number[] = []; { let L = 0, prev = bez(0); LUT.push(0); for (let i = 1; i <= 400; i++) { const p = bez(i / 400); L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); LUT.push(L); prev = p; } }
const LANE_LEN = LUT[400];
function laneAt(dist: number): { p: Pt; a: number } {
  const dd = Math.max(0, Math.min(LANE_LEN, dist)); let i = 1; while (i < 400 && LUT[i] < dd) i++;
  const u = (i - 1 + (dd - LUT[i - 1]) / (LUT[i] - LUT[i - 1] || 1)) / 400;
  const p = bez(u), q = bez(Math.min(1, u + 0.004)), o = bez(Math.max(0, u - 0.004));
  return { p, a: Math.atan2(q[1] - o[1], q[0] - o[0]) };
}
function splat(g: G, x: number, y: number, r: number, seed: number, a: number) {
  const rr = rng(seed); g.save(); g.globalAlpha = a;
  for (let i = 0; i < 12; i++) { const an = rr() * TAU, d = rr() * r, s = r * (0.2 + rr() * 0.4); g.fillStyle = i < 4 ? 'rgba(0,0,0,0.55)' : i % 2 ? 'rgba(150,170,40,0.75)' : 'rgba(190,70,20,0.7)'; g.beginPath(); g.ellipse(x + Math.cos(an) * d, y + Math.sin(an) * d, s, s * 0.7, an, 0, TAU); g.fill(); }
  g.restore();
}
function glowDot(g: G, x: number, y: number, r: number, c: string, a: number) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(0.2, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
}

const W = 1280, H = 720, SPLIT = 560;
const cv = document.getElementById('c') as HTMLCanvasElement; cv.width = W; cv.height = H;
const g = cv.getContext('2d')!;
const tileL = groundTile(SPLIT, 720, 3), tileR = groundTile(W - SPLIT, 720, 5);

const GAIT = 1.5;           // steps cycles / s
const CLOSE = 1.12;         // close-up scale
const GAME = 0.22;          // game scale (~105 px long)
const STRIDE = 80;          // source px travelled per gait cycle
const SQUAD = [0, 150, 290, 430];
const DIE_AT = 3.6, HURT_FROM = 2.2;

function draw(t: number) {
  // left: close-up walking in place on scrolling ground
  g.save(); g.beginPath(); g.rect(0, 0, SPLIT, H); g.clip();
  const scroll = (t * GAIT * STRIDE * CLOSE) % 720;
  g.drawImage(tileL, 0, scroll - 720); g.drawImage(tileL, 0, scroll);
  place(g, SPLIT / 2, H / 2 + 10, -Math.PI / 2, CLOSE, { t, gaitHz: GAIT });
  const v = g.createRadialGradient(SPLIT / 2, H / 2, 200, SPLIT / 2, H / 2, 520); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, SPLIT, H);
  g.restore();
  // right: game scale in a trench
  g.save(); g.beginPath(); g.rect(SPLIT, 0, W - SPLIT, H); g.clip();
  g.drawImage(tileR, SPLIT, 0);
  const path = () => { g.beginPath(); g.moveTo(...LANE[0]); g.bezierCurveTo(...LANE[1], ...LANE[2], ...LANE[3]); };
  g.lineCap = 'round';
  path(); g.strokeStyle = '#4a4238'; g.lineWidth = 150; g.stroke();
  path(); g.strokeStyle = '#0b0a09'; g.lineWidth = 140; g.stroke();
  path(); g.strokeStyle = '#2b261f'; g.lineWidth = 132; g.stroke();
  path(); g.strokeStyle = '#353027'; g.lineWidth = 80; g.stroke();
  const speed = GAIT * STRIDE * GAME;
  let dieP: Pt | null = null;
  SQUAD.forEach((lag, i) => {
    const dist = 470 + t * speed - lag;
    const { p, a } = laneAt(dist);
    const victim = i === 0;
    const dying = victim && t > DIE_AT ? Math.min(1, (t - DIE_AT) / 0.5) : 0;
    const fd = victim && t > DIE_AT ? DIE_AT : t; // corpse stays put
    const pos = victim && t > DIE_AT ? laneAt(470 + DIE_AT * speed - lag) : { p, a };
    if (victim && t > DIE_AT) { dieP = pos.p; splat(g, pos.p[0], pos.p[1], 34, 9, Math.min(1, dying * 1.5)); }
    const side = (i % 2 ? 1 : -1) * 14;
    const nx = -Math.sin(pos.a) * side, ny = Math.cos(pos.a) * side;
    const flash = victim && t > HURT_FROM && t < DIE_AT ? (Math.sin(t * 40) > 0.3 ? 0.75 : 0) : 0;
    place(g, pos.p[0] + nx, pos.p[1] + ny, pos.a, GAME, { t: fd + i * 0.37, gaitHz: GAIT, dying }, flash);
    if (flash) glowDot(g, pos.p[0] + nx, pos.p[1] + ny, 50, '#ff7a2a', 0.6);
  });
  if (dieP && t < DIE_AT + 0.5) glowDot(g, (dieP as Pt)[0], (dieP as Pt)[1], 120 * (1 - (t - DIE_AT) * 2), '#ffb04a', 0.8);
  g.restore();
  // divider + labels
  g.fillStyle = '#d9a417'; g.fillRect(SPLIT - 2, 0, 4, H);
  g.font = '700 18px system-ui, sans-serif'; g.fillStyle = 'rgba(232,222,208,0.85)';
  g.fillText('Codex 20-part Warrior · rigged from its manifest', 18, 30);
  g.fillText('Game scale (~105 px) · hurt flash · death', SPLIT + 18, 30);
}
draw(Number(new URLSearchParams(location.search).get('t') ?? 0));
(window as unknown as { __draw: (t: number) => void; __ready: boolean }).__draw = draw;
(window as unknown as { __ready: boolean }).__ready = true;
