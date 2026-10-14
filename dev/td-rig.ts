// Generic cut-out puppet rig for the Dynamo Defense aliens (Codex *-parts manifests). Shared by the dev pages.
export type G = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
const ROOT = '/docs/towerdefense/concept/codex/';

interface Part { name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number }
interface Manifest { size: [number, number]; centerX: number; parts: Part[]; neutralGlow?: boolean }
export interface Spec {
  id: string; dir: string; label: string; role: string; color: string;
  gamePx: number; gaitHz: number; stride: number; legAmp: number; bodyAmp: number; tailAmp: number;
  flying?: boolean; tint?: boolean; thud?: boolean;
}
export const SPECS: Spec[] = [
  { id: 'skitter', dir: 'skitter-parts', label: 'Skitter', role: 'swarm · Gatling', color: '#45d2ff', gamePx: 42, gaitHz: 2.6, stride: 70, legAmp: 1, bodyAmp: 0.8, tailAmp: 7 },
  { id: 'glider', dir: 'glider-parts', label: 'Glider', role: 'flier · Gatling', color: '#45d2ff', gamePx: 78, gaitHz: 1.1, stride: 0, legAmp: 0.4, bodyAmp: 0.5, tailAmp: 6, flying: true },
  { id: 'warrior', dir: 'warrior-parts', label: 'Warrior', role: 'brute · Flamer', color: '#ff6a2a', gamePx: 105, gaitHz: 1.5, stride: 80, legAmp: 1, bodyAmp: 1, tailAmp: 3 },
  { id: 'ram', dir: 'ram-parts', label: 'Ram', role: 'charger · Flamer', color: '#ff6a2a', gamePx: 105, gaitHz: 1.4, stride: 80, legAmp: 1.5, bodyAmp: 0.5, tailAmp: 2, thud: true },
  { id: 'bulwark', dir: 'bulwark-parts', label: 'Bulwark', role: 'armoured · Rail', color: '#b97cff', gamePx: 112, gaitHz: 1.1, stride: 45, legAmp: 1.1, bodyAmp: 0.35, tailAmp: 2 },
  { id: 'broodmother', dir: 'broodmother-parts', label: 'Broodmother', role: 'carrier · Rail', color: '#b97cff', gamePx: 120, gaitHz: 1.0, stride: 55, legAmp: 0.85, bodyAmp: 0.6, tailAmp: 2 },
  { id: 'stalker', dir: 'stalker-parts', label: 'Stalker', role: 'shifting colour', color: '#ffffff', gamePx: 110, gaitHz: 1.8, stride: 85, legAmp: 1, bodyAmp: 1.2, tailAmp: 7, tint: true },
  { id: 'tyrant', dir: 'hive-tyrant-parts', label: 'Hive Tyrant', role: 'boss · phases', color: '#ffcf3a', gamePx: 185, gaitHz: 0.8, stride: 70, legAmp: 0.9, bodyAmp: 0.8, tailAmp: 4 },
];

// ---------- loading + per-species analysis ----------
interface Leg { group: string; chain: string[]; hipY: number; order: number }
export interface Rig {
  spec: Spec; m: Manifest; parts: Map<string, Part>; img: Map<string, HTMLImageElement>; glow: Map<string, HTMLImageElement>;
  body: string[]; tails: string[]; walking: Leg[]; special: Leg[]; cy: number;
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
const SEG_ORDER: Record<string, number> = { coxa: 0, socket: 0, femur: 1, upper: 1, tube: 1, foot: 1, claw: 2, scythe: 2 };
const WALK = new Set(['front', 'mid', 'rear', 'mid_front', 'mid_rear']);

export async function loadRig(spec: Spec): Promise<Rig> {
  const base = ROOT + spec.dir + '/';
  const m = await (await fetch(base + 'manifest.json')).json() as Manifest;
  const parts = new Map(m.parts.map((p) => [p.name, p]));
  const img = new Map<string, HTMLImageElement>(), glow = new Map<string, HTMLImageElement>();
  await Promise.all(m.parts.map(async (p) => { img.set(p.name, await loadImg(base + p.file)); glow.set(p.name, await loadImg(base + p.glow)); }));
  const groups = new Map<string, string[]>();
  for (const p of m.parts) {
    if (!p.name.endsWith('_r')) continue;
    const [seg, ...rest] = p.name.slice(0, -2).split('_');
    const group = rest.join('_');
    if (!(seg in SEG_ORDER)) continue;
    (groups.get(group) ?? groups.set(group, []).get(group)!).push(p.name);
  }
  const legs: Leg[] = [...groups].map(([group, names]) => {
    const chain = names.sort((a, b) => SEG_ORDER[a.split('_')[0]] - SEG_ORDER[b.split('_')[0]]);
    return { group, chain, hipY: parts.get(chain[0])!.pivot[1], order: 0 };
  });
  const walking = legs.filter((l) => WALK.has(l.group)).sort((a, b) => a.hipY - b.hipY);
  walking.forEach((l, i) => { l.order = i; });
  const body = m.parts.filter((p) => !p.name.endsWith('_r') && !p.name.startsWith('wing') && !['crest', 'battering_crest', 'egg_sac', 'posterior_fan'].includes(p.name))
    .sort((a, b) => a.pivot[1] - b.pivot[1]).map((p) => p.name);
  const ys = m.parts.map((p) => p.pivot[1]);
  return { spec, m, parts, img, glow, body, tails: body.filter((n) => n.startsWith('tail')), walking, special: legs.filter((l) => !WALK.has(l.group)), cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// ---------- travel: gait phase + distance over time ----------
interface Travel { ph: number; dist: number; mv: number; lunge: number; dust: number; sway: number; step: number }
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const THUD_STEP = 0.62, THUD_BURST = 0.42;
export function travel(s: Spec, t: number): Travel {
  if (!s.thud) return { ph: t * s.gaitHz, dist: t * s.gaitHz * s.stride, mv: 1, lunge: 0, dust: 0, sway: 0, step: 0 };
  // Ram: alternating thuds. Each step, one set of legs swings fast while the body surges, then plants with a jolt.
  // Steps start at gait phase 0.1 + n/2, where one tripod's swing window (0.4 of the cycle) begins.
  const n = Math.floor(t / THUD_STEP), u = (t - n * THUD_STEP) / THUD_STEP;
  const w = u < THUD_BURST ? easeInOut(u / THUD_BURST) : 1, D = s.stride * 0.6, side = n % 2 ? 1 : -1;
  const impact = u >= THUD_BURST ? Math.exp(-(u - THUD_BURST) * THUD_STEP * 9) : 0;
  return { ph: 0.1 + n * 0.5 + 0.5 * w, dist: n * D + D * w, mv: 1, lunge: u < THUD_BURST ? 0.5 * Math.sin(Math.PI * u / THUD_BURST) : -impact, dust: impact, sway: side * (2 * w - 1), step: n };
}
/** Glider wingbeat: three powered beats, then a glide. 1 = wings swept forward and fully spread. */
const GLIDE_S = 1.6, GLIDE_POSE = 0.92;
export function flap(s: Spec, t: number): number {
  const beat = 1 / s.gaitHz, u = t % (beat * 3 + GLIDE_S);
  if (u >= beat * 3) { // glide, then raise the wings for the next downstroke
    const g = (u - beat * 3) / GLIDE_S, held = (x: number) => GLIDE_POSE + 0.05 * Math.sin(x * GLIDE_S * TAU * 0.7);
    return g < 0.72 ? held(g) : held(0.72) * (1 - easeInOut((g - 0.72) / 0.28));
  }
  const i = Math.floor(u / beat), k = (u % beat) / beat;
  if (k < 0.38) return easeOut(k / 0.38);
  const up = easeInOut((k - 0.38) / 0.62);
  return i === 2 ? 1 - (1 - GLIDE_POSE) * up : 1 - up; // the last beat settles into the glide pose
}

// ---------- posing ----------
export interface Pose { t: number; speed?: number /* 0 = idle */ }
interface Xf { deg: number; sx?: number; sy?: number }
function pose(r: Rig, p: Pose): Map<string, Xf> {
  const s = r.spec, a = new Map<string, Xf>(), tr = travel(s, p.t), ph = tr.ph, mv = (p.speed ?? 1) * tr.mv;
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  // body: yaw wave from head to tail; the tail whips with growing amplitude
  const rootIdx = r.body.indexOf(r.m.parts.find((q) => q.parent === null)!.name);
  r.body.forEach((n, i) => {
    const lag = (i - rootIdx) * 0.55;
    let deg: number;
    if (i === rootIdx) deg = 2.2 * s.bodyAmp * Math.sin(ph * TAU);
    else if (n.startsWith('tail')) { const k = r.tails.indexOf(n) + 1; deg = (s.tailAmp * (0.5 + k * 0.18)) * Math.sin(ph * TAU * (s.flying ? 0.5 : 1) - k * 0.75); }
    else deg = (i < rootIdx ? -1.6 : 2.1 + Math.max(0, i - rootIdx) * 0.35) * s.bodyAmp * Math.sin(ph * TAU - lag);
    a.set(n, { deg: deg * (n.startsWith('tail') ? 1 : Math.max(mv, 0.15)) });
  });
  if (s.thud) { // rock toward the planted side; stretch into the surge, squash on the thud
    const root = r.body[rootIdx], up = Math.max(0, tr.lunge), hit = Math.max(0, -tr.lunge);
    a.set(root, { deg: a.get(root)!.deg + 4.5 * tr.sway, sx: 1 + 0.045 * hit - 0.02 * up, sy: 1 + 0.05 * up - 0.05 * hit });
    if (r.parts.has('battering_crest')) a.set('battering_crest', { deg: -2 * tr.sway, sx: 1 + 0.04 * hit, sy: 1 + 0.04 * hit });
  }
  // walking legs: alternate front→rear, sides in antiphase
  const legAmps = [15, 12, 14, 13];
  for (const side of ['r', 'l'] as const) {
    for (const L of r.walking) {
      const amp = legAmps[Math.min(3, L.order)] * s.legAmp * mv;
      const off = ((L.order + (side === 'r' ? 0 : 1)) % 2) * 0.5;
      const f = (ph + off) % 1, stance = f < 0.6, k = stance ? f / 0.6 : (f - 0.6) / 0.4;
      const swing = stance ? -amp + 2 * amp * k : amp - 2 * amp * ease(k);
      const lift = (stance ? 0 : Math.sin(Math.PI * k)) * mv;
      const key = (n: string) => n.replace(/_r$/, `_${side}`);
      if (L.chain.length === 3) {
        a.set(key(L.chain[0]), { deg: swing * 0.6 });
        a.set(key(L.chain[1]), { deg: swing * 0.4 - lift * 9 });
        a.set(key(L.chain[2]), { deg: -swing * 0.55 + lift * 14 });
      } else {
        a.set(key(L.chain[0]), { deg: swing * 0.9 });
        a.set(key(L.chain[L.chain.length - 1]), { deg: -swing * 0.5 + lift * 10, sx: 1 + lift * 0.05, sy: 1 + lift * 0.05 });
      }
    }
    for (const L of r.special) {
      const key = (n: string) => n.replace(/_r$/, `_${side}`), sgn = side === 'r' ? 0 : 0.5;
      if (L.group === 'scythe_arm') { // rear up, then a fast strike every ~2.5 s
        const c = ((p.t / 2.5) + sgn * 0.15) % 1, strike = c < 0.75 ? ease(c / 0.75) : 1 - ease((c - 0.75) / 0.25);
        a.set(key(L.chain[0]), { deg: -10 * strike + 3 * Math.sin(ph * TAU) });
        a.set(key(L.chain[1]), { deg: -14 * strike });
        a.set(key(L.chain[2]), { deg: -22 * strike + 6 });
      } else if (L.group === 'hanging') { // dangling legs trail behind the flap
        a.set(key(L.chain[0]), { deg: 8 * Math.sin(ph * TAU - 1) });
        a.set(key(L.chain[1]), { deg: 10 * Math.sin(ph * TAU - 1.6) });
      } else { // dorsal tubes etc.: slow sway
        L.chain.forEach((n, i) => a.set(key(n), { deg: 6 * Math.sin(p.t * TAU * 0.6 + i * 0.8 + (side === 'l' ? 1.2 : 0)) }));
      }
    }
    a.set(`mandible_${side}`, { deg: 6 * Math.sin(ph * TAU * 0.5 + (side === 'l' ? 0.4 : 0)) });
  }
  // flapping wings: foreshorten across the span (top-down flap) with a little sweep
  if (s.flying) { // sweeping beat: folded back + foreshortened on the upstroke, forward + full span on the downstroke
    const f = flap(s, p.t), sweep = 26 - 40 * f, span = 0.42 + 0.63 * f, chord = 0.86 + 0.14 * f;
    a.set('wing_r', { deg: sweep, sx: span, sy: chord });
    a.set('wing_l', { deg: -sweep, sx: span, sy: chord });
  }
  if (r.parts.has('egg_sac')) { const k = 1 + 0.035 * Math.sin(p.t * TAU * 0.9); a.set('egg_sac', { deg: 0, sx: k, sy: k }); }
  if (r.parts.has('posterior_fan')) a.set('posterior_fan', { deg: 5 * Math.sin(p.t * TAU * 0.7) });
  if (r.parts.has('crest')) a.set('crest', { deg: 0, sx: 1 + 0.03 * Math.sin(p.t * TAU * 0.5), sy: 1 });
  return a;
}
function matrices(r: Rig, ang: Map<string, Xf>): Map<string, DOMMatrix> {
  const out = new Map<string, DOMMatrix>(), cx = r.m.centerX;
  const MIRROR = new DOMMatrix([-1, 0, 0, 1, 2 * cx, 0]);
  const visit = (name: string, side: 'r' | 'l' | ''): DOMMatrix => {
    const key = side ? `${name}#${side}` : name;
    const hit = out.get(key); if (hit) return hit;
    const p = r.parts.get(name)!, paired = name.endsWith('_r') && !explicitPair(r, name), parentPaired = !!p.parent?.endsWith('_r') && !explicitPair(r, p.parent!);
    let m = p.parent ? visit(p.parent, parentPaired ? side : '') : new DOMMatrix();
    if (paired && side === 'l' && !parentPaired) m = m.multiply(MIRROR);
    const x = ang.get(paired ? name.replace(/_r$/, `_${side}`) : name) ?? { deg: 0 };
    m = m.translate(p.pivot[0], p.pivot[1]).rotate(x.deg).scale(x.sx ?? 1, x.sy ?? 1).translate(-p.pivot[0], -p.pivot[1]);
    out.set(key, m); return m;
  };
  for (const p of r.m.parts) {
    if (p.name.endsWith('_r') && !explicitPair(r, p.name)) { visit(p.name, 'r'); visit(p.name, 'l'); } else visit(p.name, '');
  }
  return out;
}
/** Parts like wing_r that ship with an explicit wing_l are drawn as-is, not mirrored. */
const explicitPair = (r: Rig, name: string) => r.parts.has(name.replace(/_r$/, '_l'));

const PAD = 160;
/** One creature, drawn into an offscreen canvas in manifest-frame pixels (padded). */
function creatureCanvas(r: Rig, p: Pose): HTMLCanvasElement {
  const [w, h] = r.m.size;
  const c = document.createElement('canvas'); c.width = w + PAD * 2; c.height = h + PAD * 2;
  const g = c.getContext('2d')!;
  const M = matrices(r, pose(r, p));
  const order = [...M.keys()].sort((a, b) => r.parts.get(a.split('#')[0])!.z - r.parts.get(b.split('#')[0])!.z);
  const base = new DOMMatrix().translate(PAD, PAD);
  const draw = (gg: G, which: Map<string, HTMLImageElement>) => {
    for (const key of order) {
      const name = key.split('#')[0], pt = r.parts.get(name)!;
      gg.setTransform(base.multiply(M.get(key)!)); gg.drawImage(which.get(name)!, pt.offset[0], pt.offset[1]);
    }
    gg.setTransform(1, 0, 0, 1, 0, 0);
  };
  draw(g, r.img);
  const pulse = 0.88 + 0.12 * Math.sin(p.t * TAU * 1.3);
  if (r.spec.tint) { // neutral-white glow and an iridescent shell, both tinted through the brood colours
    const hues = ['#45d2ff', '#ff6a2a', '#b97cff'], u = (p.t / 2) % 3, i = Math.floor(u), f = u - i;
    const col = mix(hues[i], hues[(i + 1) % 3], f < 0.7 ? 0 : easeInOut((f - 0.7) / 0.3));
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.34; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const gl = document.createElement('canvas'); gl.width = c.width; gl.height = c.height;
    const gg = gl.getContext('2d')!; draw(gg, r.glow);
    gg.globalCompositeOperation = 'source-atop'; gg.globalAlpha = 0.9; gg.fillStyle = col; gg.fillRect(0, 0, gl.width, gl.height);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.drawImage(gl, 0, 0); g.globalAlpha = 0.6 * pulse; g.drawImage(gl, 0, 0);
  } else { g.globalCompositeOperation = 'lighter'; g.globalAlpha = pulse; draw(g, r.glow); }
  return c;
}
function mix(a: string, b: string, f: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * f)).join(',')})`;
}
/** Places a creature centred at (x, y), heading in radians (0 = +x), scaled so its 480 px manifest length is `px` long. */
/** Optional readability aids (0..1 strengths), drawn in the brood colour. */
export interface Aids { tint?: number; underglow?: number; rim?: number; rimPx?: number }
function silhouette(c: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d')!; x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, o.width, o.height);
  return o;
}
export function place(g: G, r: Rig, x: number, y: number, heading: number, px: number, p: Pose, aids: Aids = {}) {
  let c = creatureCanvas(r, p);
  const s = px / 480, cx = r.m.centerX, cy = r.cy, col = r.spec.color;
  if (aids.tint) { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const tg = t.getContext('2d')!; tg.drawImage(c, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.globalAlpha = aids.tint; tg.fillStyle = col; tg.fillRect(0, 0, t.width, t.height); c = t; }
  const alt = r.spec.flying ? 1 : 0, f = alt ? flap(r.spec, p.t) : 0;
  g.save(); g.translate(x, y); g.rotate(heading + Math.PI / 2); g.scale(s, s);
  if (r.spec.thud) { const tr = travel(r.spec, p.t); if (tr.dust > 0.05) dust(g, tr.dust, tr.step); }
  if (aids.underglow) { // brood-coloured light pooled on the ground beneath
    const gx = alt ? 50 : 0, gy = (alt ? 80 : 0), R = 300;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, R); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 * aids.underglow; g.fillStyle = gr; g.beginPath(); g.ellipse(gx, gy, R, R * 1.1, 0, 0, TAU); g.fill(); g.restore();
  }
  g.save(); g.filter = alt ? 'brightness(0) blur(6px)' : 'brightness(0)'; g.globalAlpha = alt ? 0.3 : 0.5;
  const sh = alt ? 80 + 25 * (1 - f) : 14; g.drawImage(c, -PAD - cx + sh * 0.6, -PAD - cy + sh); g.restore();
  const bob = alt ? 1 + 0.045 * (1 - f) : 1; // rises on the upstroke, sinks as the wings bite
  g.scale(bob, bob);
  if (aids.rim) { // a thin bright outline: the silhouette offset in 8 directions by ~1.5 screen px
    const sil = silhouette(c, col), o = (aids.rimPx ?? 1.5) / (s * bob);
    g.save(); g.globalAlpha = aids.rim;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.drawImage(sil, -PAD - cx + Math.cos(a) * o, -PAD - cy + Math.sin(a) * o); }
    g.restore();
  }
  g.drawImage(c, -PAD - cx, -PAD - cy);
  g.restore();
}

/** Dust thrown up around the Ram's planted feet on a thud (creature-local pixels, heading up). */
function dust(g: G, a: number, step: number) {
  const rr = rng(step * 7 + 5), side = step % 2 ? 1 : -1;
  for (let i = 0; i < 7; i++) {
    const x = side * (90 + rr() * 110) * (rr() < 0.75 ? 1 : -1), y = -80 + rr() * 260, rad = (25 + rr() * 35) * (1.6 - a * 0.6);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(120,105,85,${0.4 * a})`); gr.addColorStop(1, 'rgba(120,105,85,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  }
}

export function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
