// Cut-out alien rig: pure posing math (no DOM). A puppet is a tree of parts (manifest), each rotated/scaled about its
// pivot. Right-side `_r` parts are mirrored for the left unless an explicit `_l` part exists (the Glider's wings).
// Every pose is a function of a loop phase (0..1), so walk/flap cycles can be pre-rendered as frames.
import type { Species } from './species';

export interface PartDef {
  name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number;
  /** drawn size in manifest pixels (the packed image may be a few px off after rounding) */ w: number; h: number;
}
export interface AlienManifest { id: string; size: [number, number]; centerX: number; centerY: number; lengthPx: number; root: string; parts: PartDef[] }

/** 2D affine [a, b, c, d, e, f] as in canvas setTransform. */
export type Affine = [number, number, number, number, number, number];
export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
export function mul(m: Affine, n: Affine): Affine {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
export const rotate = (deg: number): Affine => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
export const scale = (sx: number, sy: number): Affine => [sx, 0, 0, sy, 0, 0];
export const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const SEG_ORDER: Record<string, number> = { coxa: 0, socket: 0, femur: 1, upper: 1, tube: 1, foot: 1, claw: 2, scythe: 2 };
const WALK = new Set(['front', 'mid', 'rear', 'mid_front', 'mid_rear']);
const EXTRAS = new Set(['crest', 'battering_crest', 'egg_sac', 'posterior_fan']);

export interface Limb { group: string; chain: string[]; order: number }
export interface Rig {
  m: AlienManifest; parts: Map<string, PartDef>;
  /** spine parts (head, plates, tail) ordered head → tail */ body: string[]; tails: string[]; rootIdx: number;
  /** walking legs ordered front → rear */ walking: Limb[]; special: Limb[];
  /** draw order: part instance keys (`name` or `name#r` / `name#l`) by z */ order: string[];
}

/** Parts like wing_r that ship with an explicit wing_l are drawn as-is, not mirrored. */
export const explicitPair = (parts: Map<string, PartDef>, name: string): boolean => name.endsWith('_r') && parts.has(name.slice(0, -2) + '_l');
const mirrored = (parts: Map<string, PartDef>, name: string) => name.endsWith('_r') && !explicitPair(parts, name);

export function buildRig(m: AlienManifest): Rig {
  const parts = new Map(m.parts.map((p) => [p.name, p]));
  const groups = new Map<string, string[]>();
  for (const p of m.parts) {
    if (!mirrored(parts, p.name)) continue;
    const [seg, ...rest] = p.name.slice(0, -2).split('_');
    if (!(seg in SEG_ORDER)) continue;
    const group = rest.join('_');
    (groups.get(group) ?? groups.set(group, []).get(group)!).push(p.name);
  }
  const limbs = [...groups].map(([group, names]) => ({ group, chain: names.sort((a, b) => SEG_ORDER[a.split('_')[0]] - SEG_ORDER[b.split('_')[0]]), order: 0 }));
  const hipY = (l: Limb) => parts.get(l.chain[0])!.pivot[1];
  const walking = limbs.filter((l) => WALK.has(l.group)).sort((a, b) => hipY(a) - hipY(b));
  walking.forEach((l, i) => { l.order = i; });
  const body = m.parts.filter((p) => !p.name.endsWith('_r') && !p.name.endsWith('_l') && !p.name.startsWith('wing') && !EXTRAS.has(p.name))
    .sort((a, b) => a.pivot[1] - b.pivot[1]).map((p) => p.name);
  const keys: string[] = [];
  for (const p of m.parts) { if (mirrored(parts, p.name)) keys.push(`${p.name}#r`, `${p.name}#l`); else keys.push(p.name); }
  const order = keys.sort((a, b) => parts.get(a.split('#')[0])!.z - parts.get(b.split('#')[0])!.z);
  return { m, parts, body, tails: body.filter((n) => n.startsWith('tail')), rootIdx: Math.max(0, body.indexOf(m.root)), walking, special: limbs.filter((l) => !WALK.has(l.group)), order };
}

const TAU = Math.PI * 2;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const frac = (x: number) => x - Math.floor(x);

/**
 * The Ram's thud gait over one full cycle (two steps): each step, one set of legs swings fast while the body surges,
 * then plants with a jolt. Returns the warped leg phase, the body's lead over a constant-speed position
 * (fraction of a step), the squash/stretch `lunge` (+ stretch, − squash), the impact strength and the side rock.
 */
export const THUD_BURST = 0.42;
export function thud(cycle: number): { ph: number; lead: number; lunge: number; impact: number; sway: number } {
  const c = frac(cycle) * 2, n = Math.floor(c), u = c - n;
  const w = u < THUD_BURST ? easeInOut(u / THUD_BURST) : 1, side = n % 2 ? 1 : -1;
  const impact = u >= THUD_BURST ? Math.exp(-(u - THUD_BURST) * 5.6) : 0;
  return { ph: 0.1 + (n + w) * 0.5, lead: w - u, lunge: u < THUD_BURST ? 0.5 * Math.sin((Math.PI * u) / THUD_BURST) : -impact, impact, sway: side * (2 * w - 1) };
}

/** Glider wingbeat loop (three powered beats, then a glide), period in seconds and the spread (1 = forward, full span). */
export const GLIDE_S = 1.6, GLIDE_POSE = 0.92;
export const flapPeriod = (s: Species) => 3 / s.gaitHz + GLIDE_S;
export function flap(s: Species, phase: number): number {
  const beat = 1 / s.gaitHz, u = frac(phase) * flapPeriod(s);
  if (u >= beat * 3) {
    const g = (u - beat * 3) / GLIDE_S, held = (x: number) => GLIDE_POSE + 0.05 * Math.sin(x * GLIDE_S * TAU * 0.7);
    return g < 0.72 ? held(g) : held(0.72) * (1 - easeInOut((g - 0.72) / 0.28));
  }
  const i = Math.floor(u / beat), k = (u % beat) / beat;
  if (k < 0.38) return easeOut(k / 0.38);
  const up = easeInOut((k - 0.38) / 0.62);
  return i === 2 ? 1 - (1 - GLIDE_POSE) * up : 1 - up;
}

export interface Xf { deg: number; sx?: number; sy?: number }
export interface PoseIn {
  /** loop phase 0..1: one gait cycle for walkers, one wingbeat loop for fliers */ phase: number;
  /** 0..1 strike pose (rears up, claws and mandibles open) */ attack?: number;
  /** 0..1 death (legs curl, plates contract) */ dying?: number;
  /** seconds, for the boss's independent scythe strikes (live-composed only) */ t?: number;
}

/** Local transform per part instance key (`name` for centre parts, `name_r` / `name_l` for sides). */
export function pose(r: Rig, s: Species, p: PoseIn): Map<string, Xf> {
  const a = new Map<string, Xf>(), att = p.attack ?? 0, d = p.dying ?? 0, live = 1 - d;
  const th = s.thud ? thud(p.phase) : null;
  // Fliers loop over several beats; give their body/tail motion a whole number of cycles per loop so frames wrap cleanly.
  const ph = th ? th.ph : s.flying ? p.phase * 5 : p.phase;
  const mv = live * (1 - att * 0.8);
  r.body.forEach((n, i) => {
    let deg: number;
    if (i === r.rootIdx) deg = 2.2 * s.bodyAmp * Math.sin(ph * TAU);
    else if (n.startsWith('tail')) { const k = r.tails.indexOf(n) + 1; deg = s.tailAmp * (0.5 + k * 0.18) * Math.sin(ph * TAU - k * 0.75); }
    else deg = (i < r.rootIdx ? -1.6 : 2.1 + Math.max(0, i - r.rootIdx) * 0.35) * s.bodyAmp * Math.sin(ph * TAU - (i - r.rootIdx) * 0.55);
    a.set(n, { deg: deg * (n.startsWith('tail') ? live : Math.max(mv, 0.15)) + d * (i - r.rootIdx) * 2.5 });
  });
  if (th) {
    const root = r.body[r.rootIdx], up = Math.max(0, th.lunge) * live, hit = Math.max(0, -th.lunge) * live;
    a.set(root, { deg: a.get(root)!.deg + 4.5 * th.sway * live, sx: 1 + 0.045 * hit - 0.02 * up, sy: 1 + 0.05 * up - 0.05 * hit });
    if (r.parts.has('battering_crest')) a.set('battering_crest', { deg: -2 * th.sway * live, sx: 1 + 0.04 * hit, sy: 1 + 0.04 * hit });
  }
  const legAmps = [15, 12, 14, 13];
  for (const side of ['r', 'l'] as const) {
    const key = (n: string) => n.slice(0, -2) + '_' + side;
    for (const L of r.walking) {
      const amp = legAmps[Math.min(3, L.order)] * s.legAmp * mv;
      const f = frac(ph + ((L.order + (side === 'r' ? 0 : 1)) % 2) * 0.5), stance = f < 0.6, k = stance ? f / 0.6 : (f - 0.6) / 0.4;
      const swing = stance ? -amp + 2 * amp * k : amp - 2 * amp * easeInOut(k);
      const lift = (stance ? 0 : Math.sin(Math.PI * k)) * mv;
      const front = L.order === 0 ? att : 0; // the front pair rears up to strike
      if (L.chain.length === 3) {
        a.set(key(L.chain[0]), { deg: swing * 0.6 - 18 * front - 10 * d });
        a.set(key(L.chain[1]), { deg: swing * 0.4 - lift * 9 - 20 * front - 25 * d });
        a.set(key(L.chain[2]), { deg: -swing * 0.55 + lift * 14 + 26 * front + 55 * d });
      } else {
        a.set(key(L.chain[0]), { deg: swing * 0.9 - 14 * front - 12 * d });
        a.set(key(L.chain[L.chain.length - 1]), { deg: -swing * 0.5 + lift * 10 + 20 * front + 45 * d, sx: 1 + lift * 0.05, sy: 1 + lift * 0.05 });
      }
    }
    for (const L of r.special) {
      if (L.group === 'scythe_arm') { // rear up, then a fast strike every ~2.5 s (live boss) or on attack
        const c = p.t == null ? 0.5 : frac(p.t / 2.5 + (side === 'r' ? 0 : 0.075));
        const strike = Math.max(att, c < 0.75 ? easeInOut(c / 0.75) : 1 - easeInOut((c - 0.75) / 0.25)) * live;
        a.set(key(L.chain[0]), { deg: -10 * strike + 3 * Math.sin(ph * TAU) - 15 * d });
        a.set(key(L.chain[1]), { deg: -14 * strike - 20 * d });
        a.set(key(L.chain[2]), { deg: -22 * strike + 6 + 40 * d });
      } else if (L.group === 'hanging') { // dangling legs trail behind the beat
        a.set(key(L.chain[0]), { deg: 8 * Math.sin(ph * TAU - 1) });
        a.set(key(L.chain[1]), { deg: 10 * Math.sin(ph * TAU - 1.6) + 30 * d });
      } else { // dorsal tubes etc.: slow sway
        L.chain.forEach((n, i) => a.set(key(n), { deg: 6 * Math.sin(ph * TAU + i * 0.8 + (side === 'l' ? 1.2 : 0)) * live }));
      }
    }
    a.set(`mandible_${side}`, { deg: 6 * Math.sin(ph * TAU + (side === 'l' ? 0.4 : 0)) * live + 18 * att - 15 * d });
  }
  if (s.flying) {
    const f = d > 0 ? GLIDE_POSE * (1 - d * 0.5) : flap(s, p.phase), sweep = 26 - 40 * f, span = 0.42 + 0.63 * f, chord = 0.86 + 0.14 * f;
    a.set('wing_r', { deg: sweep + 30 * d, sx: span, sy: chord });
    a.set('wing_l', { deg: -sweep - 30 * d, sx: span, sy: chord });
  }
  if (r.parts.has('egg_sac')) { const k = 1 + 0.035 * Math.sin(ph * TAU) * live - 0.1 * d; a.set('egg_sac', { deg: 0, sx: k, sy: k }); }
  if (r.parts.has('posterior_fan')) a.set('posterior_fan', { deg: 5 * Math.sin(ph * TAU) * live });
  if (r.parts.has('crest')) a.set('crest', { deg: 0, sx: 1 + 0.03 * Math.sin(ph * TAU) * live, sy: 1 });
  return a;
}

/** World transform (manifest frame) for every part instance key in `r.order`. */
export function matrices(r: Rig, ang: Map<string, Xf>): Map<string, Affine> {
  const out = new Map<string, Affine>();
  const MIRROR: Affine = [-1, 0, 0, 1, 2 * r.m.centerX, 0];
  const visit = (name: string, side: 'r' | 'l' | ''): Affine => {
    const key = side ? `${name}#${side}` : name;
    const hit = out.get(key); if (hit) return hit;
    const p = r.parts.get(name)!, paired = mirrored(r.parts, name), parentPaired = !!p.parent && mirrored(r.parts, p.parent);
    let m = p.parent ? visit(p.parent, parentPaired ? side : '') : IDENTITY;
    if (paired && side === 'l' && !parentPaired) m = mul(m, MIRROR); // enter mirrored space at the chain's root
    const x = ang.get(paired ? name.slice(0, -2) + '_' + side : name) ?? { deg: 0 };
    m = mul(m, mul(translate(p.pivot[0], p.pivot[1]), mul(rotate(x.deg), mul(scale(x.sx ?? 1, x.sy ?? 1), translate(-p.pivot[0], -p.pivot[1])))));
    out.set(key, m); return m;
  };
  for (const key of r.order) { const [name, side] = key.split('#'); visit(name, (side ?? '') as 'r' | 'l' | ''); }
  return out;
}
