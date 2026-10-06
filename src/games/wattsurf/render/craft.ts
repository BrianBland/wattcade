import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
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
/** Position + normals only, so mixed sources merge. */
function bare(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g, out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position')); out.computeVertexNormals();
  return out;
}
const hull = (w: number, h: number): Array<[number, number]> => [[0, h], [w * 0.72, h * 0.5], [w, 0], [w * 0.62, -h * 0.65], [-w * 0.62, -h * 0.65], [-w, 0], [-w * 0.72, h * 0.5]];
const oct = (w: number, h: number): Array<[number, number]> => Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * w, Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * h]);

/** The craft's parts (local: −z forward, +y up). Pure geometry, no materials. */
export function craftGeometry() {
  const fuselage = loft([[-3.0, 0.04, 0.03], [-2.2, 0.3, 0.16], [-1.0, 0.52, 0.3], [0.4, 0.62, 0.36], [1.4, 0.55, 0.32], [1.75, 0.42, 0.24]], hull);
  const pods: THREE.BufferGeometry[] = [], wings: THREE.BufferGeometry[] = [], fins: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    pods.push(loft([[-1.5, 0.05, 0.05], [-1.1, 0.2, 0.18], [0.6, 0.27, 0.24], [1.45, 0.3, 0.27], [1.6, 0.26, 0.23]].map(([z, w, h]) => [z, w, h, side * 1.35, -0.05] as [number, number, number, number, number]), oct));
    const wing = plate([[0.4, -0.6], [1.3, -0.15], [1.3, 1.1], [0.45, 1.35]], 0.07); wing.translate(0, -0.06, 0);
    const tipFin = plate([[1.55, -0.2], [2.25, 0.5], [2.3, 1.15], [1.6, 1.0]], 0.05); tipFin.translate(0, -0.12, 0); // outboard canard blade
    if (side < 0) { wing.scale(-1, 1, 1); tipFin.scale(-1, 1, 1); }
    wings.push(wing, tipFin);
    const fin = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0.55, 0), new THREE.Vector2(1.55, 0), new THREE.Vector2(1.7, 0.8), new THREE.Vector2(1.3, 0.8)]), { depth: 0.05, bevelEnabled: false });
    fin.rotateY(-Math.PI / 2); fin.rotateZ(side * -0.3); fin.translate(side * 1.35, 0.18, 0);
    fins.push(fin.toNonIndexed());
  }
  const canopy = loft([[-1.55, 0.04, 0.02, 0, 0.26], [-1.1, 0.22, 0.14, 0, 0.3], [-0.3, 0.3, 0.2, 0, 0.32], [0.2, 0.2, 0.12, 0, 0.32]], (w, h) => [[0, h], [w * 0.8, h * 0.4], [w, -0.05], [-w, -0.05], [-w * 0.8, h * 0.4]]);
  const nozzles = [-1, 1].map((side) => { const r = new THREE.TorusGeometry(0.26, 0.06, 6, 12); r.translate(side * 1.35, -0.05, 1.62); return r.toNonIndexed(); });
  const hullGeo = mergeGeometries([fuselage, ...pods, ...wings, ...fins].map(bare))!;
  return { hull: hullGeo, canopy, nozzles: mergeGeometries(nozzles.map(bare))!, enginesX: 1.35, tailZ: 1.9 };
}

const TRAIL = 48, ARCS = 10, ARC_PTS = 6;
const HOT = new THREE.Color('#ff3b12'), WHITE_HOT = new THREE.Color('#ffd2b0'), HURT = new THREE.Color('#ff1020'), OD = new THREE.Color('#ff2bd6');

export interface CraftState { overdrive: boolean; ghost: boolean; bank: number; beat: number; over: number; under: number }

/**
 * The anti-grav craft: a faceted fuselage with a glass canopy, twin engine pods with glowing nozzles, swept wings
 * with canard blades and canted fins, neon edges, engine plumes, a pool of light on the track, wingtip ribbons.
 * Reacts to the game: absorbing a block flashes it in that colour and kicks the engines; a mine knocks it back and
 * pops a shield bubble; dropout ghosts it; Overdrive turns it pink and hot. Over the power ceiling it overcharges
 * (red-hot hull, white-hot edges, crackling arcs); under the floor the engines sputter and it sags on its hover field.
 */
export class Craft {
  readonly group = new THREE.Group();     // positioned on the track by the renderer
  private ship = new THREE.Group();       // local offsets (knockback, bob)
  private body: THREE.MeshBasicMaterial; private edge: THREE.LineBasicMaterial; private glass: THREE.MeshBasicMaterial; private nozzle: THREE.MeshBasicMaterial;
  private plumes: THREE.Sprite[] = []; private under: THREE.Sprite; private bubble: THREE.Mesh;
  private arcs: THREE.LineSegments; private arcPos = new Float32Array(ARCS * (ARC_PTS - 1) * 2 * 3); private arcAnchors: THREE.Vector3[] = []; private arcT = 0;
  private trail: THREE.Mesh; private trailPos = new Float32Array(TRAIL * 4 * 3); private trailCol = new Float32Array(TRAIL * 4 * 4); private trailInit = false;
  private base: THREE.Color; private flashC = new THREE.Color(); private flash = 0; private kick = 0; private hurt = 0; private knock = 0; private sputter = 1;
  private tmp = new THREE.Vector3(); private col = new THREE.Color(); private hot = new THREE.Color();
  constructor(color: string) {
    this.base = new THREE.Color(color);
    const g = craftGeometry();
    this.body = new THREE.MeshBasicMaterial({ color: this.base.clone().multiplyScalar(0.3), transparent: true, side: THREE.DoubleSide, toneMapped: false });
    this.edge = new THREE.LineBasicMaterial({ color, transparent: true, toneMapped: false });
    this.glass = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
    this.nozzle = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const tex = glowTexture();
    const glow = (opacity = 1) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, toneMapped: false }));
    for (const side of [-1, 1]) { const p = glow(); p.position.set(side * g.enginesX, -0.05, g.tailZ); this.plumes.push(p); }
    this.under = glow(0.5); this.under.position.set(0, -0.7, 0.2); this.under.scale.set(4.6, 1.6, 1);
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 1), new THREE.MeshBasicMaterial({ color: '#ff2030', wireframe: true, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    // overcharge arcs: jagged lines between points on the hull, re-struck many times a second
    const hp = g.hull.getAttribute('position');
    for (let i = 0; i < hp.count; i += 7) this.arcAnchors.push(new THREE.Vector3().fromBufferAttribute(hp, i));
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcs = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: '#ffb48a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcs.frustumCulled = false;
    this.ship.add(new THREE.Mesh(g.hull, this.body), new THREE.LineSegments(new THREE.EdgesGeometry(g.hull, 25), this.edge),
      new THREE.Mesh(g.canopy, this.glass), new THREE.Mesh(g.nozzles, this.nozzle), ...this.plumes, this.under, this.bubble, this.arcs);
    this.ship.scale.setScalar(1.15);
    this.group.add(this.ship);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    // two thin ribbons streaming from the wing tips: per row 4 verts (left in/out, right in/out)
    const idx: number[] = []; for (let i = 0; i < TRAIL - 1; i++) for (const o of [0, 2]) { const a = i * 4 + o, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
  }
  get trailMesh() { return this.trail; }

  absorb(c: THREE.Color) { this.flashC.copy(c); this.flash = 1; this.kick = Math.min(1.6, this.kick + 0.5); }
  greyHit() { this.hurt = 1; this.knock = 1; }

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
    this.glass.color.copy(this.hot.copy(accent).lerp(WHITE_HOT, 0.5)).multiplyScalar(0.5 + 0.3 * s.beat);
    this.nozzle.color.copy(accent).lerp(WHITE_HOT, 0.3 + 0.2 * over).multiplyScalar(1.2 + 0.8 * this.kick);
    const ghost = s.ghost ? 0.25 + 0.15 * Math.sin(t * 20) : 1;
    this.body.opacity = ghost; this.edge.opacity = s.ghost ? 0.45 : 1; this.glass.opacity = s.ghost ? 0.2 : 0.55;
    // engines: plumes kick on pickups and beats, roar when overcharged, cough and cut out when underpowered
    if (under > 0.05) { if (Math.random() < dt * (3 + 10 * under)) this.sputter = Math.random() < under ? 0.05 : 0.5; this.sputter += (1 - this.sputter) * Math.min(1, dt * 6); } else this.sputter = 1;
    const plume = (s.overdrive ? 2.2 : 1.2) * (1 + 0.45 * this.kick + 0.2 * s.beat + 0.25 * over) * (0.9 + 0.2 * Math.random()) * this.sputter;
    for (const p of this.plumes) { (p.material as THREE.SpriteMaterial).color.copy(accent).lerp(WHITE_HOT, over * 0.15); p.scale.set(plume, plume, 1); }
    const um = this.under.material as THREE.SpriteMaterial;
    um.color.copy(accent); um.opacity = (0.22 + 0.3 * this.kick + 0.15 * s.beat) * (1 - 0.5 * over) * (0.4 + 0.6 * this.sputter);
    const bm = this.bubble.material as THREE.MeshBasicMaterial; bm.opacity = this.hurt * 0.9; this.bubble.scale.setScalar(1 + (1 - this.hurt) * 0.5); this.bubble.rotation.y = t * 3;
    this.strikeArcs(dt, over);
    // knockback: jolt back and shake sideways; bob on the hover field (sagging and wobbling when underpowered); bank into lane changes
    const sag = under * (0.35 + 0.15 * Math.sin(t * 7)), shiver = over * 0.04 * Math.sin(t * 70);
    this.ship.position.set(Math.sin(t * 60) * 0.35 * this.knock + shiver, 0.12 * Math.sin(t * 3) + 0.3 * this.knock - sag, 1.8 * this.knock);
    this.ship.rotation.set(-0.25 * this.knock + 0.08 * under * Math.sin(t * 5), 0, s.bank + Math.sin(t * 45) * 0.2 * this.knock + 0.07 * under * Math.sin(t * 3.3));
    // trail: a ribbon from the wing tips, fading out behind
    const wp = this.group.position, half = 2.5;
    if (!this.trailInit) { for (let i = 0; i < TRAIL; i++) this.writeTrail(i, wp, right, up, half); this.trailInit = true; }
    this.trailPos.copyWithin(12, 0, (TRAIL - 1) * 12);
    this.writeTrail(0, wp, right, up, half);
    for (let i = 0; i < TRAIL; i++) {
      const a = Math.pow(1 - i / TRAIL, 1.6) * (s.ghost ? 0.15 : s.overdrive || over > 0.3 ? 0.9 : 0.6) * (0.5 + 0.5 * this.sputter);
      for (let k = 0; k < 4; k++) this.trailCol.set([accent.r * a, accent.g * a, accent.b * a, a], (i * 4 + k) * 4);
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
    const w = 0.09, out: number[] = [];
    for (const side of [-1, 1]) for (const e of [-w, w]) { const k = side * half + e; out.push(this.tmp.x + r.x * k, this.tmp.y + r.y * k, this.tmp.z + r.z * k); }
    this.trailPos.set(out, i * 12);
  }
}
