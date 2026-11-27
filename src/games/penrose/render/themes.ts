/**
 * Penrose Pedals visual themes, three-tone normal shader, atmospheric haze,
 * and shared procedural canvas textures (strict TS, fully disposable).
 */

import * as THREE from 'three';
import type { FaceKey, ThemeId } from '../sim/types';

export interface TriPalette {
  t: string;
  l: string;
  r: string;
}

export type BloomKind = 'iris' | 'flower' | 'helm' | 'crystal' | 'lantern' | 'clock' | 'gyro';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  bloom: BloomKind;
  sky: string;
  stone: TriPalette;
  deck?: TriPalette;
  path?: TriPalette;
  idle: TriPalette;
  mech: TriPalette;
  mechLight?: TriPalette;
  mechDark?: TriPalette;
  accent?: TriPalette;
  leaf?: TriPalette;
  turf?: TriPalette;
  roof?: TriPalette;
  blue?: TriPalette;
  win?: TriPalette;
  pipe?: TriPalette;
  ramp?: readonly TriPalette[];
  ink: string;
  lane: string;
  goal: string;
  spark: string;
  glow?: string;
  trim?: string;
  hazeK?: number;
}

export const FACE_COLORS: Record<FaceKey, string> = {
  y: '#3b82ff',
  a: '#2bd96b',
  b: '#ff4d4d',
  z: '#ff9a2b',
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function mixHex(a: string, b: string, t: number): string {
  const f = clamp01(t);
  const A = hexRgb(a);
  const B = hexRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * f).toString(16).padStart(2, '0');
  const g = Math.round(A[1] + (B[1] - A[1]) * f).toString(16).padStart(2, '0');
  const bl = Math.round(A[2] + (B[2] - A[2]) * f).toString(16).padStart(2, '0');
  return `#${r}${g}${bl}`;
}

export function mixPal(a: TriPalette, b: TriPalette, t: number): TriPalette {
  return { t: mixHex(a.t, b.t, t), l: mixHex(a.l, b.l, t), r: mixHex(a.r, b.r, t) };
}

export function shadeHex(h: string, k: number): string {
  return mixHex(h, k > 0 ? '#ffffff' : '#000000', Math.abs(k));
}

export function tone(h: string, a = 0.82, b = 0.66): TriPalette {
  return { t: h, l: shadeHex(h, -(1 - a)), r: shadeHex(h, -(1 - b)) };
}

export function lum(h: string): number {
  const [r, g, b] = hexRgb(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  dusk: {
    id: 'dusk',
    name: 'Dusk Monument',
    bloom: 'iris',
    sky: 'linear-gradient(180deg,#B9B1E3 0%,#E5C9E2 52%,#FBD3BC 100%)',
    stone: { t: '#ECE6F6', l: '#B2A9D2', r: '#8D82B6' },
    idle: { t: '#D6CFE6', l: '#A8A0C0', r: '#878099' },
    mech: { t: '#FFAE93', l: '#E57A62', r: '#BF5A49' },
    mechDark: { t: '#C98A7E', l: '#A86A5E', r: '#87504A' },
    win: { t: '#7C72A6', l: '#6A609A', r: '#544B80' },
    ink: '#2A2640',
    lane: '#6E6596',
    goal: '#FF8E6E',
    spark: '#FFE2D2',
  },
  garden: {
    id: 'garden',
    name: 'Garden Terraces',
    bloom: 'flower',
    sky: 'linear-gradient(180deg,#BFE8F0 0%,#DDF3DA 55%,#F7F2CF 100%)',
    stone: { t: '#8FD66A', l: '#E5CFA0', r: '#C2A574' },
    deck: { t: '#FBF3E2', l: '#E5CFA0', r: '#C2A574' },
    idle: { t: '#EDE4CC', l: '#CDBE98', r: '#AD9D77' },
    mech: { t: '#FF95BE', l: '#EE6C98', r: '#C94D78' },
    mechLight: { t: '#FFD3E3', l: '#FFB5CE', r: '#E795B2' },
    leaf: { t: '#6FCB4E', l: '#4DA53C', r: '#378530' },
    turf: { t: '#9BDD74', l: '#6CB24E', r: '#4F913A' },
    ink: '#1F2E1A',
    lane: '#4E7A3A',
    goal: '#EE6C98',
    spark: '#FFE3EE',
  },
  town: {
    id: 'town',
    name: 'Painted Town',
    bloom: 'helm',
    sky: 'linear-gradient(180deg,#9FD6F2 0%,#D3EEF7 55%,#FFF2DC 100%)',
    stone: { t: '#FFFBF2', l: '#EEDFC4', r: '#D7BE97' },
    idle: { t: '#E4DCCB', l: '#C7BCA6', r: '#A99D86' },
    mech: { t: '#E9864F', l: '#C8643B', r: '#A24C2B' },
    accent: { t: '#4F86D6', l: '#3268B5', r: '#234F92' },
    roof: { t: '#E58A5A', l: '#C8643B', r: '#A14A2A' },
    blue: { t: '#5B8FDB', l: '#3A6DBA', r: '#2A5398' },
    ink: '#2B2A33',
    lane: '#B7A27E',
    goal: '#3268B5',
    spark: '#FFFFFF',
  },
  prism: {
    id: 'prism',
    name: 'Sunset Prism',
    bloom: 'crystal',
    sky: 'linear-gradient(180deg,#3A1670 0%,#8A2E9C 40%,#F0658A 72%,#FFC24A 100%)',
    ramp: [
      { t: '#BF94FA', l: '#8E5FE0', r: '#663BB5' },
      { t: '#FB93D6', l: '#DF57A4', r: '#AE387E' },
      { t: '#FFB872', l: '#F58442', r: '#CB5E25' },
    ],
    stone: { t: '#BF94FA', l: '#8E5FE0', r: '#663BB5' },
    idle: { t: '#CDB9E3', l: '#A48DC4', r: '#7F69A0' },
    mech: { t: '#FFF39B', l: '#FFD43B', r: '#E6A500' },
    ink: '#2A0F45',
    lane: '#5A2E86',
    goal: '#FFE25A',
    spark: '#FFF6C8',
  },
  night: {
    id: 'night',
    name: 'Lantern Night',
    bloom: 'lantern',
    sky: 'linear-gradient(180deg,#0D1130 0%,#1D1E4C 55%,#3A2A5E 100%)',
    stone: { t: '#474C84', l: '#30346A', r: '#232652' },
    deck: { t: '#8D94D6', l: '#4F5594', r: '#383D74' },
    idle: { t: '#7479B2', l: '#4C5186', r: '#383C69' },
    mech: { t: '#FFD27A', l: '#E9A94A', r: '#B98030' },
    glow: '#FFC861',
    ink: '#0B0D24',
    lane: '#7D84C8',
    goal: '#FFC861',
    spark: '#FFE69A',
  },
  brass: {
    id: 'brass',
    name: 'Clockwork Brass',
    bloom: 'clock',
    sky: 'linear-gradient(180deg,#1E140B 0%,#3E2914 50%,#7A5222 100%)',
    stone: { t: '#CFA45A', l: '#9C7034', r: '#734F22' },
    deck: { t: '#F1D594', l: '#BD914B', r: '#8E6630' },
    idle: { t: '#D9C493', l: '#A88E5F', r: '#7F6B45' },
    mech: { t: '#FFE28E', l: '#F7BE3E', r: '#CF9216' },
    mechLight: { t: '#FFF0BE', l: '#FFD86E', r: '#E4AE3A' },
    mechDark: { t: '#C99A4A', l: '#A37630', r: '#7C5820' },
    pipe: { t: '#D9925A', l: '#B4703C', r: '#8A5228' },
    ink: '#2A1A08',
    lane: '#6B4A1E',
    goal: '#FFE28E',
    spark: '#FFF0BE',
  },
  cube: {
    id: 'cube',
    name: 'The Cube',
    bloom: 'helm',
    sky: 'linear-gradient(180deg,#F3C9C4 0%,#F9DFD3 48%,#FFF3E6 100%)',
    stone: { t: '#FFF3EC', l: '#F8D8CB', r: '#E8B3A6' },
    path: { t: '#FFFAF2', l: '#FBEBD8', r: '#ECCDB0' },
    deck: { t: '#FFFAF2', l: '#FBEBD8', r: '#ECCDB0' },
    idle: { t: '#FBE9E1', l: '#EFC6BA', r: '#D9A396' },
    roof: { t: '#F1CFC2', l: '#F6DED3', r: '#E3B9AC' },
    mech: { t: '#7FD3C4', l: '#3FA79A', r: '#2A7E78' },
    mechDark: { t: '#3E9C92', l: '#2A7E78', r: '#1D5D5A' },
    accent: { t: '#4F86D6', l: '#3268B5', r: '#234F92' },
    ink: '#A86A66',
    lane: '#D9B79C',
    goal: '#2A7E78',
    spark: '#FFFFFF',
    trim: '#FFFFFF',
    hazeK: 0.35,
  },
};

export function sp(th: ThemeDef, k: number): TriPalette {
  if (th.ramp) return th.ramp[((k % th.ramp.length) + th.ramp.length) % th.ramp.length];
  if (k % 3 === 1 && th.deck) return th.deck;
  return th.stone;
}

export function resolvePalette(th: ThemeDef, pal?: string): TriPalette {
  if (!pal || pal === 'stone') return th.stone;
  if (pal === 'deck') return th.deck ?? th.path ?? th.stone;
  if (pal === 'idle') return th.idle;
  if (pal === 'mech') return th.mech;
  if (pal === 'mechDark') return th.mechDark ?? th.idle;
  if (pal === 'accent') return th.accent ?? th.mech;
  if (pal === 'turf') return th.turf ?? th.leaf ?? th.stone;
  if (pal === 'roof') return th.roof ?? th.mech;
  if (pal.startsWith('#')) return tone(pal);
  return th.stone;
}

/* ---------- Sky helpers & shared Haze uniforms ---------- */

const skyStops = (css: string): Array<{ c: string; f: number }> =>
  [...css.matchAll(/#([0-9a-fA-F]{6})\s+(\d+(?:\.\d+)?)%/g)].map((m) => ({
    c: `#${m[1]}`,
    f: Number(m[2]) / 100,
  }));

export function skyAt(css: string, f: number): string {
  const S = skyStops(css);
  if (!S.length) return '#DDE6F0';
  for (let i = 1; i < S.length; i++) {
    if (f <= S[i].f) {
      const a = S[i - 1], b = S[i];
      return mixHex(a.c, b.c, clamp01((f - a.f) / Math.max(1e-3, b.f - a.f)));
    }
  }
  return S[S.length - 1].c;
}

export function skyCss(th: ThemeDef): string {
  const dark = lum(skyAt(th.sky, 0.5)) < 0.35;
  const glow = dark ? (th.glow ?? th.goal ?? '#FFD27A') : '#FFFFFF';
  const [r, g, b] = hexRgb(glow);
  const ink = hexRgb(th.ink || '#1E2235');
  return (
    `radial-gradient(ellipse 58% 46% at 50% 46%, rgba(${r},${g},${b},${dark ? 0.2 : 0.42}) 0%, rgba(${r},${g},${b},0) 100%),` +
    ` radial-gradient(ellipse 120% 100% at 50% 45%, rgba(0,0,0,0) 62%, rgba(${ink.join(',')},${dark ? 0.3 : 0.1}) 100%), ${th.sky}`
  );
}

export interface HazeUniforms {
  hz: { value: THREE.Color };
  hzLo: { value: number };
  hzHi: { value: number };
  hzK: { value: number };
}

export function createHazeUniforms(): HazeUniforms {
  return {
    hz: { value: new THREE.Color(1, 1, 1) },
    hzLo: { value: -10 },
    hzHi: { value: -9 },
    hzK: { value: 0 },
  };
}

export function updateHazeForScene(
  haze: HazeUniforms,
  root: THREE.Object3D,
  minRoadY: number,
  th: ThemeDef,
): void {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.visible) {
      const mesh = o as THREE.Mesh;
      if (!mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) {
        box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      }
    }
  });
  if (!Number.isFinite(minRoadY) || box.isEmpty()) {
    haze.hzK.value = 0;
    return;
  }
  const hi = minRoadY - 0.7;
  const lo = Math.min(box.min.y, hi - 1.5);
  const c = hexRgb(skyAt(th.sky, 0.82));
  haze.hz.value.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.LinearSRGBColorSpace);
  haze.hzLo.value = lo;
  haze.hzHi.value = hi;
  haze.hzK.value = th.hazeK ?? 0.5;
}

/* ---------- Three-Tone Normal Shader ---------- */

const TRI_VS = `
varying vec3 vW;
void main() {
  #ifdef USE_INSTANCING
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 w = modelMatrix * vec4(position, 1.0);
  #endif
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const TRI_FS = `
uniform vec3 hz;
uniform float hzLo;
uniform float hzHi;
uniform float hzK;
uniform vec3 ct;
uniform vec3 cl;
uniform vec3 cr;
uniform float grad;
uniform float opacity;
varying vec3 vW;

vec3 applyHaze(vec3 c, float y) {
  float f = clamp((hzHi - y) / max(hzHi - hzLo, 1e-3), 0.0, 1.0);
  return mix(c, hz, hzK * f * f * (3.0 - 2.0 * f));
}

void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 cz = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec2 h = normalize(cz.xz + vec2(1e-5));
  vec2 h0 = vec2(0.70710678);
  float np = dot(n.xz, h);
  float nq = h.x * n.z - h.y * n.x;
  n = vec3(np * h0.x - nq * h0.y, n.y, np * h0.y + nq * h0.x);
  if (dot(n, vec3(1.0)) < 0.0) n = -n;
  vec3 w = pow(max(n, vec3(0.0)), vec3(1.6));
  float s = w.x + w.y + w.z + 1e-4;
  vec3 c = (cr * w.x + ct * w.y + cl * w.z) / s;
  c *= 1.0 + grad * clamp(vW.y * 0.09, -1.0, 1.0);
  gl_FragColor = vec4(applyHaze(c, vW.y), opacity);
}`;

export interface TriMatOpts {
  grad?: number;
  side?: boolean;
  opacity?: number;
  fresh?: boolean;
  /** Subtle polygonOffsetFactor/Units (positive pushes slightly back in depth to prevent road/wall z-fighting). */
  polyOff?: number;
}

export function setTri(mat: THREE.ShaderMaterial, p: TriPalette): void {
  (mat.uniforms.ct.value as THREE.Color).set(p.t);
  (mat.uniforms.cl.value as THREE.Color).set(p.l);
  (mat.uniforms.cr.value as THREE.Color).set(p.r);
}

/** Tracks geometries, materials, textures, and render targets for leak-free per-level disposal. */
export class LevelDisposer {
  private readonly geos = new Set<THREE.BufferGeometry>();
  private readonly mats = new Set<THREE.Material>();
  private readonly texs = new Set<THREE.Texture>();
  private readonly rts = new Set<THREE.WebGLRenderTarget>();
  private readonly triCache = new Map<string, THREE.ShaderMaterial>();
  readonly unitBox: THREE.BoxGeometry;

  constructor(private readonly haze: HazeUniforms) {
    this.unitBox = this.geo(new THREE.BoxGeometry(1, 1, 1));
  }

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.add(g);
    return g;
  }

  mat<T extends THREE.Material>(m: T): T {
    this.mats.add(m);
    return m;
  }

  tex<T extends THREE.Texture>(t: T): T {
    this.texs.add(t);
    return t;
  }

  rt<T extends THREE.WebGLRenderTarget>(r: T): T {
    this.rts.add(r);
    return r;
  }

  tri(p: TriPalette, opt: TriMatOpts = {}): THREE.ShaderMaterial {
    const grad = opt.grad ?? 0.07;
    const opacity = opt.opacity ?? 1;
    const side = opt.side ? 1 : 0;
    const po = opt.polyOff ?? 0;
    const key = opt.fresh ? null : `${p.t}|${p.l}|${p.r}|${grad}|${side}|${opacity}|${po}`;
    if (key) {
      const hit = this.triCache.get(key);
      if (hit) return hit;
    }
    const m = new THREE.ShaderMaterial({
      uniforms: {
        hz: this.haze.hz,
        hzLo: this.haze.hzLo,
        hzHi: this.haze.hzHi,
        hzK: this.haze.hzK,
        ct: { value: new THREE.Color(p.t) },
        cl: { value: new THREE.Color(p.l) },
        cr: { value: new THREE.Color(p.r) },
        grad: { value: grad },
        opacity: { value: opacity },
      },
      vertexShader: TRI_VS,
      fragmentShader: TRI_FS,
      side: opt.side ? THREE.DoubleSide : THREE.FrontSide,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      polygonOffset: po !== 0,
      polygonOffsetFactor: po,
      polygonOffsetUnits: po,
    });
    this.mats.add(m);
    if (key) this.triCache.set(key, m);
    return m;
  }

  basic(
    color: string | number,
    opt: { opacity?: number; add?: boolean; side?: boolean; map?: THREE.Texture | null; depthTest?: boolean } = {},
  ): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: opt.opacity !== undefined || !!opt.add,
      opacity: opt.opacity ?? 1,
      side: opt.side ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !opt.add && opt.opacity === undefined,
      depthTest: opt.depthTest ?? true,
      blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      map: opt.map ?? null,
    });
    return this.mat(m);
  }

  sprite(
    tex: THREE.Texture,
    w: number,
    h: number,
    color = '#ffffff',
    opt: { opacity?: number; add?: boolean; depthTest?: boolean; order?: number } = {},
  ): THREE.Sprite {
    const m = this.mat(
      new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: opt.opacity ?? 1,
        depthWrite: false,
        depthTest: opt.depthTest ?? true,
        blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    const s = new THREE.Sprite(m);
    s.scale.set(w, h, 1);
    if (opt.order) s.renderOrder = opt.order;
    return s;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    for (const r of this.rts) r.dispose();
    this.geos.clear();
    this.mats.clear();
    this.texs.clear();
    this.rts.clear();
    this.triCache.clear();
  }
}

/* ---------- Shared procedural canvas textures (disposed on renderer unmount) ---------- */

export interface SharedTextures {
  glow: THREE.CanvasTexture;
  dot: THREE.CanvasTexture;
  puff: THREE.CanvasTexture;
  cloud: THREE.CanvasTexture;
  petal: THREE.CanvasTexture;
  diamond: THREE.CanvasTexture;
  ring: THREE.CanvasTexture;
  shaft: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  return new THREE.CanvasTexture(c);
}

const TAU = Math.PI * 2;

export function createSharedTextures(): SharedTextures {
  const glow = makeCanvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  const dot = makeCanvasTex(32, 32, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(16, 16, 14, 0, TAU);
    g.fill();
  });
  const puff = makeCanvasTex(64, 64, (g) => {
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[32, 36, 20], [20, 38, 13], [44, 38, 13], [32, 24, 14]] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
  const cloud = makeCanvasTex(256, 96, (g) => {
    const v = g.createLinearGradient(0, 8, 0, 96);
    v.addColorStop(0, '#FFFFFF');
    v.addColorStop(0.6, '#FBFCFE');
    v.addColorStop(1, '#E4E9F2');
    g.fillStyle = v;
    for (const [x, y, r] of [[60, 64, 30], [100, 50, 42], [150, 56, 36], [190, 66, 26], [128, 72, 30]] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.fillRect(40, 70, 170, 26);
    g.clearRect(0, 92, 256, 4);
  });
  const petal = makeCanvasTex(32, 32, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(16, 16, 13, 7, 0.5, 0, TAU);
    g.fill();
  });
  const diamond = makeCanvasTex(32, 32, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(16, 1);
    g.lineTo(24, 16);
    g.lineTo(16, 31);
    g.lineTo(8, 16);
    g.fill();
  });
  const ring = makeCanvasTex(64, 64, (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(32, 32, 26, 0, TAU);
    g.stroke();
  });
  const shaft = makeCanvasTex(4, 128, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.55, 'rgba(255,255,255,.55)');
    v.addColorStop(1, 'rgba(255,255,255,.95)');
    g.fillStyle = v;
    g.fillRect(0, 0, 4, 128);
  });

  const all = [glow, dot, puff, cloud, petal, diamond, ring, shaft];
  return {
    glow,
    dot,
    puff,
    cloud,
    petal,
    diamond,
    ring,
    shaft,
    dispose: () => {
      for (const t of all) t.dispose();
    },
  };
}
