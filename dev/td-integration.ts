// Integration check for the art PRs (#135 towers, #136 outpost, #138 environment) plus the cut-out aliens, at true scale.
//   /dev/td-integration.html?w=1366&h=1024&inset=120&panels=1&alien=1&t=0
// Needs the PR assets under public/td/ (towers, outpost, environment).
import { layout } from '../src/games/towerdefense/render/layout';
import { KINDS, type Kind } from '../src/games/towerdefense/sim/defs';
import { SPECS, loadRig, place, type Aids, type G } from './td-rig';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1366), H = Number(q.get('h') ?? 1024), INSET = Number(q.get('inset') ?? 120);
const PANELS = q.get('panels') !== '0', ALIEN = Number(q.get('alien') ?? 1), DPR = window.devicePixelRatio || 1;
// Background mock-ups: floor=dark darkens the brown trench floors; rock=calm flattens plateau rubble contrast.
const FLOOR = q.get('floor') ?? '', ROCK = q.get('rock') ?? '';
// bluetint simulates Codex's lighter crystal re-tone of the blue brood; rim = soft brood-colour outline on every alien.
const BLUE_TINT = Number(q.get('bluetint') ?? 0), RIM = Number(q.get('rim') ?? 0);
const TD = '/td/';
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
const json = async <T>(src: string) => (await fetch(src)).json() as Promise<T>;

interface PPart { name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number; minLevel?: number }
interface Puppet { m: { size: [number, number]; parts: PPart[]; anchors?: Record<string, { parent: string; position?: [number, number] }> }; img: Map<string, HTMLImageElement>; glow: Map<string, HTMLImageElement> }
async function puppet(dir: string): Promise<Puppet> {
  const m = await json<Puppet['m']>(dir + 'manifest.json'), img = new Map(), glow = new Map();
  await Promise.all(m.parts.map(async (p) => { img.set(p.name, await loadImg(dir + p.file)); glow.set(p.name, await loadImg(dir + p.glow)); }));
  return { m, img, glow };
}
/** Draws a puppet with parent-chained rotations; `show` filters parts, `rot` gives local rotation (deg). */
function drawPuppet(g: G, P: Puppet, base: DOMMatrix, show: (p: PPart) => boolean, rot: (n: string) => number) {
  const parts = new Map(P.m.parts.map((p) => [p.name, p])), M = new Map<string, DOMMatrix>();
  const mat = (n: string): DOMMatrix => {
    const hit = M.get(n); if (hit) return hit;
    const p = parts.get(n)!, m = (p.parent ? mat(p.parent) : base).translate(p.pivot[0], p.pivot[1]).rotate(rot(n)).translate(-p.pivot[0], -p.pivot[1]);
    M.set(n, m); return m;
  };
  const list = P.m.parts.filter(show).sort((a, b) => a.z - b.z);
  for (const pass of [P.img, P.glow]) {
    g.globalCompositeOperation = pass === P.img ? 'source-over' : 'lighter';
    for (const p of list) { g.setTransform(new DOMMatrix([DPR, 0, 0, DPR, 0, 0]).multiply(mat(p.name))); g.drawImage(pass.get(p.name)!, p.offset[0], p.offset[1]); }
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'source-over';
  return (n: string, pos: [number, number]) => mat(n).transformPoint(new DOMPoint(pos[0], pos[1]));
}

const [bg, layoutJson, outpost, towers, rigs] = await Promise.all([
  loadImg(TD + 'environment/background.webp'),
  json<{ field: { x: number; y: number; size: number }; lanes: Array<{ controls: Array<[number, number]> }>; pads: Array<{ id: number; position: [number, number]; footprintRadius: number }>; outpost: { position: [number, number]; footprintRadius: number } }>(TD + 'environment/map-layout.json'),
  puppet(TD + 'outpost/'),
  Promise.all(['tesla', 'mortar', 'prism'].map((t) => puppet(`${TD}towers/${t}/`))),
  Promise.all(SPECS.map(loadRig)),
]);

function treatBackground(img: HTMLImageElement): CanvasImageSource {
  if (!FLOOR && !ROCK) return img;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i], gg = a[i + 1], b = a[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
    const sat = mx ? (mx - mn) / mx : 0, floor = r > gg && gg > b ? Math.min(1, Math.max(0, (sat - 0.22) / 0.15)) * Math.min(1, Math.max(0, (lum - 0.22) / 0.12)) : 0;
    let f = 1, keepSat = 1;
    if (FLOOR === 'dark') { f = 1 - 0.55 * floor; keepSat = 1 - 0.45 * floor; } else if (FLOOR === 'mid') { f = 1 - 0.32 * floor; keepSat = 1 - 0.3 * floor; }
    const rockW = 1 - floor;
    let R = r, G = gg, B = b;
    if (ROCK === 'calm' && rockW > 0) { const m = 52; R = r + (m - r) * 0.55 * rockW; G = gg + (m * 0.92 - gg) * 0.55 * rockW; B = b + (m * 0.82 - b) * 0.55 * rockW; }
    const gray = R * 0.3 + G * 0.59 + B * 0.11;
    a[i] = (gray + (R - gray) * keepSat) * f; a[i + 1] = (gray + (G - gray) * keepSat) * f; a[i + 2] = (gray + (B - gray) * keepSat) * f;
  }
  x.putImageData(d, 0, 0); return c;
}
const bgImg = treatBackground(bg);
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * DPR; cv.height = H * DPR; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
const g = cv.getContext('2d')!;
const L = layout(W, H, INSET);
const field = PANELS ? L.field : (() => { const s = L.UH - 20; return { x: Math.round((W - s) / 2), y: 10, s }; })();
const k = field.s / 100; // px per field unit
const X = (u: number) => field.x + u * k, Y = (u: number) => field.y + u * k;

type Pt = [number, number];
function bez(c: Pt[], u: number): Pt { const v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u; return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]; }
function laneAt(li: number, u: number): { p: Pt; a: number } {
  const c = layoutJson.lanes[li].controls, p = bez(c, u), q2 = bez(c, Math.min(1, u + 0.004)), o = bez(c, Math.max(0, u - 0.004));
  return { p, a: Math.atan2(q2[1] - o[1], q2[0] - o[0]) };
}
const SPEC_OF: Record<Kind, string> = { mini: 'skitter', dart: 'glider', brute: 'warrior', charger: 'ram', armor: 'bulwark', carrier: 'broodmother', prism: 'stalker', boss: 'tyrant' };
/** On-screen body length for a sim kind: legs and tail reach ~2.6 collision radii. */
const alienPx = (kind: Kind) => KINDS[kind].radius * 2.6 * k * ALIEN;

function aidsFor(id: string): Aids {
  const blue = id === 'skitter' || id === 'glider';
  return { tint: blue ? BLUE_TINT : 0, rim: RIM, rimPx: 1 };
}
function draw(t: number) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#1b1814'; g.fillRect(0, 0, W, H);
  const is = field.s / layoutJson.field.size;
  g.drawImage(bgImg, field.x - layoutJson.field.x * is, field.y - layoutJson.field.y * is, bg.width * is, bg.height * is);
  // outpost: 22-unit footprint, flamer head this wave
  const op = layoutJson.outpost, ds = (op.footprintRadius * 2 * k) / 440;
  const obase = new DOMMatrix().translate(X(op.position[0]), Y(op.position[1])).scale(ds).translate(-260, -260);
  const oAnchor = drawPuppet(g, outpost, obase, (p) => !p.name.startsWith('damage') && !/gatling|rail/.test(p.name),
    (n) => (n === 'flywheel' ? t * 200 : n === 'head_flamer' ? -8 : 0));
  // towers on the new plateau pads
  const plan: Array<[number, number, number]> = [[0, 0, 1], [1, 1, 3], [2, 2, 5], [3, 0, 5], [4, 1, 1], [5, 2, 3]]; // pad, tower, level
  for (const [pi, ti, lvl] of plan) {
    const pad = layoutJson.pads[pi], P = towers[ti], ts = (pad.footprintRadius * 2 * k) / 136;
    const base = new DOMMatrix().translate(X(pad.position[0]), Y(pad.position[1])).scale(ts).translate(-112, -112);
    const a = oAnchor('deck', [260, 140]), anchor = drawPuppet(g, P, base, (p) => (p.minLevel ?? 1) <= lvl, (n) => (ti === 1 && n === 'head' ? 30 * Math.sin(t + pi) : 0));
    const c = anchor('pad', [177, 112]);
    g.strokeStyle = 'rgba(10,10,10,0.85)'; g.lineWidth = 0.55 * k; g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo((a.x + c.x) / 2, (a.y + c.y) / 2 - 3 * k, c.x, c.y); g.stroke();
  }
  // aliens at sim-derived sizes on the new lanes
  const troops: Array<[Kind, number, number, number]> = [
    ['mini', 0, 0.16, -0.8], ['mini', 0, 0.2, 0.9], ['mini', 0, 0.24, 0], ['mini', 0, 0.29, -1], ['mini', 0, 0.33, 1], ['brute', 0, 0.48, 0], ['brute', 0, 0.62, 0.6],
    ['armor', 1, 0.2, 0], ['carrier', 1, 0.38, 0], ['prism', 1, 0.55, 0], ['mini', 1, 0.7, 0.8], ['mini', 1, 0.74, -0.6],
    ['charger', 2, 0.25, 0], ['brute', 2, 0.42, -0.6], ['boss', 2, 0.64, 0],
  ];
  for (const [kind, li, u, lat] of troops) {
    const r = rigs.find((x) => x.spec.id === SPEC_OF[kind])!, { p, a } = laneAt(li, u);
    place(g, r, X(p[0]) - Math.sin(a) * lat * k, Y(p[1]) + Math.cos(a) * lat * k, a, alienPx(kind) * (kind === 'mini' ? 1.3 : 1), { t: t + u * 7 }, aidsFor(r.spec.id));
  }
  const gl = rigs.find((x) => x.spec.id === 'glider')!;
  place(g, gl, X(58), Y(28), Math.PI / 2 + 0.3, alienPx('dart') * 1.15, { t }, aidsFor('glider'));
  place(g, gl, X(26), Y(40), Math.PI / 2 - 0.2, alienPx('dart') * 1.15, { t: t + 1 }, aidsFor('glider'));
  // current panels + shell HUD band
  if (PANELS && L.wide) for (const b of [L.left, L.right]) { g.fillStyle = 'rgba(12,14,20,0.82)'; g.fillRect(b.x, b.y, b.w, b.h); }
  g.fillStyle = 'rgba(8,10,14,0.88)'; g.fillRect(0, H - INSET, W, INSET);
  g.fillStyle = 'rgba(232,222,208,0.8)'; g.font = '600 15px system-ui, sans-serif';
  g.fillText(`${W}×${H} @${DPR}x · field ${field.s}px (${k.toFixed(2)} px/unit) · aliens ×${ALIEN} of sim size · Warrior ${Math.round(alienPx('brute'))}px · Skitter ${Math.round(alienPx('mini'))}px · Tyrant ${Math.round(alienPx('boss'))}px`, 16, H - INSET + 28);
  g.fillText(PANELS ? 'current layout (side panels)' : 'full-height field (no side panels, as #126 could allow)', 16, H - INSET + 52);
}
draw(Number(q.get('t') ?? 0.4));
(window as unknown as { __draw: (t: number) => void; __ready: boolean }).__draw = draw;
(window as unknown as { __ready: boolean }).__ready = true;
