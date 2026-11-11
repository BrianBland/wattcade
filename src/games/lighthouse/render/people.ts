// Islanders: small rounded figures with a shaped coat or dress, jointed arms and legs, a face, hair and a hat.
// Front is +z; feet at y = 0; about 0.95 tall. Geometry is shared between all figures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { capsule, cyl, mulberry, pick, sphere, withDetail } from './util';

export const CLOTHES = [0x3b6ea5, 0xc0392b, 0x2e7d32, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x34495e, 0xd35400, 0x16a085];
export const SKIN = [0xf2c9a0, 0xd9a577, 0xa7754d, 0x7a5236, 0xf5d5b8];
const HAIR = [0x2b1d14, 0x5a3a22, 0x8a5a2b, 0xd8b26a, 0x9a9a9a, 0x1a1a1a, 0xa0431f];
const TROUSERS = [0x2d3138, 0x3d3a34, 0x4a5a6a, 0x5e472b];
const HATS = [0xf4e2a1, 0x34495e, 0xc0392b, 0x2e7d32];

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
let parts: Record<string, THREE.BufferGeometry> | null = null;
function geo() {
  if (parts) return parts;
  const lathe = (pts: THREE.Vector2[]) => new THREE.LatheGeometry(pts, 18);
  parts = {
    coat: lathe([V2(0, 0.3), V2(0.14, 0.3), V2(0.16, 0.36), V2(0.165, 0.46), V2(0.16, 0.56), V2(0.165, 0.62), V2(0.14, 0.67), V2(0.08, 0.705), V2(0, 0.715)]),
    dress: lathe([V2(0, 0.1), V2(0.21, 0.1), V2(0.215, 0.13), V2(0.18, 0.3), V2(0.145, 0.45), V2(0.155, 0.56), V2(0.155, 0.62), V2(0.135, 0.67), V2(0.08, 0.705), V2(0, 0.715)]),
    neck: cyl(0.045, 0.05, 0.08, 10),
    head: sphere(0.13),
    hair: new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    nose: sphere(0.026),
    leg: capsule(0.055, 0.2),
    shoe: sphere(0.06),
    arm: capsule(0.042, 0.2),
    hand: sphere(0.045),
    brim: cyl(0.2, 0.2, 0.02, 24),
    crown: cyl(0.105, 0.12, 0.12, 18),
  };
  return parts;
}

type Part = [THREE.BufferGeometry, number, [number, number, number], [number, number, number]?, number?];
/** Bake parts (geometry, colour, offset, scale, x-tilt) into one vertex-coloured geometry. */
export function part(list: Part[]): THREE.BufferGeometry {
  const c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const geos = list.map(([g0, col, p, sc, rx]) => {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    q.setFromEuler(new THREE.Euler(rx ?? 0, 0, 0));
    g.applyMatrix4(m.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...(sc ?? [1, 1, 1]))));
    c.setHex(col);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const out = mergeGeometries(geos)!; geos.forEach((g) => g.dispose());
  return out;
}
let vcMat: THREE.MeshLambertMaterial | null = null;
/** Shared vertex-coloured material (with the same surface detail as everything else). */
export const vertexColored = () => (vcMat ??= withDetail(new THREE.MeshLambertMaterial({ vertexColors: true })));
/** Limbs skip the shadow pass (their shadow is lost under the body's anyway): fewer draw calls per islander. */
function meshOf(g: THREE.BufferGeometry, cast = false): THREE.Mesh { const me = new THREE.Mesh(g, vertexColored()); me.castShadow = cast; me.receiveShadow = true; return me; }

export type Pose = 'stand' | 'walk' | 'kneel' | 'sit' | 'wave' | 'carry';

export class Figure {
  readonly g = new THREE.Group();
  /** Everything above the hips (lowered when kneeling or sitting). */
  readonly upper = new THREE.Group();
  readonly legs: THREE.Group[] = []; readonly arms: THREE.Group[] = [];

  constructor(seed: number, o: { clothes?: number; skin?: number; hat?: boolean | number; dress?: boolean } = {}) {
    const r = mulberry(seed * 53 + 11), P = geo();
    const clothes = o.clothes ?? pick(r, CLOTHES), skin = o.skin ?? pick(r, SKIN);
    const dress = o.dress ?? r() < 0.35;
    const hair = pick(r, HAIR), trousers = dress ? 0x3a2f28 : pick(r, TROUSERS), shoes = 0x2a221c;
    // each moving part is one vertex-coloured mesh: 5 draw calls per islander
    const leg = part([[P.leg, trousers, [0, -0.155, 0]], [P.shoe, shoes, [0, -0.31, 0.03], [0.9, 0.55, 1.3]]]);
    const arm = part([[P.arm, clothes, [0, -0.14, 0]], [P.hand, skin, [0, -0.29, 0]]]);
    for (const sx of [-1, 1]) {
      const lg = new THREE.Group(); lg.position.set(sx * 0.075, 0.36, 0); lg.add(meshOf(leg));
      this.legs.push(lg); this.g.add(lg);
    }
    const hat = o.hat ?? r() < 0.45;
    const hatC = typeof hat === 'number' ? hat : pick(r, HATS);
    this.upper.add(meshOf(part([
      [dress ? P.dress : P.coat, clothes, [0, 0, 0]],
      [P.neck, skin, [0, 0.73, 0]], [P.head, skin, [0, 0.83, 0]], [P.nose, skin, [0, 0.82, 0.128]],
      [P.hair, hair, [0, 0.845, -0.012], undefined, -0.35],
      ...(hat ? [[P.brim, hatC, [0, 0.92, 0]], [P.crown, hatC, [0, 0.98, 0]]] as Part[] : []),
    ]), true));
    for (const sx of [-1, 1]) {
      const ag = new THREE.Group(); ag.position.set(sx * 0.175, 0.645, 0); ag.rotation.z = sx * 0.12; ag.add(meshOf(arm));
      this.arms.push(ag); this.upper.add(ag);
    }
    this.g.add(this.upper);
  }

  /** Set the limbs for a pose; `t` drives the walk cycle and waving. */
  pose(p: Pose, t = 0) {
    const [ll, lr] = this.legs, [al, ar] = this.arms;
    let drop = 0, legX = 0, swing = 0;
    al.rotation.set(0, 0, -0.12); ar.rotation.set(0, 0, 0.12);
    if (p === 'walk') swing = Math.sin(t * 9);
    else if (p === 'kneel') { drop = 0.17; legX = 1.45; al.rotation.x = ar.rotation.x = -0.9; }
    else if (p === 'sit') { drop = 0.2; legX = -1.35; al.rotation.x = ar.rotation.x = -0.7; }
    else if (p === 'wave') { al.rotation.z = -0.3; ar.rotation.z = 2.5 + Math.sin(t * 9) * 0.35; }
    else if (p === 'carry') { al.rotation.z = -2.75; ar.rotation.z = 2.75; swing = Math.sin(t * 9) * 0.7; }
    this.upper.position.y = -drop;
    ll.position.y = lr.position.y = 0.36 - drop;
    ll.rotation.x = legX + swing * 0.55; lr.rotation.x = legX - swing * 0.55;
    if (p === 'walk') { al.rotation.x = -swing * 0.45; ar.rotation.x = swing * 0.45; }
  }
}
