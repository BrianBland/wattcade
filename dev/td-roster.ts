// All eight Codex cut-out aliens on one generic manifest rig.
//   /dev/td-roster.html?view=grid|poses|parade&t=0
export {};
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ROOT = '/docs/towerdefense/concept/codex/';

interface Part { name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number }
interface Manifest { size: [number, number]; centerX: number; parts: Part[]; neutralGlow?: boolean }
interface Spec {
  id: string; dir: string; label: string; role: string; color: string;
  gamePx: number; gaitHz: number; stride: number; legAmp: number; bodyAmp: number; tailAmp: number;
  flying?: boolean; tint?: boolean; thud?: boolean;
}
const SPECS: Spec[] = [
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
interface Rig {
  spec: Spec; m: Manifest; parts: Map<string, Part>; img: Map<string, HTMLImageElement>; glow: Map<string, HTMLImageElement>;
  body: string[]; tails: string[]; walking: Leg[]; special: Leg[]; cy: number;
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
const SEG_ORDER: Record<string, number> = { coxa: 0, socket: 0, femur: 1, upper: 1, tube: 1, foot: 1, claw: 2, scythe: 2 };
const WALK = new Set(['front', 'mid', 'rear', 'mid_front', 'mid_rear']);

async function loadRig(spec: Spec): Promise<Rig> {
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
function travel(s: Spec, t: number): Travel {
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
function flap(s: Spec, t: number): number {
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
interface Pose { t: number; speed?: number /* 0 = idle */ }
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
function place(g: G, r: Rig, x: number, y: number, heading: number, px: number, p: Pose) {
  const c = creatureCanvas(r, p), s = px / 480, cx = r.m.centerX, cy = r.cy;
  const alt = r.spec.flying ? 1 : 0, f = alt ? flap(r.spec, p.t) : 0;
  g.save(); g.translate(x, y); g.rotate(heading + Math.PI / 2); g.scale(s, s);
  if (r.spec.thud) { const tr = travel(r.spec, p.t); if (tr.dust > 0.05) dust(g, tr.dust, tr.step); }
  g.save(); g.filter = alt ? 'brightness(0) blur(6px)' : 'brightness(0)'; g.globalAlpha = alt ? 0.3 : 0.5;
  const sh = alt ? 80 + 25 * (1 - f) : 14; g.drawImage(c, -PAD - cx + sh * 0.6, -PAD - cy + sh); g.restore();
  const bob = alt ? 1 + 0.045 * (1 - f) : 1; // rises on the upstroke, sinks as the wings bite
  g.scale(bob, bob); g.drawImage(c, -PAD - cx, -PAD - cy);
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

// ---------- scene helpers ----------
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
