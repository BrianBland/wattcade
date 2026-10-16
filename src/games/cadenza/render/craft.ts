import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHIP_IDS, type ShipId } from '../sim/ships';

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Alpha ramp for the exhaust flames: opaque at the nozzle (v = 0), clear at the tip. */
function flameTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#888'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

/** Faceted loft: closed polygon `shape(w, h)` swept through sections [z, w, h, x?, y?] (−z = forward), capped. */
export function loft(sections: Array<[number, number, number, number?, number?]>, shape: (w: number, h: number) => Array<[number, number]>): THREE.BufferGeometry {
  const rings = sections.map(([z, w, h, x = 0, y = 0]) => shape(w, h).map(([px, py]) => new THREE.Vector3(px + x, py + y, z)));
  const pos: number[] = [], k = rings[0].length;
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < k; i++) {
    const a = rings[r][i], b = rings[r][(i + 1) % k], c = rings[r + 1][i], d = rings[r + 1][(i + 1) % k];
    tri(a, c, b); tri(b, c, d);
  }
  for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]] as const) {
    const ctr = ring.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(k);
    for (let i = 0; i < k; i++) flip ? tri(ctr, ring[(i + 1) % k], ring[i]) : tri(ctr, ring[i], ring[(i + 1) % k]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
/** Flat plate from a planform [x, z] polygon, `thick` metres. */
function plate(pts: Array<[number, number]>, thick: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))), { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); g.translate(0, thick / 2, 0);
  return g.toNonIndexed();
}
/** Position + normals only, so mixed sources merge. Normals are smoothed across folds gentler than `crease` rad. */
function bare(g: THREE.BufferGeometry, crease = 0): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g, out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  if (crease > 0) return toCreasedNormals(out, crease);
  out.computeVertexNormals();
  return out;
}
/** Bake a fixed key light (above, slightly behind) into vertex colours: unlit materials still read as rounded forms. */
function shade(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('normal'), c = new Float32Array(n.count * 3), L = new THREE.Vector3(-0.3, 0.9, 0.55).normalize(), v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    const k = 0.35 + 0.95 * Math.max(0, v.dot(L)) + 0.3 * Math.pow(1 - Math.abs(v.y), 3); // key + a little side sheen
    c.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const wedge = (w: number, h: number): Array<[number, number]> => [[0, h], [w * 0.55, h * 0.75], [w, 0], [w * 0.6, -h * 0.5], [-w * 0.6, -h * 0.5], [-w, 0], [-w * 0.55, h * 0.75]];
const pod = (w: number, h: number): Array<[number, number]> => [[0, h], [w * 0.8, h * 0.55], [w, -h * 0.2], [w * 0.5, -h], [-w * 0.5, -h], [-w, -h * 0.2], [-w * 0.8, h * 0.55]];
const round = (w: number, h: number): Array<[number, number]> => Array.from({ length: 18 }, (_, i) => [Math.cos((i / 18) * Math.PI * 2) * w, Math.sin((i / 18) * Math.PI * 2) * h]);
type Sec = [number, number, number, number?, number?];
const at = (secs: Sec[], x: number, y: number): Sec[] => secs.map(([z, w, h]) => [z, w, h, x, y]);

/** One hull per ship in the sim's table (sim/ships.ts: names, playstyles, unlocks). */
export const CRAFT_KINDS = SHIP_IDS;
export type CraftKind = ShipId;
/** One engine as the ship's effects see it: nozzle centre, lip radius and lip z. */
export type Engine = [x: number, y: number, r: number, z: number];
interface Parts { hull: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[]; cores: THREE.BufferGeometry[]; throats: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[]; engines: Engine[] }

/**
 * A bell nozzle (the face the chase camera sees): an open lathe flaring from a narrow throat at z0 to a lip of radius
 * r at z0 + len, with a glowing inner wall, a white-hot core at the throat, a neon rim on the lip and a trim band.
 */
function bell(p: Parts, x: number, y: number, r: number, z0: number, len: number) {
  const N = 10, prof = (k: number) => Array.from({ length: N }, (_, i) => { const u = i / (N - 1); return new THREE.Vector2(r * (0.38 + 0.62 * Math.sqrt(u)) * k, u * len); });
  const lathe = (k: number) => { const g = new THREE.LatheGeometry(prof(k), 12); g.rotateX(Math.PI / 2); g.translate(x, y, z0); return g; };
  p.hull.push(lathe(1)); p.throats.push(lathe(0.94));
  const rim = new THREE.TorusGeometry(r, r * 0.08, 6, 24); rim.translate(x, y, z0 + len); p.glow.push(rim);
  const core = new THREE.CircleGeometry(r * 0.36, 18); core.translate(x, y, z0 + 0.01); p.cores.push(core);
  const band = new THREE.TorusGeometry(r * (0.38 + 0.62 * Math.sqrt(0.45)) + 0.004, r * 0.05, 5, 24); band.translate(x, y, z0 + 0.45 * len); p.trim.push(band);
  p.engines.push([x, y, r, z0 + len]);
}
/** A thin hoop of trim around a section of half-width w, half-height h at (x, y, z). */
function hoop(p: Parts, x: number, y: number, z: number, w: number, h: number) {
  const t = new THREE.TorusGeometry(1, 0.06, 5, 28); t.scale(w * 1.04, h * 1.04, w * 0.6); t.translate(x, y, z); p.trim.push(t);
}

/** Lancer, a long rocket: flat wedge body, twin pods sweeping in to the nose, a bell nozzle at the end of each pod. */
function lancer(p: Parts) {
  const bodyS: Sec[] = [[-3.0, 0.02, 0.02], [-2.2, 0.17, 0.08], [-1.0, 0.34, 0.17], [0.3, 0.4, 0.23], [1.3, 0.32, 0.18], [1.75, 0.2, 0.1]];
  p.hull.push(loft(bodyS, wedge));
  const bar = new THREE.BoxGeometry(0.62, 0.025, 0.03); bar.translate(0, -0.03, 1.77); p.glow.push(bar); // tail light bar between the engines
  const ex = 0.6;
  for (const side of [-1, 1]) {
    p.hull.push(loft([[-2.5, 0.015, 0.015, 0.26], [-1.9, 0.09, 0.07, 0.38], [-0.6, 0.16, 0.13, 0.55], [0.8, 0.2, 0.16], [1.3, 0.19, 0.155], [1.5, 0.15, 0.13]]
      .map(([z, w, h, x = ex]) => [z, w, h, side * x, -0.05] as Sec), pod));
    const web = plate([[0.15, -1.6], [0.3, -1.9], [0.5, -0.8], [0.5, 1.0], [0.2, 1.2]], 0.04); web.translate(0, -0.04, 0); // blends body into pod
    if (side < 0) web.scale(-1, 1, 1);
    p.hull.push(web);
    hoop(p, side * ex, -0.05, -0.6, 0.16, 0.13); hoop(p, side * ex, -0.05, 0.8, 0.2, 0.16);
    const strip = new THREE.BoxGeometry(0.06, 0.03, 2.2); strip.translate(side * ex, -0.2, 0.3); p.glow.push(strip); // hover strips
    bell(p, side * ex, -0.05, 0.19, 1.45, 0.42);
  }
  const canopy = loft([[-1.9, 0.02, 0.01, 0, 0.08], [-1.3, 0.11, 0.06, 0, 0.12], [-0.4, 0.15, 0.09, 0, 0.17], [0.3, 0.1, 0.05, 0, 0.2]], (w, h) => [[0, h], [w * 0.8, h * 0.4], [w, -0.05], [-w, -0.05], [-w * 0.8, h * 0.4]]);
  const crease: number[] = []; // character lines along the body's side crease
  for (const side of [-1, 1]) for (let i = 0; i + 1 < bodyS.length; i++) crease.push(side * bodyS[i][1] * 1.01, 0, bodyS[i][0], side * bodyS[i + 1][1] * 1.01, 0, bodyS[i + 1][0]);
  return { canopy, crease, tipX: 0.8 };
}

/** Triad, compact and rounded: three bundled nacelles in a triangle (one high, two low), big ribbed nozzles filling the back. */
function triad(p: Parts) {
  const cy = 0.16, sx = 0.42, sy = -0.04;
  p.hull.push(loft(at([[-1.75, 0.02, 0.02], [-1.6, 0.1, 0.09], [-1.35, 0.17, 0.15], [-0.9, 0.22, 0.2], [0.6, 0.24, 0.22], [1.1, 0.23, 0.21]], 0, cy), round));
  for (const side of [-1, 1]) {
    const x = side * sx;
    p.hull.push(loft(at([[-1.1, 0.02, 0.02], [-0.95, 0.09, 0.09], [-0.7, 0.15, 0.15], [-0.3, 0.19, 0.19], [0.8, 0.2, 0.2], [1.15, 0.19, 0.19]], x, sy), round));
    for (const z of [0.55, 0.72, 0.89]) hoop(p, x, sy, z, 0.2, 0.2); // ribbed rings
    const strip = new THREE.BoxGeometry(0.025, 0.03, 1.0); strip.translate(side * (sx + 0.2), sy, 0.2); p.trim.push(strip); // side light strip
    const hover = new THREE.BoxGeometry(0.06, 0.03, 1.4); hover.translate(x, sy - 0.22, 0.1); p.glow.push(hover);
    const fin = plate([[0.5, 0.45], [0.86, 0.9], [0.86, 1.0], [0.5, 1.12]], 0.03); fin.translate(0, sy, 0); // short swept spike
    if (side < 0) fin.scale(-1, 1, 1);
    p.hull.push(fin);
    bell(p, x, sy, 0.17, 1.13, 0.3);
  }
  for (const z of [0.5, 0.68, 0.86]) hoop(p, 0, cy, z, 0.24, 0.22);
  p.hull.push(loft(at([[-1.0, 0.2, 0.1], [-0.5, 0.46, 0.15], [0.7, 0.5, 0.16], [1.05, 0.44, 0.14]], 0, 0.03), round)); // fairing binding the three
  const spine = new THREE.BoxGeometry(0.03, 0.02, 1.3); spine.translate(0, cy + 0.225, -0.2); p.trim.push(spine);
  bell(p, 0, cy, 0.2, 1.08, 0.34);
  const canopy = loft([[-1.32, 0.03, 0.01, 0, 0.27], [-1.05, 0.12, 0.06, 0, 0.32], [-0.6, 0.13, 0.07, 0, 0.35], [-0.3, 0.06, 0.03, 0, 0.36]], (w, h) => [[0, h], [w * 0.8, h * 0.4], [w, -0.05], [-w, -0.05], [-w * 0.8, h * 0.4]]);
  return { canopy, crease: [] as number[], tipX: 0.86 };
}

/** Lens cross-section for a lifting body: domed top, flatter belly, sharp side edges at (±w, 0). */
const lens = (w: number, h: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI; out.push([Math.cos(t) * w, Math.sin(t) * h]); }
  for (let i = 7; i >= 1; i--) { const t = (i / 8) * Math.PI; out.push([-Math.cos(t) * w, -Math.sin(t) * h * 0.45]); }
  return out;
};

/** Manta, a smooth flying wing: a lens-section lifting body, a dorsal cockpit hump, four small engines along the trailing edge. */
function manta(p: Parts) {
  const wingS: Sec[] = [[-2.0, 0.03, 0.02], [-1.6, 0.2, 0.08], [-1.0, 0.45, 0.13], [-0.3, 0.7, 0.15], [0.4, 0.85, 0.14], [0.9, 0.8, 0.12], [1.15, 0.7, 0.1]];
  p.hull.push(loft(wingS, lens));
  p.hull.push(loft(at([[-1.3, 0.03, 0.02], [-0.9, 0.15, 0.12], [-0.2, 0.21, 0.17], [0.6, 0.2, 0.15], [1.05, 0.16, 0.1]], 0, 0.06), round));
  const spine = new THREE.BoxGeometry(0.025, 0.02, 1.1); spine.translate(0, 0.235, 0.15); p.trim.push(spine);
  for (const x of [-0.46, -0.16, 0.16, 0.46]) {
    p.hull.push(loft(at([[0.2, 0.03, 0.03], [0.45, 0.09, 0.08], [1.0, 0.1, 0.09], [1.12, 0.09, 0.085]], x, -0.01), round)); // nacelle fairing
    hoop(p, x, -0.01, 0.9, 0.1, 0.09);
    bell(p, x, -0.01, 0.11, 1.08, 0.22);
  }
  for (const side of [-1, 1]) { const hover = new THREE.BoxGeometry(0.06, 0.03, 1.6); hover.translate(side * 0.5, -0.1, -0.1); p.glow.push(hover); }
  const canopy = loft([[-1.0, 0.03, 0.01, 0, 0.15], [-0.7, 0.11, 0.05, 0, 0.19], [-0.3, 0.12, 0.06, 0, 0.22], [0, 0.05, 0.02, 0, 0.23]], (w, h) => [[0, h], [w * 0.8, h * 0.4], [w, -0.05], [-w, -0.05], [-w * 0.8, h * 0.4]]);
  const crease: number[] = []; // trim along the wing's leading edge, nose to tip to tail
  for (const side of [-1, 1]) for (let i = 0; i + 1 < wingS.length; i++) crease.push(side * wingS[i][1] * 1.01, 0, wingS[i][0], side * wingS[i + 1][1] * 1.01, 0, wingS[i + 1][0]);
  return { canopy, crease, tipX: 0.85 };
}

const HULLS: Record<CraftKind, (p: Parts) => { canopy: THREE.BufferGeometry; crease: number[]; tipX: number }> = { triad, lancer, manta };

/** The craft's parts (local: −z forward, +y up). Pure geometry, no materials. Kept well inside one lane (LW 3.2 m). */
export function craftGeometry(kind: CraftKind = 'triad') {
  const p: Parts = { hull: [], glow: [], cores: [], throats: [], trim: [], engines: [] };
  const { canopy, crease, tipX } = HULLS[kind](p);
  const lines = new THREE.BufferGeometry(); lines.setAttribute('position', new THREE.Float32BufferAttribute(crease, 3));
  const hull = shade(mergeGeometries(p.hull.map((g) => bare(g, 0.6)))!);
  const tailZ = Math.max(...p.engines.map((e) => e[3]));
  return { hull, canopy, nozzles: mergeGeometries(p.glow.map((g) => bare(g)))!, cores: mergeGeometries(p.cores.map((g) => bare(g)))!, throats: mergeGeometries(p.throats)!, trim: mergeGeometries(p.trim.map((g) => bare(g)))!, lines, engines: p.engines, tipX, tailZ };
}

export const SCALE = 1.15;
const TRAIL = 48, ARCS = 10, ARC_PTS = 6, BEAM = 2.4; // BEAM: exhaust length (m) at cruise
const HOT = new THREE.Color('#ff3b12'), WHITE_HOT = new THREE.Color('#ffd2b0'), HURT = new THREE.Color('#ff1020'), OD = new THREE.Color('#ff2bd6');

/** `tier` = chain flourish level: 0 none, 1 (25+) gold trail, 2 (50+) rainbow trail, 3 (100+) wide rainbow trail + sparkle. */
export interface CraftState { overdrive: boolean; ghost: boolean; bank: number; beat: number; over: number; under: number; tier?: number }
const GOLD = new THREE.Color('#ffd23d');

/**
 * The anti-grav racer, in one of three hulls (`triad`: three bundled rounded nacelles; `lancer`: a long wedge with an
 * engine at the end of each pod; `manta`: a flying wing with four small engines), all narrower than a lane: bell nozzles with neon rims, glowing throats and white-hot
 * cores, long exhaust beams, a tinted visor, beat-pulsing trim, neon edges, a pool of light on the track, tip ribbons.
 * Reacts to the game: absorbing a block flashes it in that colour and kicks the engines; a mine knocks it back and
 * pops a shield bubble; dropout ghosts it; Overdrive turns it pink and hot. Over the power ceiling it overcharges
 * (red-hot hull, white-hot edges, crackling arcs); under the floor the engines sputter and it sags on its hover field.
 */
export class Craft {
  readonly group = new THREE.Group();     // positioned on the track by the renderer
  private ship = new THREE.Group();       // local offsets (knockback, bob)
  private body: THREE.MeshBasicMaterial; private edge: THREE.LineBasicMaterial; private glass: THREE.MeshBasicMaterial; private nozzle: THREE.MeshBasicMaterial; private core: THREE.MeshBasicMaterial; private throat: THREE.MeshBasicMaterial; private trim: THREE.MeshBasicMaterial; private trimLine: THREE.LineBasicMaterial;
  private plumes: THREE.Sprite[] = []; private flames: THREE.Mesh[] = []; private flameMat: THREE.MeshBasicMaterial; private under: THREE.Sprite; private bubble: THREE.Mesh;
  private arcs: THREE.LineSegments; private arcPos = new Float32Array(ARCS * (ARC_PTS - 1) * 2 * 3); private arcAnchors: THREE.Vector3[] = []; private arcT = 0;
  private shock: THREE.Mesh; private shockT = 9; private shockK = 0;
  private trail: THREE.Mesh; private trailPos = new Float32Array(TRAIL * 4 * 3); private trailCol = new Float32Array(TRAIL * 4 * 4); private trailInit = false;
  private base: THREE.Color; private flashC = new THREE.Color(); private flash = 0; private kick = 0; private hurt = 0; private knock = 0; private sputter = 1;
  private trailW = 0.09; private tipHalf: number;
  private tmp = new THREE.Vector3(); private col = new THREE.Color(); private hot = new THREE.Color();
  constructor(color: string, kind: CraftKind = 'triad') {
    this.base = new THREE.Color(color);
    const g = craftGeometry(kind);
    this.body = new THREE.MeshBasicMaterial({ color: this.base.clone().multiplyScalar(0.3), vertexColors: true, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    this.edge = new THREE.LineBasicMaterial({ color, transparent: true, toneMapped: false });
    this.glass = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
    this.nozzle = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false });
    this.core = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false });
    this.trim = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false });
    this.trimLine = new THREE.LineBasicMaterial({ color, transparent: true, toneMapped: false });
    this.throat = new THREE.MeshBasicMaterial({ color, alphaMap: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const tex = glowTexture();
    const glow = (opacity = 1) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, toneMapped: false }));
    for (const [x, y, r, z] of g.engines) { const p = glow(); p.position.set(x, y, z + 0.4); p.userData.r = r / 0.17; this.plumes.push(p); }
    // exhaust beams: long tapered additive cones streaming back from each bell, stretching with effort
    this.flameMat = new THREE.MeshBasicMaterial({ color, alphaMap: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const fg = new THREE.ConeGeometry(1, 1, 16, 1, true); fg.translate(0, 0.5, 0); fg.rotateX(Math.PI / 2); // base at origin, tip toward +z
    for (const [x, y, r, z] of g.engines) { const f = new THREE.Mesh(fg, this.flameMat); f.position.set(x, y, z - 0.02); f.userData.r = r * 0.8; this.flames.push(f); }
    this.under = glow(0.5); this.under.position.set(0, -0.7, 0.2); this.under.scale.set(2.6, 1.6, 1);
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshBasicMaterial({ color: '#ff2030', wireframe: true, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    // overcharge arcs: jagged lines between points on the hull, re-struck many times a second
    const hp = g.hull.getAttribute('position');
    for (let i = 0; i < hp.count; i += 7) this.arcAnchors.push(new THREE.Vector3().fromBufferAttribute(hp, i));
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcs = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: '#ffb48a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcs.frustumCulled = false;
    // shockwave ring (chain milestones, launches): flat on the hover plane, expanding and fading
    const sg = new THREE.RingGeometry(0.85, 1, 48); sg.rotateX(-Math.PI / 2);
    this.shock = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.shock.position.y = -0.4;
    this.ship.add(new THREE.Mesh(g.hull, this.body), new THREE.LineSegments(new THREE.EdgesGeometry(g.hull, 25), this.edge),
      new THREE.Mesh(g.canopy, this.glass), new THREE.LineSegments(new THREE.EdgesGeometry(g.canopy, 20), this.trimLine), new THREE.LineSegments(g.lines, this.trimLine), new THREE.Mesh(g.trim, this.trim), new THREE.Mesh(g.nozzles, this.nozzle), new THREE.Mesh(g.cores, this.core), new THREE.Mesh(g.throats, this.throat), ...this.plumes, ...this.flames, this.under, this.bubble, this.arcs, this.shock);
    this.ship.scale.setScalar(SCALE);
    this.tipHalf = g.tipX * SCALE;
    this.group.add(this.ship);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    // two thin ribbons streaming from the pod tips: per row 4 verts (left in/out, right in/out)
    const idx: number[] = []; for (let i = 0; i < TRAIL - 1; i++) for (const o of [0, 2]) { const a = i * 4 + o, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
  }
  get trailMesh() { return this.trail; }
  /** Restart the ribbons from wherever the craft is next (after it was shown somewhere else, e.g. the menu showcase). */
  resetTrail() { this.trailInit = false; }

  absorb(c: THREE.Color) { this.flashC.copy(c); this.flash = 1; this.kick = Math.min(1.6, this.kick + 0.5); }
  greyHit() { this.hurt = 1; this.knock = 1; }
  /** A shockwave ring; k 0..1 sets its size and brightness. */
  ring(k: number) { if (k <= 0) return; this.shockT = 0; this.shockK = k; }

  /** Per frame: state, world frame (right/up/forward) and world position for the trail. */
  update(dt: number, t: number, s: CraftState, right: THREE.Vector3, up: THREE.Vector3) {
    this.flash = Math.max(0, this.flash - dt * 5); this.kick = Math.max(0, this.kick - dt * 3);
    this.hurt = Math.max(0, this.hurt - dt * 2.2); this.knock = Math.max(0, this.knock - dt * 3.5);
    const over = s.over, under = s.under;
    const accent = s.overdrive ? this.col.copy(OD) : this.col.copy(this.base);
    if (over > 0) accent.lerp(HOT, Math.min(1, over * 1.4));
    if (this.flash > 0) accent.lerp(this.flashC, this.flash * 0.8);
    if (this.hurt > 0) accent.lerp(HURT, this.hurt);
    // the hull glows red-hot when overcharged; edges go white-hot and flicker
    const throb = 0.5 + 0.5 * Math.sin(t * 14);
    this.edge.color.copy(accent).lerp(WHITE_HOT, over * 0.25 * throb).multiplyScalar(0.85 + this.flash * 0.8 + over * (0.3 + 0.4 * Math.random()));
    this.body.color.copy(accent).multiplyScalar(0.16 + 0.35 * this.flash + 0.6 * this.hurt + over * (0.22 + 0.18 * throb));
    this.glass.color.copy(this.hot.copy(accent).lerp(WHITE_HOT, 0.15)).multiplyScalar(0.22 + 0.12 * s.beat); // dark tinted visor
    this.nozzle.color.copy(accent).lerp(WHITE_HOT, 0.3 + 0.2 * over).multiplyScalar(1.2 + 0.8 * this.kick);
    const ghost = s.ghost ? 0.25 + 0.15 * Math.sin(t * 20) : 1;
    this.body.opacity = ghost; this.edge.opacity = s.ghost ? 0.45 : 1; this.glass.opacity = s.ghost ? 0.2 : 0.85;
    // engines: plumes kick on pickups and beats, roar when overcharged, cough and cut out when underpowered
    if (under > 0.05) { if (Math.random() < dt * (3 + 10 * under)) this.sputter = Math.random() < under ? 0.05 : 0.5; this.sputter += (1 - this.sputter) * Math.min(1, dt * 6); } else this.sputter = 1;
    // engine cores: white-hot, flaring on pickups and beats, going dark as the engines cough
    this.core.color.copy(WHITE_HOT).lerp(accent, 0.25).multiplyScalar((1.0 + 1.0 * this.kick + 0.3 * s.beat + 0.5 * over) * this.sputter);
    this.core.opacity = this.nozzle.opacity = s.ghost ? 0.35 : 1;
    // trim: the accent at reduced strength, breathing with the beat
    this.trim.color.copy(accent).multiplyScalar(0.6 + 0.4 * s.beat + 0.6 * this.flash);
    this.trimLine.color.copy(this.trim.color).lerp(WHITE_HOT, 0.3);
    this.trim.opacity = this.trimLine.opacity = s.ghost ? 0.3 : 1;
    this.throat.color.copy(accent).lerp(WHITE_HOT, 0.45 + 0.2 * over).multiplyScalar((0.18 + 0.35 * this.kick + 0.1 * s.beat) * this.sputter * (s.ghost ? 0.35 : 1));
    const plume = (s.overdrive ? 0.55 : 0.3) * (1 + 0.45 * this.kick + 0.2 * s.beat + 0.25 * over) * (0.9 + 0.2 * Math.random()) * this.sputter;
    for (const p of this.plumes) { (p.material as THREE.SpriteMaterial).color.copy(accent).lerp(WHITE_HOT, over * 0.15); p.scale.setScalar(plume * p.userData.r); }
    const flame = (s.overdrive ? 1.6 : 0.9) * (1 + 0.8 * this.kick + 0.25 * s.beat + 0.6 * over) * (0.85 + 0.3 * Math.random()) * this.sputter;
    this.flameMat.color.copy(accent).lerp(WHITE_HOT, 0.2 + 0.2 * over).multiplyScalar((s.ghost ? 0.3 : 0.55) * this.sputter);
    for (const f of this.flames) f.scale.set(f.userData.r, f.userData.r, flame * BEAM);
    const um = this.under.material as THREE.SpriteMaterial;
    um.color.copy(accent); um.opacity = (0.22 + 0.3 * this.kick + 0.15 * s.beat) * (1 - 0.5 * over) * (0.4 + 0.6 * this.sputter);
    const bm = this.bubble.material as THREE.MeshBasicMaterial; bm.opacity = this.hurt * 0.9; this.bubble.scale.setScalar(1 + (1 - this.hurt) * 0.5); this.bubble.rotation.y = t * 3;
    this.strikeArcs(dt, over);
    this.shockT += dt;
    const sa = Math.min(1, this.shockT / 0.6), sm = this.shock.material as THREE.MeshBasicMaterial;
    this.shock.scale.setScalar(1 + sa * (6 + 10 * this.shockK)); sm.opacity = this.shockT < 0.6 ? (1 - sa) * (0.5 + 0.5 * this.shockK) : 0;
    sm.color.copy(accent).lerp(WHITE_HOT, 0.6);
    // knockback: jolt back and shake sideways; bob on the hover field (sagging and wobbling when underpowered); bank into lane changes
    const sag = under * (0.35 + 0.15 * Math.sin(t * 7)), shiver = over * 0.04 * Math.sin(t * 70);
    this.ship.position.set(Math.sin(t * 60) * 0.35 * this.knock + shiver, 0.12 * Math.sin(t * 3) + 0.3 * this.knock - sag, 1.8 * this.knock);
    this.ship.rotation.set(-0.25 * this.knock + 0.08 * under * Math.sin(t * 5), 0, s.bank + Math.sin(t * 45) * 0.2 * this.knock + 0.07 * under * Math.sin(t * 3.3));
    // trail: a ribbon from the pod tips, fading out behind
    const wp = this.group.position, half = this.tipHalf;
    const wantW = (s.tier ?? 0) >= 3 ? 0.22 : (s.tier ?? 0) >= 1 ? 0.13 : 0.09;
    this.trailW += (wantW - this.trailW) * Math.min(1, dt * 3);
    if (!this.trailInit) { for (let i = 0; i < TRAIL; i++) this.writeTrail(i, wp, right, up, half); this.trailInit = true; }
    this.trailPos.copyWithin(12, 0, (TRAIL - 1) * 12);
    this.writeTrail(0, wp, right, up, half);
    const tier = s.tier ?? 0;
    for (let i = 0; i < TRAIL; i++) {
      const a = Math.pow(1 - i / TRAIL, tier >= 3 ? 1.1 : 1.6) * (s.ghost ? 0.15 : s.overdrive || over > 0.3 || tier ? 0.9 : 0.6) * (0.5 + 0.5 * this.sputter);
      const c = tier >= 2 ? this.hot.setHSL(((i / TRAIL) * 1.5 + t * 0.6) % 1, 1, 0.6) : tier === 1 ? this.hot.copy(GOLD).lerp(accent, i / TRAIL) : accent;
      const sp = tier >= 3 && Math.random() < 0.08 ? 2.2 : 1; // sparkle
      for (let k = 0; k < 4; k++) this.trailCol.set([c.r * a * sp, c.g * a * sp, c.b * a * sp, a], (i * 4 + k) * 4);
    }
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trail.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private strikeArcs(dt: number, over: number) {
    const m = this.arcs.material as THREE.LineBasicMaterial;
    m.opacity = over > 0.15 ? Math.min(1, over * 1.4) * (0.5 + 0.5 * Math.random()) : 0;
    if (!m.opacity) return;
    this.arcT -= dt; if (this.arcT > 0) return;
    this.arcT = 0.045;
    const A = this.arcAnchors, live = Math.ceil(ARCS * Math.min(1, over * 1.3));
    let o = 0;
    for (let a = 0; a < ARCS; a++) {
      const p = A[Math.floor(Math.random() * A.length)], q = A[Math.floor(Math.random() * A.length)];
      let px = p.x, py = p.y, pz = p.z;
      for (let k = 1; k < ARC_PTS; k++) {
        const u = k / (ARC_PTS - 1), j = k < ARC_PTS - 1 ? 0.35 : 0;
        const nx = p.x + (q.x - p.x) * u + (Math.random() - 0.5) * j, ny = p.y + (q.y - p.y) * u + (Math.random() - 0.5) * j + 0.15 * Math.sin(u * Math.PI), nz = p.z + (q.z - p.z) * u + (Math.random() - 0.5) * j;
        if (a < live) this.arcPos.set([px, py, pz, nx, ny, nz], o); else this.arcPos.fill(0, o, o + 6);
        o += 6; px = nx; py = ny; pz = nz;
      }
    }
    (this.arcs.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
  private writeTrail(i: number, p: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, half: number) {
    this.tmp.copy(p).addScaledVector(u, 0.05);
    const w = this.trailW, out: number[] = [];
    for (const side of [-1, 1]) for (const e of [-w, w]) { const k = side * half + e; out.push(this.tmp.x + r.x * k, this.tmp.y + r.y * k, this.tmp.z + r.z * k); }
    this.trailPos.set(out, i * 12);
  }
}
