// Lofted boat hulls: curved sections with a rounded bow, sheer and a rising forefoot, plus hull-hugging stripes and
// decks that follow the outline. Length along x (bow +x), beam along z; spans y -0.55·depth .. 0.45·depth (+ sheer).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lam, planks, withDetail } from './util';

const NU = 28, NV = 9;
interface Hull { len: number; beam: number; depth: number }

const halfBeam = (h: Hull, u: number) => h.beam / 2 * (u <= 0.68 ? 0.76 + 0.24 * Math.sin((u / 0.68) * Math.PI / 2) : Math.sqrt(Math.max(0, 1 - ((u - 0.68) / 0.32) ** 2)));
const top = (h: Hull, u: number) => h.depth * (0.45 + 0.1 * Math.max(0, (u - 0.6) / 0.4) ** 2);
const bot = (h: Hull, u: number) => -0.55 * h.depth * (u > 0.7 ? 1 - 0.75 * ((u - 0.7) / 0.3) ** 2 : u < 0.1 ? 0.85 + 1.5 * u : 1);
/** Section half-width at depth fraction v (0 deck edge .. 1 keel): a full, rounded "U". */
const sect = (v: number) => Math.pow(Math.max(0, 1 - Math.pow(v, 2.2)), 1 / 2.2);
const point = (h: Hull, u: number, v: number, side: number, grow = 0): [number, number, number] =>
  [-h.len / 2 + u * h.len, top(h, u) + (bot(h, u) - top(h, u)) * v, side * (halfBeam(h, u) * sect(v) + grow)];

/** Hull surface between depth fractions v0..v1 (or absolute y range when `ys`), both sides; optional transom. */
function surface(h: Hull, v0: number, v1: number, grow: number, ys?: [number, number], transom = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const vAt = (u: number, k: number) => {
    if (!ys) return v0 + (v1 - v0) * (k / NV);
    const t = top(h, u), b = bot(h, u), y = ys[0] + (ys[1] - ys[0]) * (1 - k / NV);
    return Math.max(0, Math.min(1, (y - t) / (b - t)));
  };
  for (const side of [-1, 1]) for (let i = 0; i < NU; i++) for (let k = 0; k < NV; k++) {
    const u0 = i / NU, u1 = (i + 1) / NU;
    const a = point(h, u0, vAt(u0, k), side, grow), b = point(h, u1, vAt(u1, k), side, grow);
    const c = point(h, u0, vAt(u0, k + 1), side, grow), d = point(h, u1, vAt(u1, k + 1), side, grow);
    if (side > 0) pos.push(...a, ...c, ...b, ...b, ...c, ...d); else pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  if (transom) for (let k = 0; k < NV; k++) { // flat stern
    const p0 = point(h, 0, vAt(0, k), -1, grow), p1 = point(h, 0, vAt(0, k + 1), -1, grow), q0 = point(h, 0, vAt(0, k), 1, grow), q1 = point(h, 0, vAt(0, k + 1), 1, grow);
    pos.push(...p0, ...p1, ...q0, ...q0, ...p1, ...q1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const out = toCreasedNormals(g, 0.7); g.dispose();
  return out;
}

/** Deck (or an open boat's floor at depth fraction v) following the hull outline. */
function deck(h: Hull, v = 0, lift = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < NU; i++) {
    const a = point(h, i / NU, v, -1, -0.01), b = point(h, (i + 1) / NU, v, -1, -0.01), c = point(h, i / NU, v, 1, -0.01), d = point(h, (i + 1) / NU, v, 1, -0.01);
    for (const p of [a, b, c, d]) p[1] += lift;
    pos.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

const openMats = new Map<number, THREE.MeshLambertMaterial>();
const openMat = (c: number) => { let m = openMats.get(c); if (!m) { m = withDetail(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })); openMats.set(c, m); } return m; };

/**
 * A decked ship hull: hull colour, a darker rubbing strake under the gunwale, optional boot stripes (absolute y
 * ranges), and a planked deck.
 */
export function shipHull(len: number, beam: number, depth: number, color: number, deckColor = 0xd8c8a0, stripes: Array<[number, number, number]> = []): THREE.Group {
  const h = { len, beam, depth }, g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, cast = true) => { const me = new THREE.Mesh(geo, m); me.castShadow = cast; me.receiveShadow = true; g.add(me); };
  add(surface(h, 0, 1, 0), lam(color));
  add(surface(h, 0, 0.12, 0.025, undefined, false), lam(new THREE.Color(color).multiplyScalar(0.55).getHex()), false);
  for (const [y0, y1, c] of stripes) add(surface(h, 0, 1, 0.015, [y0, y1], false), lam(c), false);
  add(deck(h, 0, 0.005), planks(deckColor), false);
  return g;
}

/** An open boat (rowboat, lifeboat): double-sided shell with a floor and a gunwale rim. */
export function openBoat(len: number, beam: number, depth: number, color: number, floor = 0xc9b48a): THREE.Group {
  const h = { len, beam, depth }, g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; g.add(me); };
  add(surface(h, 0, 1, 0), openMat(color));
  add(surface(h, 0, 0.1, 0.02, undefined, false), lam(new THREE.Color(color).multiplyScalar(0.6).getHex()));
  add(deck(h, 0.6), planks(floor));
  return g;
}
