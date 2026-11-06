import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/**
 * Scenery kit: detailed, merged, vertex-coloured geometries for instancing (one draw call per kind). Built once per
 * module and shared between renderer mounts. Units: x across, y up, z along (bow toward −z, the direction of travel).
 */
type Part = THREE.BufferGeometry;
const colored = (g: Part, color: string): Part => {
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return colored(g.toNonIndexed(), color);
};
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, seg = 10, rx = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g.toNonIndexed(), color);
};
/** A hull: pointed bow, flared beam, squared stern, extruded to `h`, waterline at y = 0. */
function hull(len: number, beam: number, h: number, color: string, bow = 0.22, stern = 0.85): Part {
  const s = new THREE.Shape(), L = len / 2, B = beam / 2;
  s.moveTo(0, -L); s.quadraticCurveTo(B * 1.05, -L + len * bow * 0.6, B, -L + len * bow);
  s.lineTo(B, L - 2); s.lineTo(B * stern, L); s.lineTo(-B * stern, L); s.lineTo(-B, L - 2);
  s.lineTo(-B, -L + len * bow); s.quadraticCurveTo(-B * 1.05, -L + len * bow * 0.6, 0, -L);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, h - h * 0.35, 0); // most of the hull above water, a little below
  return colored(g.toNonIndexed(), color);
}
const merge = (parts: Part[]) => { const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }))!; parts.forEach(p => p.dispose()); g.computeVertexNormals(); return g; };
const GREY = '#6c7a89', DARK = '#3a4552', DECK = '#5d6670', LIGHT = '#aab6c2', RED = '#7a2e2e', WIN = '#9fe8ff';

/** Supercarrier: angled flight deck overhanging the hull, island with mast and radar, deck edge elevators. */
function carrierShip(): Part {
  const p: Part[] = [hull(70, 12, 4, GREY, 0.18, 0.9), box(11, 0.5, 66, 0, 4.2, 0, DECK), box(9, 0.45, 26, -3, 4.25, 8, DECK, -0.16)];
  p.push(box(3.2, 5, 9, 5.2, 7, 6, LIGHT), box(2.6, 2.4, 6, 5.2, 10.6, 5, LIGHT), box(3.3, 0.5, 2, 5.2, 8.2, 2, WIN), box(3.3, 0.5, 2, 5.2, 10.4, 2.6, WIN));
  p.push(cyl(0.15, 0.2, 6, 5.2, 14.5, 5, DARK, 6), box(2.6, 0.12, 0.6, 5.2, 16.5, 5, DARK), box(1.6, 1.2, 0.15, 5.2, 13.2, 7, DARK));
  for (const z of [-14, 16]) p.push(box(3.4, 0.4, 4, 6.8, 4.15, z, DECK)); // elevators
  p.push(box(12.4, 1.2, 0.3, 0, 3.4, 33, DARK)); // stern ramp
  return merge(p);
}
/** Battleship: long low hull, stepped superstructure, two funnels, three triple turrets with barrels. */
function battleship(): Part {
  const p: Part[] = [hull(48, 8.5, 3, GREY, 0.26), box(7, 0.3, 40, 0, 3.05, 1, DECK)];
  p.push(box(4.6, 2.2, 10, 0, 4.2, 2, LIGHT), box(3.4, 2, 6, 0, 6.3, 0.5, LIGHT), box(2.2, 2.2, 3, 0, 8.4, -0.5, LIGHT), box(2.3, 0.4, 0.8, 0, 8.6, -2, WIN));
  p.push(cyl(0.1, 0.15, 5, 0, 11.5, 0, DARK, 6), box(3, 0.1, 0.4, 0, 12.5, 0, DARK));
  for (const z of [4, 7]) p.push(cyl(0.9, 1.1, 3, 0, 6.5, z, DARK, 10));
  for (const [z, dir, y] of [[-15, -1, 3.8], [-10, -1, 4.6], [14, 1, 3.8]] as const) {
    p.push(cyl(1.7, 1.9, 1.2, 0, y, z, LIGHT, 12));
    for (const x of [-0.6, 0, 0.6]) p.push(cyl(0.14, 0.18, 4.5, x, y + 0.2, z + dir * 2.8, DARK, 6, Math.PI / 2));
  }
  return merge(p);
}
/** Destroyer: slim hull, raked bridge, mast, funnel, a forward gun and missile cells. */
function destroyer(): Part {
  const p: Part[] = [hull(28, 4.6, 2.4, GREY, 0.3), box(3.8, 0.25, 22, 0, 2.45, 1, DECK)];
  p.push(box(3, 1.8, 6, 0, 3.4, 0, LIGHT), box(2.4, 1.4, 3, 0, 4.9, -1, LIGHT), box(2.5, 0.35, 0.5, 0, 5.2, -2.4, WIN), cyl(0.6, 0.75, 2, 0, 4.4, 3.5, DARK, 8));
  p.push(cyl(0.08, 0.12, 4.5, 0, 7.6, 0, DARK, 6), box(1.6, 0.08, 0.3, 0, 8.6, 0, DARK), cyl(0.7, 0.8, 0.8, 0, 3.0, -8, LIGHT, 10), cyl(0.1, 0.12, 2.6, 0, 3.2, -9.6, DARK, 6, Math.PI / 2));
  for (let i = 0; i < 4; i++) p.push(box(0.6, 0.15, 0.6, i % 2 ? 0.4 : -0.4, 2.62, -5 + Math.floor(i / 2) * 0.7, DARK));
  return merge(p);
}
/** River boat: small cabin cruiser. */
function riverBoat(): Part {
  return merge([hull(5.5, 1.9, 0.9, '#e8eef4', 0.35), box(1.3, 0.7, 1.8, 0, 1.25, 0.4, '#d23f4a'), box(1.32, 0.3, 0.6, 0, 1.3, -0.4, WIN), box(1.6, 0.1, 1.2, 0, 0.92, 1.9, '#9a7a55')]);
}
/** Gun barge (ground units at sea). */
function barge(): Part {
  return merge([hull(13, 8, 1.6, '#4c5a68', 0.12, 0.95), box(7, 0.3, 11, 0, 1.65, 0, DECK), box(7.2, 0.6, 0.3, 0, 1.9, -5.4, '#c8a23a'), box(7.2, 0.6, 0.3, 0, 1.9, 5.4, '#c8a23a')]);
}
/** Parked jet: fuselage, swept wings folded up at the tips, twin tails, canopy. Nose toward −z. */
function parkedJet(): Part {
  const nose = cyl(0, 0.45, 1.6, 0, 0.55, -2.8, '#c9d3dc', 8, -Math.PI / 2);
  const p: Part[] = [nose, cyl(0.45, 0.5, 4, 0, 0.55, 0, '#c9d3dc', 8, Math.PI / 2), box(0.6, 0.3, 0.9, 0, 0.95, -1.4, '#24394f')];
  for (const s of [-1, 1]) {
    p.push(box(1.6, 0.1, 1.5, s * 1.1, 0.5, 0.4, '#b9c4ce', s * -0.35), box(0.12, 0.9, 0.7, s * 1.95, 0.9, 0.7, '#b9c4ce'));
    p.push(box(0.08, 0.8, 0.8, s * 0.35, 1.1, 1.7, '#9fadba', 0), box(0.9, 0.06, 0.6, s * 0.6, 0.6, 1.8, '#b9c4ce'));
  }
  p.push(box(0.5, 0.35, 0.6, 0, 0.55, 2.2, '#2b2f36'));
  return merge(p);
}
/** Deck tractor and a fuel cart. */
function tractor(): Part { return merge([box(0.9, 0.45, 1.4, 0, 0.3, 0, '#e2c23a'), box(0.7, 0.4, 0.5, 0, 0.7, 0.3, '#2b2f36'), box(0.8, 0.35, 1.2, 0, 0.25, 1.8, '#d8dde2')]); }
/** Carrier island tower for the deck edge: base, bridge windows, mast with a radar bar and dish. */
function island(): Part {
  return merge([box(5, 7, 10, 0, 3.5, 0, LIGHT), box(4, 3, 7, 0, 8.5, -0.5, LIGHT), box(5.1, 0.6, 2, 0, 5.5, -4.2, WIN), box(4.1, 0.6, 1.5, 0, 8.8, -3.6, WIN),
    cyl(0.18, 0.25, 7, 0, 13.5, 0, DARK, 6), box(3.4, 0.15, 0.6, 0, 15.5, 0, DARK), cyl(0.9, 0.9, 0.15, 0, 12.2, 1.4, DARK, 12, Math.PI / 2), box(1.2, 1.2, 1.2, 0, 10.6, 2.5, '#d8dde2')]);
}
/** Broadleaf tree: a trunk and a clumped canopy of lumpy blobs in varied greens (base at y = 0, ~3 units tall). */
function tree(): Part {
  const blob = (r: number, x: number, y: number, z: number, color: string) => { const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); return colored(g.toNonIndexed(), color); };
  return merge([cyl(0.12, 0.18, 1.3, 0, 0.65, 0, '#5a4330', 6), blob(0.95, 0, 1.9, 0, '#3f7d4c'), blob(0.7, 0.6, 1.6, 0.3, '#4a8f55'), blob(0.65, -0.55, 1.65, -0.25, '#36703f'), blob(0.6, 0.1, 2.5, -0.2, '#56a061')]);
}
/** Sphere part (radomes, domes, tanks). */
const ball = (r: number, x: number, y: number, z: number, color: string, sy = 1) => { const g = new THREE.SphereGeometry(r, 10, 7); g.scale(1, sy, 1); g.translate(x, y, z); return colored(g.toNonIndexed(), color); };
const HULL = '#a3aeb9', HULL_D = '#6a7681', WHITE = '#dfe6ec', HAZ = '#d8b02a', BLK = '#22272d', ORANGE = '#e0672a';
/** Railing along z at outer edge x, deck height y, over length len (posts every 2). */
const railing = (x: number, y: number, len: number): Part[] => {
  const p: Part[] = [box(0.12, 0.12, len, x, y + 1.05, 0, LIGHT)];
  for (let z = -len / 2; z <= len / 2 + 0.01; z += 2) p.push(box(0.1, 1.05, 0.1, x, y + 0.52, z, LIGHT));
  return p;
};
/**
 * Deck-edge modules for the carrier flanks. Built for the starboard side: x runs outward from the deck edge (x = 0),
 * y up from the deck, z along (length given per module); the port side is the same rotated half a turn.
 */
function gunSponson(): Part { // 10 long: a bracketed platform with a close-in weapon mount
  const p: Part[] = [box(10, 2, 10, 5, 1, 0, HULL), box(9, 0.3, 9.4, 5.2, 2.15, 0, DECK), box(3, 3, 10, 9.5, -0.5, 0, HULL_D)];
  p.push(cyl(1.3, 1.5, 1.4, 6.5, 2.9, 0, LIGHT, 12), ball(1.2, 6.5, 4.1, 0, WHITE, 1.2), box(0.9, 0.9, 1.2, 6.5, 4.2, -1.1, BLK));
  p.push(cyl(0.16, 0.16, 2.4, 6.5, 4.2, -2.6, DARK, 6, Math.PI / 2), cyl(1, 1.1, 1.2, 2.6, 2.9, 3, LIGHT, 8), box(1.6, 1.2, 1.6, 2.6, 4, 3, DARK));
  p.push(...railing(9.9, 2.3, 9.6)); return merge(p);
}
function radarSponson(): Part { // 10 long: a lattice tower carrying a radome
  const p: Part[] = [box(9, 1.8, 10, 4.5, 0.9, 0, HULL), box(8.6, 0.3, 9.4, 4.5, 1.95, 0, DECK)];
  for (const [x, z] of [[3, -2], [7, -2], [3, 2], [7, 2]]) p.push(box(0.3, 9, 0.3, x, 6.5, z, LIGHT));
  for (const y of [4, 7, 10]) p.push(box(4.3, 0.2, 0.2, 5, y, -2, LIGHT), box(4.3, 0.2, 0.2, 5, y, 2, LIGHT), box(0.2, 0.2, 4.3, 3, y, 0, LIGHT), box(0.2, 0.2, 4.3, 7, y, 0, LIGHT));
  p.push(box(5, 0.4, 5, 5, 11, 0, HULL_D), ball(2.1, 5, 13, 0, WHITE), cyl(0.12, 0.12, 4, 5, 16.6, 0, DARK, 6), box(2.2, 0.12, 0.3, 5, 17.8, 0, DARK));
  p.push(...railing(8.9, 2.1, 9.6)); return merge(p);
}
function raftRack(): Part { // 14 long: life-raft canisters in two rows on a bracketed platform
  const p: Part[] = [box(8, 1.6, 14, 4, 0.8, 0, HULL), box(7.6, 0.25, 13.4, 4, 1.7, 0, DECK)];
  for (const x of [3, 6]) for (let i = 0; i < 6; i++) p.push(cyl(0.55, 0.55, 1.6, x, 2.45, -5.2 + i * 2.1, i % 2 ? WHITE : ORANGE, 10, Math.PI / 2));
  p.push(box(0.2, 1.6, 13, 7.6, 2.5, 0, HULL_D), ...railing(7.8, 1.85, 13.6)); return merge(p);
}
function catwalk(): Part { // 16 long: an open gallery a little below the deck with crates and hose reels
  const p: Part[] = [box(4, 0.3, 16, 2, -0.6, 0, DECK)];
  for (const z of [-7, -2.3, 2.3, 7]) p.push(box(0.4, 2.2, 0.4, 3.6, -1.8, z, HULL_D), box(3.4, 0.3, 0.4, 2, -1.5, z, HULL_D));
  p.push(box(1.2, 1, 1.4, 1.5, 0.05, -5, '#4f6b48'), box(1.2, 0.8, 1.2, 1.4, -0.05, -3.4, '#6a5a3c'), cyl(0.5, 0.5, 0.4, 1.6, 0, 4, ORANGE, 10, Math.PI / 2), box(1, 1, 1, 1.4, 0.05, 6, '#4f6b48'));
  p.push(...railing(3.9, -0.45, 15.6)); return merge(p);
}
function edgeElevator(): Part { // 14 long: an aircraft elevator platform with hazard-striped edges and lift machinery
  const p: Part[] = [box(11, 0.5, 14, 5.5, 0.25, 0, DECK), box(3, 3, 14, 11.5, -1, 0, HULL_D)];
  for (let i = 0; i < 7; i++) p.push(box(0.5, 0.06, 2, 10.75, 0.53, -6 + i * 2, i % 2 ? HAZ : BLK), box(1.5, 0.06, 0.5, 1 + i * 1.5, 0.53, 6.75, i % 2 ? HAZ : BLK));
  p.push(box(1.2, 4, 1.2, 11, 2, -6.4, HULL), box(1.2, 4, 1.2, 11, 2, 6.4, HULL), box(1.4, 0.6, 14, 11, 4.2, 0, HULL_D)); return merge(p);
}
function fuelStation(): Part { // 10 long: tanks, pipework and a hose cabinet
  const p: Part[] = [box(8, 1.5, 10, 4, 0.75, 0, HULL), box(7.6, 0.25, 9.4, 4, 1.6, 0, DECK)];
  for (const z of [-2.6, 2.6]) p.push(cyl(1.3, 1.3, 5, 4.5, 3, z, '#c8ccd0', 12, Math.PI / 2), box(0.3, 1.4, 0.3, 4.5, 1.9, z - 1.8, HULL_D), box(0.3, 1.4, 0.3, 4.5, 1.9, z + 1.8, HULL_D));
  p.push(cyl(0.18, 0.18, 9, 7, 2, 0, HAZ, 6, Math.PI / 2), cyl(0.18, 0.18, 9, 7.6, 2.6, 0, '#3b7bd6', 6, Math.PI / 2), box(1.4, 2, 2, 1.2, 2.6, 0, '#b23a3a'), ...railing(7.9, 1.75, 9.6));
  return merge(p);
}
/** Stealth island: raked, faceted tower walls, flat radar arrays, one integrated mast. */
function islandStealth(): Part {
  const s = new THREE.Shape(); s.moveTo(-3, -6); s.lineTo(3, -5); s.lineTo(3, 5); s.lineTo(-3, 6); s.lineTo(-3, -6);
  const tower = new THREE.ExtrudeGeometry(s, { depth: 9, bevelEnabled: false }).toNonIndexed(); tower.rotateX(-Math.PI / 2);
  const pos = tower.getAttribute('position'); for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = 1 - y / 9 * 0.32; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  const p: Part[] = [colored(tower, '#9aa5b0'), box(3.6, 0.6, 7.2, 0, 9.3, 0, '#9aa5b0'), box(4.1, 0.7, 1.4, 0, 6, -4.2, WIN), box(0.2, 2.6, 2.6, 2.75, 5.5, 0, BLK), box(0.2, 2.6, 2.6, -2.75, 5.5, 0, BLK)];
  const mast = new THREE.ConeGeometry(1.4, 6, 4).toNonIndexed(); mast.translate(0, 12.6, 0.5); p.push(colored(mast, '#9aa5b0'), cyl(0.08, 0.1, 3, 0, 17, 0.5, DARK, 5));
  return merge(p);
}
/** Tall island: three stepped tiers with window bands, a funnel, a lattice mast with a big dish. */
function islandTall(): Part {
  const p: Part[] = [box(6, 6, 12, 0, 3, 0, LIGHT), box(5, 4.5, 9, 0, 8.25, -0.5, LIGHT), box(3.6, 3, 6, 0, 12, -1, LIGHT)];
  p.push(box(6.1, 0.6, 2.2, 0, 7.4, -5.2, WIN), box(5.1, 0.6, 1.8, 0, 11.2, -4.4, WIN), box(3.7, 0.5, 1.4, 0, 13.6, -3.6, WIN));
  p.push(cyl(1.1, 1.3, 4, 0, 12.5, 3.2, HULL_D, 10), cyl(1.15, 1.15, 0.5, 0, 14.6, 3.2, BLK, 10));
  for (const [x, z] of [[-0.8, -1.6], [0.8, -1.6], [-0.8, 0], [0.8, 0]]) p.push(box(0.18, 7, 0.18, x, 17, z, DARK));
  for (const y of [15, 17.5, 20]) p.push(box(1.8, 0.14, 1.8, 0, y, -0.8, DARK));
  p.push(cyl(1.8, 1.8, 0.2, 0, 19, 1.2, '#d8dde2', 14, Math.PI / 2.4), box(4, 0.15, 0.5, 0, 20.4, -0.8, DARK));
  return merge(p);
}
/** Deck helicopter: fuselage, tail boom and fin, skids, a four-blade rotor. Nose toward −z. */
function helicopter(): Part {
  const p: Part[] = [ball(1.1, 0, 1.3, -0.3, '#5d6f4f', 0.8), box(1.6, 1.2, 1.6, 0, 1.2, 0.8, '#5d6f4f'), box(0.9, 0.5, 0.7, 0, 1.4, -1.2, '#1f2a33'), box(0.35, 0.4, 4, 0, 1.5, 3.2, '#5d6f4f'), box(0.12, 1.2, 0.8, 0, 2, 5, '#5d6f4f')];
  for (const sx of [-0.8, 0.8]) p.push(box(0.12, 0.12, 3, sx, 0.15, 0, BLK), box(0.1, 0.5, 0.1, sx, 0.4, -0.8, BLK), box(0.1, 0.5, 0.1, sx, 0.4, 0.8, BLK));
  p.push(cyl(0.15, 0.15, 0.5, 0, 2.3, 0, BLK, 6), box(7.5, 0.06, 0.3, 0, 2.55, 0, BLK, 0.4), box(0.3, 0.06, 7.5, 0, 2.55, 0, BLK, 0.4));
  return merge(p);
}
/** Fuel truck. Cab toward −z. */
function fuelTruck(): Part { return merge([box(1.3, 1, 1.2, 0, 0.7, -1.4, '#c43c33'), box(1.2, 0.5, 0.8, 0, 1.2, -1.6, '#1f2a33'), cyl(0.6, 0.6, 2.4, 0, 0.85, 0.5, '#d8dde2', 10, Math.PI / 2), box(1.3, 0.3, 3.6, 0, 0.25, 0, BLK)]); }
/** Rooftop water tank on legs (~2 across, 4 tall). */
function waterTank(): Part {
  const p: Part[] = [];
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) p.push(box(0.16, 1.6, 0.16, x, 0.8, z, '#2e3238'));
  p.push(cyl(1, 1, 1.8, 0, 2.5, 0, '#7b5e43', 12), cyl(1.02, 1.02, 0.12, 0, 2.0, 0, '#3d3f44', 12), cyl(1.02, 1.02, 0.12, 0, 3.0, 0, '#3d3f44', 12));
  const roof = new THREE.ConeGeometry(1.12, 0.7, 12).toNonIndexed(); roof.translate(0, 3.75, 0); p.push(colored(roof, '#3d3f44'));
  return merge(p);
}
/** A cluster of rooftop air-handling units with fan grilles (~4 across). */
function acUnits(): Part {
  const p: Part[] = [];
  for (const [x, z, w] of [[-1.2, -0.6, 1.4], [0.4, -0.6, 1.2], [-0.6, 1, 1.6], [1.4, 0.9, 1]] as const) {
    p.push(box(w, 0.7, 1, x, 0.35, z, '#8f989f'), cyl(0.32, 0.32, 0.06, x, 0.72, z, '#2b2f34', 10));
  }
  p.push(box(3.6, 0.25, 0.3, 0, 0.4, 0.2, '#6b737a')); return merge(p);
}
/** Rooftop helipad, radius 1: dark pad, white H, yellow touchdown ring. */
function helipad(): Part {
  const p: Part[] = [cyl(1, 1, 0.12, 0, 0.06, 0, '#2f353d', 24), box(0.12, 0.03, 0.7, -0.25, 0.135, 0, '#e8ecef'), box(0.12, 0.03, 0.7, 0.25, 0.135, 0, '#e8ecef'), box(0.5, 0.03, 0.12, 0, 0.135, 0, '#e8ecef')];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; p.push(box(0.12, 0.03, 0.26, Math.cos(a) * 0.82, 0.135, Math.sin(a) * 0.82, '#e0b52a', -a)); }
  return merge(p);
}
/** Lighthouse (~12 tall): banded tapering tower, gallery, lantern room, keeper's hut. */
function lighthouse(): Part {
  const p: Part[] = [], N = 16;
  // A rocky plinth, then a smooth tapering tower in red and white bands.
  const plinth = new THREE.CylinderGeometry(2.4, 2.9, 1.2, 12, 1).toNonIndexed(); plinth.translate(0, 0.6, 0); p.push(colored(displace(plinth, 0.25, 1.2, 131, new THREE.Vector3(0, 0.6, 0), false), '#6d6a66'));
  for (let i = 0; i < 6; i++) { const y0 = 1.2 + i * 1.5, r0 = 1.45 - i * 0.12, r1 = r0 - 0.12; p.push(cyl(r1, r0, 1.5, 0, y0 + 0.75, 0, i % 2 ? '#c8352f' : '#eef1f3', N)); }
  for (const y of [3.6, 6.6]) p.push(box(0.35, 0.5, 0.06, 0, y, 1.2, '#2b2f34')); // windows
  // Gallery deck with a railing, the lantern (glass between mullions), and a domed cap with a vent.
  p.push(cyl(1.3, 1.1, 0.25, 0, 10.35, 0, '#2b2f34', N));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.push(box(0.06, 0.6, 0.06, Math.cos(a) * 1.22, 10.75, Math.sin(a) * 1.22, '#2b2f34')); }
  p.push(cyl(1.24, 1.24, 0.06, 0, 11.05, 0, '#2b2f34', N), cyl(0.7, 0.7, 1.1, 0, 11.05, 0, '#ffe9a8', 8));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; p.push(box(0.07, 1.1, 0.07, Math.cos(a) * 0.72, 11.05, Math.sin(a) * 0.72, '#2b2f34')); }
  p.push(ball(0.8, 0, 11.6, 0, '#2b2f34', 0.6), cyl(0.06, 0.12, 0.5, 0, 12.2, 0, '#2b2f34', 6));
  // Keeper's cottage with a pitched roof and chimney.
  p.push(box(3, 1.8, 2.4, 2.6, 2.1, 1.8, '#e4e0d8'), box(0.5, 0.8, 0.05, 2.2, 1.6, 3.02, '#3a3430'), box(0.5, 0.45, 0.05, 3.3, 2.2, 3.02, '#2b3a46'));
  for (const sd of [-1, 1]) { const r = new THREE.BoxGeometry(3.4, 0.14, 1.55).toNonIndexed(); r.rotateX(sd * 0.62); r.translate(2.6, 3.42, 1.8 + sd * 0.62); p.push(colored(r, '#8c3b32')); }
  p.push(box(0.35, 0.9, 0.35, 3.5, 3.7, 1.3, '#7a706a'));
  return merge(p);
}
/** Offshore oil platform (~30 across): braced jacket legs, two decks with process modules, a lattice derrick, crane, flare boom, helideck and lifeboats. */
function oilRig(): Part {
  const p: Part[] = [], Y = '#c8a23a', S = '#59626c', W = '#d7d2c4';
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) p.push(cyl(0.9, 1.2, 9.5, x, 4.75, z, Y, 10));
  for (const y of [2.5, 6]) for (const [x0, z0, x1, z1] of [[-9, -9, 9, -9], [-9, 9, 9, 9], [-9, -9, -9, 9], [9, -9, 9, 9]]) { // horizontal and diagonal bracing
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0); p.push(box(0.35, 0.35, len, (x0 + x1) / 2, y, (z0 + z1) / 2, Y, ang));
    const d = new THREE.BoxGeometry(0.28, 0.28, Math.hypot(len, 3.5)).toNonIndexed(); d.rotateX(Math.atan2(3.5, len)); d.rotateY(ang); d.translate((x0 + x1) / 2, y + 1.75, (z0 + z1) / 2); p.push(colored(d, Y));
  }
  p.push(box(24, 1.0, 24, 0, 9.8, 0, '#4d555d'), box(23, 0.8, 22, 0, 13.6, 0, '#5d6670'));
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11], [0, -11], [0, 11]]) p.push(box(0.4, 3.2, 0.4, x, 11.8, z, S));
  // Process modules on the lower deck (seen between decks) and on top, in plant colours.
  for (const [x, z, w, d, h, c] of [[-6, 5, 6, 5, 2.6, '#8e9aa4'], [5, -6, 7, 4, 2.6, '#b8c0c6'], [6, 6, 4, 4, 2.6, '#7d8a6a']] as const) p.push(box(w, h, d, x, 10.3 + h / 2, z, c));
  p.push(box(9, 3.6, 7, -5, 15.8, 6, '#e6e1d6'), box(9.2, 0.5, 7.2, -5, 17.8, 6, '#9aa4ae'), box(9.1, 0.5, 0.1, -5, 16.6, 2.45, '#2b3a46'), box(0.1, 0.5, 7.1, -9.55, 16.6, 6, '#2b3a46')); // accommodation block
  p.push(cyl(1.2, 1.2, 3.5, 4, 15.75, -5, '#c4c9cd', 10), cyl(1.2, 1.2, 3.5, 6.8, 15.75, -5, '#c4c9cd', 10)); // separators
  for (let k = 0; k < 4; k++) p.push(cyl(0.3, 0.3, 2, -10 + k * 2, 15, -9, '#9aa4ae', 6)); // pipe stubs
  // Derrick: four converging legs with braces, a drill floor and crown block.
  const dx = 6, dz = 5, H = 12;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const g = new THREE.CylinderGeometry(0.14, 0.2, H, 4).toNonIndexed(); g.rotateZ(-sx * 0.1); g.rotateX(sz * 0.1); g.translate(dx + sx * 0.8, 14 + H / 2, dz + sz * 0.8); p.push(colored(g, W)); }
  for (let y = 16; y < 26; y += 3) { const w = 3.2 * (1 - (y - 14) / (H * 1.25)); p.push(box(w, 0.15, 0.15, dx, y, dz - w / 2, W), box(w, 0.15, 0.15, dx, y, dz + w / 2, W), box(0.15, 0.15, w, dx - w / 2, y, dz, W), box(0.15, 0.15, w, dx + w / 2, y, dz, W)); }
  p.push(box(5, 0.6, 5, dx, 14.3, dz, '#3e464e'), box(1.2, 0.8, 1.2, dx, 26.2, dz, '#3e464e'));
  // Crane: pedestal, cab and lattice boom.
  p.push(cyl(0.8, 0.9, 3, -9, 15.5, -7, Y, 8), box(1.8, 1.4, 2.2, -9, 17.6, -7, Y));
  { const b = new THREE.BoxGeometry(0.5, 0.5, 14).toNonIndexed(); b.translate(0, 0, -7); b.rotateX(0.45); b.rotateY(0.6); b.translate(-9, 17.8, -7); p.push(colored(b, Y)); }
  // Flare boom off one corner with a hot tip, and a helideck cantilevered off the other.
  { const b = new THREE.BoxGeometry(0.6, 0.6, 14).toNonIndexed(); b.translate(0, 0, 7); b.rotateX(-0.5); b.rotateY(Math.PI / 4); b.translate(10, 13.8, 10); p.push(colored(b, W), ball(0.7, 18.7, 20.5, 18.7, '#ffb347'));  }
  p.push(cyl(5, 5, 0.4, -7, 18.4, -2.5, '#2f353d', 20), cyl(3.6, 3.6, 0.05, -7, 18.62, -2.5, Y, 20), cyl(3.2, 3.2, 0.06, -7, 18.63, -2.5, '#2f353d', 20));
  p.push(box(0.5, 0.05, 3.4, -7.8, 18.68, -2.5, '#e8ecef'), box(0.5, 0.05, 3.4, -6.2, 18.68, -2.5, '#e8ecef'), box(1.6, 0.05, 0.5, -7, 18.68, -2.5, '#e8ecef'));
  for (const x of [-4, 0]) p.push(box(2.4, 1, 1.1, x, 11.8, 12.3, '#e0672a')); // lifeboats
  return merge(p);
}
/** Channel buoy: float, cage and light. */
function buoy(): Part { return merge([cyl(0.7, 0.9, 1, 0, 0.3, 0, '#c8352f', 10), cyl(0.12, 0.3, 1.6, 0, 1.6, 0, '#c8352f', 6), cyl(0.2, 0.2, 0.3, 0, 2.5, 0, '#fff1c2', 6)]); }
/** Seeded 3D value noise (deterministic, so the kit is identical on every mount). */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ Math.imul(seed, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x: number, y: number, z: number, seed: number) => vnoise(x, y, z, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, z * 4.3, seed + 13) * 0.12;
/**
 * Push each vertex out from `centre` by fbm noise (same position → same offset, so faces stay joined). `flat` clamps
 * the base to y = 0 so rocks sit on the ground.
 */
function displace(g: Part, amp: number, freq: number, seed: number, centre = new THREE.Vector3(), flat = true): Part {
  const pos = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); d.copy(v).sub(centre); const len = d.length() || 1;
    const n = fbm(v.x * freq + 11, v.y * freq + 5, v.z * freq + 3, seed) - 0.5;
    v.addScaledVector(d.divideScalar(len), n * amp * 2);
    if (flat) v.y = Math.max(0, v.y);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
/** Sandstone strata by height: alternating warm bands of uneven thickness (vertex colours; the shader adds fine detail). */
const STRATA = ['#b86a4b', '#9c4f3b', '#d39a6a', '#7d3c35', '#c98a5e', '#a65a43', '#e0b083'];
function strataColours(g: Part, top: number, seed: number, palette = STRATA): Part {
  const pos = g.getAttribute('position'), n = pos.count, a = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i), warp = (vnoise(pos.getX(i) * 0.15, 0, pos.getZ(i) * 0.15, seed) - 0.5) * 1.6;
    const band = Math.floor((y / Math.max(0.01, top)) * 6 + warp + vnoise(0, y * 0.9, 0, seed + 3) * 0.8);
    c.set(palette[((band % palette.length) + palette.length) % palette.length]).multiplyScalar(0.92 + 0.16 * vnoise(pos.getX(i) * 0.6, y * 0.6, pos.getZ(i) * 0.6, seed + 9));
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const finish = (g: Part) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.computeVertexNormals(); return g; };
/** Boulder / rock formation, ~1 unit across and tall (instances scale it): a lumpy, fractured, flat-based mass. */
function boulder(seed: number, squash: number, detail: number): Part {
  const g = new THREE.IcosahedronGeometry(0.62, detail); g.scale(1, squash, 1); g.translate(0, 0.32 * squash, 0);
  displace(g, 0.28, 1.9, seed); return finish(strataColours(g, 0.9 * squash, seed));
}
/** Hoodoo spire, ~1 across × 4 tall: stacked, pinched drums with a darker, wider cap rock. */
function spire(): Part {
  const parts: Part[] = []; let y = 0;
  for (const [r0, r1, h] of [[0.55, 0.42, 1.2], [0.44, 0.3, 1.0], [0.34, 0.26, 0.9], [0.27, 0.2, 0.6]]) {
    const c = new THREE.CylinderGeometry(r1, r0, h, 9, 3).toNonIndexed(); c.translate(0, y + h / 2, 0); parts.push(c); y += h;
  }
  const cap = new THREE.CylinderGeometry(0.38, 0.3, 0.35, 9, 1).toNonIndexed(); cap.translate(0, y + 0.15, 0); parts.push(cap);
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }))!; parts.forEach(p => p.dispose());
  displace(g, 0.12, 2.4, 21, new THREE.Vector3(0, 0, 0)); strataColours(g, 4, 21);
  // Cap rock: harder and darker than the column it protects.
  const pos = g.getAttribute('position'), col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > y - 0.05) col.setXYZ(i, col.getX(i) * 0.62, col.getY(i) * 0.55, col.getZ(i) * 0.58);
  return finish(g);
}
/** Stepped mesa, ~2 across × 1 tall: talus apron, three sheer ledged layers on an irregular footprint, a flat top. */
function mesa(): Part {
  const parts: Part[] = [], layer = (r: number, y0: number, h: number, seed: number) => {
    const shape = new THREE.Shape(), N = 14;
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2, rr = r * (0.78 + 0.34 * vnoise(Math.cos(a) * 2 + 4, Math.sin(a) * 2 + 4, seed, 3)); const px = Math.cos(a) * rr, pz = Math.sin(a) * rr * 0.8; if (i) shape.lineTo(px, pz); else shape.moveTo(px, pz); }
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 2 }).toNonIndexed(); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); parts.push(g);
  };
  const talus = new THREE.CylinderGeometry(0.95, 1.25, 0.25, 16, 1).toNonIndexed(); talus.translate(0, 0.12, 0); parts.push(talus);
  layer(1.0, 0.2, 0.32, 1); layer(0.9, 0.52, 0.28, 2); layer(0.8, 0.8, 0.22, 3);
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }))!; parts.forEach(p => p.dispose());
  displace(g, 0.05, 3.2, 33, new THREE.Vector3(0, 0.5, 0)); return finish(strataColours(g, 1.0, 33));
}
/**
 * Crag: a fractured block of cliff, 1×1×1 (walls are rows of these at varied sizes). Hard layers stand out as ledges,
 * soft ones recess, the top is a broken skyline, and the whole block is lumpy.
 */
function crag(): Part {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 8, 4).toNonIndexed(); g.translate(0, 0.5, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ledge = 1 + (vnoise(0, Math.floor(y * 7.99) * 1.7, 0, 51) - 0.5) * 0.22, taper = 1 - y * 0.14;
    x *= ledge * taper; z *= ledge * taper;
    if (y > 0.99) y += (fbm(x * 3 + 2, 0, z * 3 + 2, 52) - 0.45) * 0.45; // broken skyline
    pos.setXYZ(i, x, y, z);
  }
  displace(g, 0.24, 2.8, 47, new THREE.Vector3(0, 0.5, 0)); return finish(strataColours(g, 1, 47));
}
/** Desert scrub: a low, dusty clump (~1 across). */
function scrub(): Part {
  const parts: Part[] = [];
  for (const [x, z, r, c] of [[0, 0, 0.42, '#6d7240'], [0.3, 0.15, 0.3, '#857a45'], [-0.28, -0.1, 0.32, '#5b6438'], [0.05, -0.3, 0.26, '#7a7c4a']] as const) {
    const b = new THREE.IcosahedronGeometry(r, 0).toNonIndexed(); b.scale(1, 0.55, 1); b.translate(x, r * 0.4, z); parts.push(colored(b, c));
  }
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }))!; parts.forEach(p => p.dispose());
  displace(g, 0.08, 5, 61); return finish(g);
}
/** V-shaped wake: a foam fan widening and fading behind its source (additive white via vertex colours). */
function wake(): Part {
  const g = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [], N = 10;
  for (let i = 0; i < N; i++) {
    const z0 = i / N, z1 = (i + 1) / N, w0 = 0.15 + z0 * 0.85, w1 = 0.15 + z1 * 0.85, a0 = (1 - z0) * 0.9, a1 = (1 - z1) * 0.9;
    for (const s of [-1, 1]) { // two arms of the V, each a band
      const q = (x: number, z: number) => [s * x, 0, z * 2];
      const v = [q(w0 - 0.12, z0), q(w0, z0), q(w1, z1), q(w0 - 0.12, z0), q(w1, z1), q(w1 - 0.18, z1)];
      const c = [a0 * 0.5, a0, a1, a0 * 0.5, a1, a1 * 0.5];
      v.forEach((pt, k) => { pos.push(...pt); col.push(c[k], c[k], c[k]); });
    }
    // turbulent centre trail
    const v = [[-0.25 * w0, 0, z0 * 2], [0.25 * w0, 0, z0 * 2], [0.25 * w1, 0, z1 * 2], [-0.25 * w0, 0, z0 * 2], [0.25 * w1, 0, z1 * 2], [-0.25 * w1, 0, z1 * 2]];
    v.forEach((pt, k) => { pos.push(...pt); const a = (k === 2 || k >= 4 ? a1 : a0) * 0.7; col.push(a, a, a); });
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
/** Radial heightfields repeat the centre vertex once per spoke: give those copies one shared (averaged) normal. */
function smoothPole(g: Part, spokes: number): Part {
  const n = g.getAttribute('normal') as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let j = 0; j < spokes; j++) v.x += n.getX(j), v.y += n.getY(j), v.z += n.getZ(j);
  v.normalize(); for (let j = 0; j < spokes; j++) n.setXYZ(j, v.x, v.y, v.z);
  return g;
}
/**
 * Island hill (radius 1, height 1): a smooth radial heightfield of two or three jungle-clad summits with ridges running
 * down to the shore, bumpy canopy (dark crowns and lighter clearings), rocky outcrops on steep ground and a sand rim.
 */
function islandHill(): Part {
  const NA = 72, NR = 20, seed = 71, pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
  const peaks = [[0.12, -0.1, 1, 0.3], [-0.38, 0.25, 0.72, 0.22], [0.35, 0.4, 0.55, 0.18]];
  const canopy = [new THREE.Color('#25562a'), new THREE.Color('#2f6b30'), new THREE.Color('#3f7d3a'), new THREE.Color('#58904a')], rock = new THREE.Color('#6a6256'), sand = new THREE.Color('#d6bf8e');
  const H = (x: number, z: number) => {
    const r = Math.hypot(x, z); let h = 0;
    for (const [px, pz, ph, pw] of peaks) { const d2 = (x - px) ** 2 + (z - pz) ** 2; h = Math.max(h, ph * Math.exp(-d2 / (2 * pw * pw)) ); }
    h = Math.max(h, 0.35 * (1 - r * r)) * Math.min(1, (1 - r) * 6);
    const a = Math.atan2(z, x); h *= 1 - 0.12 * Math.max(0, Math.sin(a * 7 + fbm(x * 2, 0, z * 2, seed) * 4)) * Math.min(1, Math.max(0, r - 0.3) * 3); // ridges and valleys, faded out near the middle
    return Math.max(0, h + (fbm(x * 5 + 3, 0, z * 5 + 3, seed + 1) - 0.5) * 0.08 * (1 - r));
  };
  for (let i = 0; i <= NR; i++) {
    const r = i / NR;
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, wob = 1 + (vnoise(Math.cos(a) * 1.5 + 2, Math.sin(a) * 1.5 + 2, 1, seed) - 0.5) * 0.18 * r, x = Math.cos(a) * r * wob, z = Math.sin(a) * r * wob, h = H(Math.cos(a) * r, Math.sin(a) * r);
      pos.push(x, h, z);
      const steep = (Math.abs(H(Math.cos(a) * r + 0.02, Math.sin(a) * r) - h) + Math.abs(H(Math.cos(a) * r, Math.sin(a) * r + 0.02) - h)) / 0.02;
      const blot = vnoise(x * 14, h * 6, z * 14, seed + 2);
      c.copy(canopy[Math.min(3, Math.floor(blot * 3.2 + vnoise(x * 4, 0, z * 4, seed + 3) * 0.9))]).lerp(rock, Math.max(0, Math.min(0.6, (steep - 2.2) * 0.6)));
      if (r > 0.86) c.lerp(sand, Math.min(1, (r - 0.86) * 9));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * NA + j, b = i * NA + (j + 1) % NA, d = (i + 1) * NA + j, e = (i + 1) * NA + (j + 1) % NA; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return smoothPole(g, NA);
}
/** Smallest signed angle a − b. */
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/**
 * Stratovolcano (radius 1, height 1), a smooth-shaded radial heightfield: a concave cone with radial gullies and spurs,
 * a parasitic cone, an uneven crater rim breached on one side and a sunken crater. `lava`: dark scoria and oxidised
 * red ash, a molten crater lake and two flows spilling down from the breach (marked in the `glow` attribute for the
 * magma shader). Otherwise an ocean island: jungle skirts climbing the gullies, bare scoria near the top.
 */
function stratoCone(seed: number, lava: boolean): Part {
  const NA = 120, NR = 34, rc = 0.17, breach = vnoise(seed * 0.37, 1, 2, seed) * Math.PI * 2, spur = breach + 2.2;
  const flows = [breach, breach + 0.55 + vnoise(seed, 3, 1, seed) * 0.4, breach - 0.7], flowLen = [0.95, 0.7, 0.5];
  const flowAt = (k: number, t: number) => flows[k] + 0.22 * Math.sin(t * 5.5 + seed + k * 2) * t; // flows meander as they descend
  const pos: number[] = [], col: number[] = [], glow: number[] = [], idx: number[] = [], c = new THREE.Color();
  const P = lava
    ? { base: new THREE.Color('#2e2826'), dust: new THREE.Color('#5a524c'), top: new THREE.Color('#5b2f24'), gully: new THREE.Color('#1b1716'), crater: new THREE.Color('#2a1612'), melt: new THREE.Color('#ff7a1e') }
    : { base: new THREE.Color('#4d4640'), dust: new THREE.Color('#6d655a'), top: new THREE.Color('#3b3432'), gully: new THREE.Color('#2f2a28'), crater: new THREE.Color('#2a2220'), melt: new THREE.Color('#3b3432') };
  const jungle = [new THREE.Color('#2f6a33'), new THREE.Color('#3f7d3a'), new THREE.Color('#4f8a3e')], sand = new THREE.Color('#d2b98a');
  for (let i = 0; i <= NR; i++) {
    // Rings: dense around the rim; s < 0.2 is the crater, then the flank out to the foot.
    const s = i / NR, r = s < 0.2 ? rc * Math.sqrt(s / 0.2) : rc + (1 - rc) * Math.pow((s - 0.2) / 0.8, 1.15);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), t = Math.max(0, (r - rc) / (1 - rc));
      const notch = Math.exp(-Math.pow(angDiff(a, breach) / 0.32, 2));
      const rim = 1 + (fbm(ca * 2 + 5, sa * 2 + 5, seed, seed) - 0.5) * 0.12 - notch * 0.16;
      let h: number;
      if (r <= rc) { const u = r / rc; h = rim - (lava ? 0.17 : 0.2) * (1 - u * u * u); }
      else {
        h = rim * Math.pow(1 - t, 1.55);
        // Gullies: narrow radial channels between broad spurs, deepest mid-slope, warped so they wander.
        const warp = (fbm(ca * 1.7 + 9, t * 2.5, sa * 1.7 + 9, seed + 1) - 0.5) * 3.2;
        const g = 1 - Math.min(1, Math.abs(Math.sin(a * 9 + warp + t * 1.5)) / 0.4);
        h -= g * g * 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - notch * 0.5);
        // A parasitic cone on one shoulder and lumpy ground everywhere.
        const pd = Math.hypot(angDiff(a, spur) * 0.55, t - 0.55); h += 0.1 * Math.exp(-pd * pd / 0.006);
        h += (fbm(ca * r * 6, sa * r * 6, t * 3, seed + 2) - 0.5) * 0.07 * (1 - t * 0.6);
        // Flow channels sit slightly proud (levees) where molten rock runs down.
        if (lava) for (let k = 0; k < 3; k++) h += 0.014 * Math.exp(-Math.pow(angDiff(a, flowAt(k, t)) / 0.06, 2)) * (t < flowLen[k] ? 1 : 0);
        h = Math.max(0, h);
      }
      const wob = 1 + (vnoise(ca * 1.6 + 3, sa * 1.6 + 3, 7, seed) - 0.5) * 0.16 * t; // irregular footprint
      pos.push(ca * r * wob, h, sa * r * wob);
      // Colour: base rock, oxidised top, dusty gentle slopes, dark gullies, crater, and lava / jungle.
      const n = vnoise(ca * r * 9, h * 9, sa * r * 9, seed + 4), gw = 1 - Math.min(1, Math.abs(Math.sin(a * 9 + (fbm(ca * 1.7 + 9, t * 2.5, sa * 1.7 + 9, seed + 1) - 0.5) * 3.2 + t * 1.5)) / 0.4);
      c.copy(P.base).lerp(P.top, Math.max(0, 1 - t * 2.6) * (0.6 + 0.4 * n)).lerp(P.dust, Math.max(0, t - 0.6) * 0.7 * n).lerp(P.gully, gw * gw * 0.75);
      let gl = 0;
      if (r <= rc) {
        const u = r / rc; c.copy(P.crater);
        if (lava && u < 0.78) { gl = 1 - Math.max(0, (u - 0.6) / 0.18); c.lerp(P.melt, gl); }
      } else if (lava) {
        for (let k = 0; k < 3; k++) {
          // Each flow widens downhill and ends in a cooling lobe; braided by noise so its edges are ragged.
          const len = flowLen[k], w = (0.05 + 0.09 * t) * (0.75 + 0.5 * vnoise(t * 14, k, a * 3, seed + 8)), d = Math.abs(angDiff(a, flowAt(k, t)));
          if (t < len && d < w) { const f = Math.min(1, (1 - d / w) * 1.6) * (1 - Math.max(0, (t - len + 0.25) / 0.25) * 0.8); gl = Math.max(gl, f); }
        }
        c.lerp(P.melt, gl);
      } else {
        // Vegetation climbs higher in the moist gullies; a sandy beach at the foot.
        const line = 0.42 - gw * 0.18 + (n - 0.5) * 0.12;
        if (t > line) c.lerp(jungle[Math.floor(vnoise(ca * r * 4, 0, sa * r * 4, seed + 6) * 2.99)], Math.min(1, (t - line) * 6));
        if (t > 0.93) c.lerp(sand, Math.min(1, (t - 0.93) * 16));
      }
      col.push(c.r, c.g, c.b); glow.push(gl);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, d = (i + 1) * NA + j, e = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1)); g.computeVertexNormals(); return smoothPole(g, NA);
}
/** Island volcano (radius 1, height 1) for the ocean. */
const volcano = () => stratoCone(81, false);
/** Lava-field ash cone (radius 1, height 1): molten crater lake and flows. */
const ashCone = () => stratoCone(83, true);
/** Zero `glow` for lava-field rock that has no molten parts (every lava pool shares the magma material). */
const noGlow = (g: Part): Part => { g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1)); return g; };
/** Basalt, scoria and oxidised ash for the lava field's rock (same strata machinery, volcanic palette). */
const ASH = new THREE.Color('#5e5853');
const BASALT = ['#3a3532', '#2c2827', '#47403b', '#332b28', '#4a3a33', '#2f2a29', '#55473e'];
function basaltBoulder(seed: number, squash: number, detail: number): Part {
  const g = new THREE.IcosahedronGeometry(0.62, detail); g.scale(1, squash, 1); g.translate(0, 0.32 * squash, 0);
  displace(g, 0.24, 2.4, seed); return noGlow(finish(strataColours(g, 0.9 * squash, seed, BASALT)));
}
/** Volcanic cliff block (1×1×1): the crag recipe in basalt with a dark, glassy (obsidian) seam or two. */
function basaltCrag(): Part {
  const g = crag(); strataColours(g, 1, 57, BASALT);
  const pos = g.getAttribute('position'), col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (Math.abs(Math.sin(pos.getY(i) * 9.5 + 1.3)) < 0.12) col.setXYZ(i, col.getX(i) * 0.55, col.getY(i) * 0.55, col.getZ(i) * 0.6);
  return noGlow(g);
}
/**
 * Columnar basalt (~2 across × 1 tall): a cluster of hexagonal columns of stepped heights (the tallest near the
 * middle), each top tilted a little and dusted with ash; a scree skirt of broken columns at the foot.
 */
function basaltColumns(): Part {
  const parts: Part[] = [], r = (k: number) => vnoise(k * 1.37, k * 0.71, 3.3, 101), cc = new THREE.Color();
  const hexAt = (x: number, z: number, rad: number, h: number, k: number, lie = 0) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.04, h, 6, 1).toNonIndexed(); g.deleteAttribute('uv');
    if (lie) { g.rotateZ(lie); g.translate(x, rad * 0.9, z); } else { g.rotateY(r(k) * 0.4); g.translate(x, h / 2, z); }
    // Tilt the cap: lift the top ring's verts by a seeded plane.
    const pos = g.getAttribute('position') as THREE.BufferAttribute, tx = (r(k + 9) - 0.5) * 0.25, tz = (r(k + 11) - 0.5) * 0.25;
    if (!lie) for (let i = 0; i < pos.count; i++) if (pos.getY(i) > h - 0.001) pos.setY(i, pos.getY(i) + (pos.getX(i) - x) * tx + (pos.getZ(i) - z) * tz);
    const n = pos.count, a = new Float32Array(n * 3), shade = 0.6 + r(k + 3) * 0.7;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i), top = !lie && y > h - 0.2;
      cc.set(BASALT[Math.floor(r(k + 5) * BASALT.length) % BASALT.length]).multiplyScalar(shade * (0.85 + 0.25 * vnoise(pos.getX(i) * 5, y * 5, pos.getZ(i) * 5, 103)));
      if (top) cc.lerp(ASH, 0.3 * r(k + 7)); else cc.multiplyScalar(0.8 + 0.2 * Math.min(1, y / Math.max(0.1, h))); // darker toward the foot
      a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  let k = 0; const R = 0.17, dx = R * 1.73;
  for (let q = -3; q <= 3; q++) for (let p = -3; p <= 3; p++) {
    const x = (p + q * 0.5) * dx, z = q * R * 1.5, d = Math.hypot(x, z * 1.25);
    if (d > 0.95 || r(k + 40) < 0.12) { k++; continue; }
    const h = Math.max(0.12, (1 - d * 0.85) * (0.75 + 0.35 * r(k)) - (r(k + 21) < 0.2 ? 0.25 : 0));
    hexAt(x, z, R * 0.97, h, k++);
  }
  for (let j = 0; j < 6; j++) { const a = r(200 + j) * 6.28, d = 1.0 + r(220 + j) * 0.25; hexAt(Math.cos(a) * d, Math.sin(a) * d, R * 0.8, 0.35 + r(240 + j) * 0.3, 300 + j, 1.4 + r(260 + j) * 0.3); }
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); g.computeVertexNormals(); return noGlow(g);
}
/**
 * Research station (~34 × 22, base at y = 0): a cleared pad, two modules raised on stilts with window bands, geodesic
 * radomes, fuel tanks on saddles, crates, and a braced lattice mast (top at y ≈ 18) with a dish. `polar`: red and
 * yellow modules on snow with a wind turbine; otherwise a dusty canyon outpost with solar arrays.
 */
function station(polar: boolean): Part {
  const pad = polar ? '#c9d5dd' : '#8a6a52', m1 = polar ? '#c4452f' : '#b7ada0', m2 = polar ? '#d9a83a' : '#7d6b57', roof = polar ? '#8c949b' : '#6c645c';
  const dome = polar ? '#e7edf1' : '#d6cfc3', steel = '#596470', glassC = '#24323e';
  const p: Part[] = [];
  const slab = new THREE.CylinderGeometry(1, 1.06, 0.3, 18, 1).toNonIndexed(); slab.scale(17, 1, 11); slab.translate(1, 0.15, 0); p.push(colored(slab, pad));
  const module = (w: number, d: number, x: number, z: number, color: string, ry = 0) => {
    const legs: Part[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) legs.push(box(0.25, 1.4, 0.25, x + sx * (w / 2 - 0.5) * Math.cos(ry) + sz * (d / 2 - 0.4) * Math.sin(ry), 1, z - sx * (w / 2 - 0.5) * Math.sin(ry) + sz * (d / 2 - 0.4) * Math.cos(ry), steel));
    return [...legs, box(w, 2.8, d, x, 3.1, z, color, ry), box(w + 0.2, 0.3, d + 0.2, x, 4.65, z, roof, ry), box(w * 0.9, 0.55, d + 0.06, x, 3.5, z, glassC, ry),
      box(w * 0.92, 0.12, d + 0.1, x, 1.75, z, steel, ry)];
  };
  p.push(...module(13, 4.6, -3, -3, m1), ...module(9, 4, 6.5, 3.2, m2), box(3, 2.2, 2.4, 2.2, 2.9, -0.2, '#3e464e')); // link corridor
  for (const [x, z, r] of [[-11, 5, 2.6], [-5.5, 6.5, 1.8]] as const) {
    const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed(); g.translate(x, 1.4 + r * 0.55, z); p.push(colored(g, dome), cyl(r * 0.8, r * 0.85, 1.6, x, 0.9, z, steel, 10));
  }
  for (const x of [8.4, 10.6]) { const t = new THREE.CylinderGeometry(0.9, 0.9, 5.2, 12).toNonIndexed(); t.rotateX(Math.PI / 2); t.translate(x, 1.5, -6.5); p.push(colored(t, polar ? '#9aa2a8' : '#a9542e')); for (const z of [-8.3, -4.7]) p.push(box(1.6, 0.7, 0.3, x, 0.6, z, steel)); }
  for (const [x, z, c] of [[-1, 8.2, '#5d7a52'], [0.4, 8.6, '#7a6a48'], [-0.2, 7.4, '#5d7a52']] as const) p.push(box(1.2, 1, 1.2, x, 0.8, z, c));
  // Lattice mast: four tapering legs, cross braces every 3, a dish and a beacon housing at the top.
  const mx = 14, mz = 2, legAt = (y: number) => 1.1 * (1 - y / 22);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const g = new THREE.CylinderGeometry(0.08, 0.12, 18, 4).toNonIndexed(); g.rotateZ(-sx * 0.055); g.rotateX(sz * 0.055); g.translate(mx + sx * 0.6, 9.3, mz + sz * 0.6); p.push(colored(g, polar ? '#d64a35' : '#c9c2b4')); }
  for (let y = 2; y < 18; y += 3) { const w = legAt(y) * 1.4; p.push(box(w, 0.1, 0.1, mx, y, mz - legAt(y) * 0.7, steel), box(w, 0.1, 0.1, mx, y, mz + legAt(y) * 0.7, steel), box(0.1, 0.1, w, mx - legAt(y) * 0.7, y, mz, steel), box(0.1, 0.1, w, mx + legAt(y) * 0.7, y, mz, steel)); }
  { const d = new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3).toNonIndexed(); d.rotateZ(Math.PI / 2 + 0.3); d.translate(mx - 0.6, 13, mz); p.push(colored(d, '#dfe4e8')); }
  p.push(box(0.6, 0.6, 0.6, mx, 18.4, mz, steel));
  if (polar) { // wind turbine
    p.push(cyl(0.12, 0.2, 9, -14, 4.5, -5, '#e7edf1', 6), box(0.5, 0.5, 1.2, -14, 9.1, -5, '#e7edf1'));
    for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(0.25, 3.4, 0.08).toNonIndexed(); b.translate(0, 1.7, 0); b.rotateZ(k * Math.PI * 2 / 3 + 0.3); b.translate(-14, 9.1, -5.65); p.push(colored(b, '#e7edf1')); }
  } else { // solar arrays
    for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(5, 0.12, 2.2).toNonIndexed(); b.rotateX(-0.5); b.translate(-12, 1.3, -6 + k * 3.2); p.push(colored(b, '#22344f'), box(0.15, 1, 0.15, -12, 0.6, -6 + k * 3.2, steel)); }
  }
  return merge(p);
}
/** Triangle soup → coloured part (per-vertex colours given as [r, g, b] per vertex). */
function soup(pos: number[], col: number[]): Part {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
/**
 * Coconut palm (~5 tall): a smoothly curving, tapering trunk with growth rings and a swollen base, a crown of arched,
 * drooping fronds with sawtooth leaflets (both faces), dead fronds hanging below, and a coconut cluster.
 */
function palm(): Part {
  const p: Part[] = [], top = 4.7, tx = 0.96, ring = new THREE.Color(), cA = new THREE.Color('#7a5c3c'), cB = new THREE.Color('#5e4630');
  const at = (u: number) => new THREE.Vector3(tx * u * u, top * u, 0.08 * Math.sin(u * 3));
  { // trunk: rings of 8, tangent-aligned
    const N = 14, S = 8, pos: number[] = [], col: number[] = [], rings: THREE.Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, c = at(u), t = at(Math.min(1, u + 0.01)).sub(at(Math.max(0, u - 0.01))).normalize(), side = new THREE.Vector3(0, 0, 1).cross(t).normalize(), up = t.clone().cross(side);
      const rad = 0.13 + 0.06 * (1 - u) + 0.1 * Math.max(0, 1 - u * 8) + (i % 2 ? 0 : 0.012), rr: THREE.Vector3[] = [];
      for (let j = 0; j < S; j++) { const a = (j / S) * Math.PI * 2; rr.push(c.clone().addScaledVector(side, Math.cos(a) * rad).addScaledVector(up, Math.sin(a) * rad)); }
      rings.push(rr);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % S], c2 = rings[i + 1][j], d = rings[i + 1][(j + 1) % S];
      ring.copy(i % 2 ? cA : cB).multiplyScalar(0.9 + 0.2 * ((j * 7 + i * 3) % 5) / 5);
      for (const v of [a, c2, b, b, c2, d]) { pos.push(v.x, v.y, v.z); col.push(ring.r, ring.g, ring.b); }
    }
    p.push(soup(pos, col));
  }
  // Fronds: arched spines, leaflets alternating long/short for a feathered edge, darker at the base, both faces.
  const pos: number[] = [], col: number[] = [], dark = new THREE.Color('#2f6b2e'), light = new THREE.Color('#6aa84a'), dead = new THREE.Color('#9a7f4a'), c = new THREE.Color();
  const frond = (yaw: number, lift: number, L: number, droop: number, base: THREE.Color, tip: THREE.Color) => {
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), side = new THREE.Vector3(-dir.z, 0, dir.x), M = 9;
    const spine = (s: number) => new THREE.Vector3(tx, top, 0).addScaledVector(dir, s * L).add(new THREE.Vector3(0, lift * s - droop * s * s, 0));
    for (let i = 0; i < M; i++) {
      const s0 = i / M, s1 = (i + 1) / M, p0 = spine(s0), p1 = spine(s1), w = (k: number) => 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.05 + 0.08)) * (i % 2 ? 1 : 0.7);
      for (const sd of [-1, 1]) {
        const e0 = p0.clone().addScaledVector(side, sd * w(s0) * 0.35).add(new THREE.Vector3(0, -0.12 * w(s0), 0)), e1 = p1.clone().addScaledVector(side, sd * w(s1)).add(new THREE.Vector3(0, -0.25 * w(s1), 0));
        c.copy(base).lerp(tip, s0);
        const tri = sd > 0 ? [p0, e1, p1, p0, e0, e1] : [p0, p1, e1, p0, e1, e0];
        for (const v of tri) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
        for (const v of [...tri].reverse()) { pos.push(v.x, v.y - 0.01, v.z); col.push(c.r * 0.7, c.g * 0.7, c.b * 0.7); }
      }
    }
  };
  for (let k = 0; k < 9; k++) frond((k / 9) * Math.PI * 2 + (k % 2) * 0.2, 0.9 + (k % 3) * 0.25, 2.3 + (k % 2) * 0.4, 1.5 + (k % 3) * 0.35, dark, light);
  for (let k = 0; k < 3; k++) frond(k * 2.1 + 0.6, -0.4, 1.4, 1.2, dead, dead);
  frond(0.3, 2.2, 0.9, 0.6, light, light); frond(3.4, 2.4, 0.8, 0.5, light, light); // new spear leaves
  p.push(soup(pos, col));
  p.push(ball(0.13, tx + 0.15, top - 0.18, 0.1, '#5b4127'), ball(0.13, tx - 0.1, top - 0.2, -0.12, '#6b4d2c'), ball(0.12, tx + 0.02, top - 0.24, 0.16, '#4f3a22'));
  const g = mergeGeometries(p.map(q => { if (q.getAttribute('uv')) q.deleteAttribute('uv'); if (q.getAttribute('normal')) q.deleteAttribute('normal'); return q; }))!; p.forEach(q => q.dispose()); g.computeVertexNormals(); return g;
}
/** Stilted beach hut (~3 across): plank walls on a deck with a ladder, window and door openings, a layered thatch roof. */
function hut(): Part {
  const p: Part[] = [], PL = ['#b58b5e', '#a57d52', '#c09668'], post = '#6b4f35';
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3], [0, -1.3], [0, 1.3]]) p.push(box(0.16, 0.9, 0.16, x, 0.45, z, post));
  p.push(box(3.2, 0.12, 3.4, 0, 0.92, 0.1, '#8a6a48'));
  for (let i = 0; i < 6; i++) p.push(box(3.2, 0.02, 0.5, 0, 0.99, -1.45 + i * 0.58, i % 2 ? '#7d5f40' : '#94724e')); // deck boards
  for (let i = 0; i < 4; i++) p.push(box(0.5, 0.07, 0.12, 0, 0.2 + i * 0.22, 2.0, post)); // ladder rungs
  p.push(box(0.08, 1.0, 0.1, -0.28, 0.45, 2.0, post), box(0.08, 1.0, 0.1, 0.28, 0.45, 2.0, post));
  // Walls: vertical planks in three tones.
  for (let i = 0; i < 6; i++) { const u = -1.0 + i * 0.4; for (const [x, z, ry] of [[u, -1.1, 0], [u, 1.1, 0], [-1.1, u, Math.PI / 2], [1.1, u, Math.PI / 2]] as const) p.push(box(0.4, 1.5, 0.1, x, 1.75, z, PL[(i + Math.round(x * 3 + z * 5)) % 3], ry)); }
  p.push(box(0.6, 1.0, 0.04, 0.2, 1.5, 1.17, '#2a1e15'), box(0.5, 0.4, 0.04, -0.6, 1.9, 1.17, '#2a1e15'), box(0.04, 0.4, 0.5, 1.17, 1.9, 0, '#2a1e15'), box(0.04, 0.4, 0.5, -1.17, 1.9, 0.2, '#2a1e15'));
  // Thatch: three stacked hip layers, each a little lighter, and a ridge cap.
  for (const [r, h, y, c] of [[2.3, 1.0, 2.9, '#a8864c'], [1.85, 0.9, 3.3, '#bf9c5c'], [1.25, 0.8, 3.7, '#cfae6c']] as const) {
    const roof = new THREE.ConeGeometry(r, h, 4, 2).toNonIndexed(); roof.rotateY(Math.PI / 4); roof.translate(0, y, 0); p.push(colored(roof, c));
  }
  p.push(cyl(0.05, 0.18, 0.4, 0, 4.15, 0, '#7d6238', 6));
  return merge(p);
}
/** Container ship (~62 long): dark hull, stacked containers in mixed colours, bridge and funnel aft. */
function containerShip(): Part {
  const p: Part[] = [hull(62, 10.5, 4, '#2c3e55', 0.16, 0.9), box(9.6, 0.4, 56, 0, 4.1, 0, '#8a3b30')];
  const CC = ['#b8372f', '#2f6db0', '#d6a43a', '#3f8a52', '#d8dde2', '#7b4ea0', '#c4622d'];
  let k = 0;
  for (let z = -22; z <= 14; z += 4.2) for (let x = -3.6; x <= 3.7; x += 2.4) { const h = 1 + ((k * 7) % 4); for (let y = 0; y < h; y++) p.push(box(2.3, 1.2, 4, x, 4.9 + y * 1.25, z, CC[(k * 3 + y * 5) % CC.length])); k++; }
  p.push(box(9.6, 6, 5, 0, 7.3, 22, '#c9d0d6'), box(10.4, 0.5, 2, 0, 10.2, 20.5, WIN), box(11.4, 0.3, 1.2, 0, 10.6, 21, '#c9d0d6'), cyl(0.9, 1, 3, 0, 11.5, 25, '#2b2f34', 10));
  return merge(p);
}
/** Tanker (~66 long): red-bottomed hull, green deck with pipe runs and a manifold, white bridge aft. */
function tanker(): Part {
  const p: Part[] = [hull(66, 11, 4.4, '#7a2a26', 0.14, 0.92), box(10.2, 0.4, 60, 0, 4.5, 0, '#3f5a46')];
  for (const x of [-1.2, 0, 1.2]) p.push(cyl(0.22, 0.22, 46, x, 5.1, -4, '#c8ccd0', 6, Math.PI / 2));
  p.push(box(7, 1, 2, 0, 5.3, -2, '#c8a23a'), box(1.4, 3, 1.4, 3, 6, 6, '#c8ccd0'), box(0.25, 0.25, 9, 3, 7.3, 2, '#c8ccd0', 0.4));
  p.push(box(10, 7, 6, 0, 8.4, 25, '#c9d0d6'), box(10.6, 0.5, 2, 0, 11.6, 22.6, WIN), cyl(1, 1.1, 3.5, 0, 12.8, 27, '#2b2f34', 10));
  return merge(p);
}
/** Sailboat (~9 long): white hull, mast, a heeled mainsail and jib (both sides drawn). */
function sailboat(): Part {
  const sail = (pts: number[][], color: string) => { const g = new THREE.BufferGeometry(); const v = pts.flat(); g.setAttribute('position', new THREE.Float32BufferAttribute([...v, ...[pts[0], pts[2], pts[1]].flat()], 3)); return colored(g, color); };
  const p: Part[] = [hull(9, 2.6, 1.2, '#eef1f3', 0.32), box(2, 0.1, 5, 0, 1.25, 0.6, '#9a7a55'), cyl(0.06, 0.08, 9, 0.35, 5.6, -0.6, '#cfd3d6', 5)];
  p.push(sail([[0.38, 1.6, -0.5], [0.38, 9.6, -0.6], [1.6, 1.8, 3.2]], '#f4f1e8'), sail([[0.36, 1.6, -0.9], [0.36, 8.6, -0.8], [0.9, 1.4, -4.2]], '#e6e2d6'));
  const g = mergeGeometries(p.map(q => { if (q.getAttribute('uv')) q.deleteAttribute('uv'); if (q.getAttribute('normal')) q.deleteAttribute('normal'); return q; }))!; p.forEach(q => q.dispose()); g.computeVertexNormals(); return g;
}
/**
 * Iceberg / ice block (1×1×1 at scale 1): fractured faceted cliffs and a flat-ish top. Wind-packed snow on top, pale blue walls with vertical meltwater striations and darker crevasses, glacial
 * blue deepening toward the turquoise waterline.
 */
function berg(): Part {
  const g: Part = new THREE.BoxGeometry(1, 1, 1, 5, 6, 5).toNonIndexed(); g.deleteAttribute('uv'); g.translate(0, 0.5, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = (1 - y * 0.2) * (1 + (vnoise(0, Math.floor(y * 4.99) * 2.3, 0, 93) - 0.5) * 0.25); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); if (y > 0.99) pos.setY(i, y + (vnoise(pos.getX(i) * 3, 0, pos.getZ(i) * 3, 91) - 0.5) * 0.25); }
  displace(g, 0.3, 2.2, 92, new THREE.Vector3(0, 0.5, 0)); g.deleteAttribute('normal'); g.computeVertexNormals();
  const nrm = g.getAttribute('normal'), n = pos.count, a = new Float32Array(n * 3), c = new THREE.Color();
  const snow = new THREE.Color('#d3dee6'), ice = new THREE.Color('#8fbfd3'), deep = new THREE.Color('#4d93b5'), sea = new THREE.Color('#3fb3c0'), crev = new THREE.Color('#2f6f93');
  for (let i = 0; i < n; i++) {
    const up = nrm.getY(i), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ang = Math.atan2(z, x);
    const streak = vnoise(ang * 9, y * 0.6, 0, 94), cr = Math.max(0, 1 - Math.abs(Math.sin(ang * 5 + vnoise(0, y * 3, ang, 95) * 2)) / 0.18);
    c.copy(deep).lerp(ice, Math.min(1, y * 1.3)).multiplyScalar(0.9 + 0.2 * streak).lerp(crev, cr * 0.5 * (1 - Math.max(0, up)));
    if (y < 0.12) c.lerp(sea, 1 - y / 0.12);
    c.lerp(snow, Math.max(0, Math.min(1, (up - 0.3) * 2.2)));
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/** Polar icebreaker (~38 long): red reinforced hull, white superstructure forward, crane and helideck aft. */
function icebreaker(): Part {
  const p: Part[] = [hull(38, 8, 3.4, '#b8322b', 0.3, 0.9), box(7, 0.35, 34, 0, 3.45, 0, '#5b6670')];
  p.push(box(6, 4, 9, 0, 5.6, -6, '#cdd4d9'), box(5, 2.2, 6, 0, 8.7, -7, '#cdd4d9'), box(5.2, 0.5, 1.4, 0, 9.3, -9.6, WIN), box(6.2, 0.5, 1.6, 0, 6.6, -10.5, WIN));
  p.push(cyl(0.8, 0.9, 2.6, 0, 8.9, -2.4, '#c8352f', 10), cyl(0.1, 0.12, 5, 0, 12.6, -7, DARK, 6), box(2.6, 0.1, 0.4, 0, 13.6, -7, DARK));
  p.push(cyl(3, 3, 0.2, 0, 3.75, 11, '#2f353d', 18), box(0.4, 0.05, 2, -0.6, 3.9, 11, '#c9d0d6'), box(0.4, 0.05, 2, 0.6, 3.9, 11, '#c9d0d6'), box(1.2, 0.05, 0.4, 0, 3.9, 11, '#c9d0d6'));
  p.push(box(0.6, 5, 0.6, 2.6, 6, 4, '#d6a43a'), box(0.5, 0.5, 7, 2.6, 8.3, 1.2, '#d6a43a', 0.3));
  return merge(p);
}
/**
 * Carrier ski-jump: the bow's last 30 units curving up to a lit lip, following the deck's taper (half-width
 * 42·(tip/70)^0.55, matching the ground shader). Back edge at z = 0, tip at z = −30 (forward).
 */
function skiJump(): Part {
  const pos: number[] = [], col: number[] = [], N = 16, deck = new THREE.Color('#4a525a'), stripe = new THREE.Color('#c9a53a'), lip = new THREE.Color('#ffd27a'), wall = new THREE.Color('#30363d');
  const row = (i: number) => { const t = i / N, tip = 30 * (1 - t), hw = tip > 0 ? 42 * Math.pow(tip / 70, 0.55) : 0.4, h = 3.2 * t * t; return { z: -30 * t, hw: Math.max(0.4, hw), h }; };
  const push = (p: number[], c: THREE.Color) => { pos.push(...p); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < N; i++) {
    const a = row(i), b = row(i + 1), c = i >= N - 1 ? lip : i % 3 === 1 ? stripe : deck;
    for (const [p, q, r] of [[[-a.hw, a.h, a.z], [a.hw, a.h, a.z], [b.hw, b.h, b.z]], [[-a.hw, a.h, a.z], [b.hw, b.h, b.z], [-b.hw, b.h, b.z]]]) { push(p, c); push(q, c); push(r, c); }
    for (const sd of [-1, 1]) { // side walls down to the deck
      const w = [[sd * a.hw, 0, a.z], [sd * a.hw, a.h, a.z], [sd * b.hw, b.h, b.z], [sd * a.hw, 0, a.z], [sd * b.hw, b.h, b.z], [sd * b.hw, 0, b.z]];
      for (const p of sd > 0 ? w : [w[0], w[2], w[1], w[3], w[5], w[4]]) push(p, wall);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
let cache: Record<string, Part> | null = null;
export function kit() {
  cache ??= { tree: tree(), carrier: carrierShip(), battleship: battleship(), destroyer: destroyer(), riverBoat: riverBoat(), barge: barge(), jet: parkedJet(), tractor: tractor(), island: island(), wake: wake(),
    boulderA: boulder(5, 0.85, 1), boulderB: boulder(17, 1.35, 2), spire: spire(), mesa: mesa(), crag: crag(), scrub: scrub(),
    gunSponson: gunSponson(), radarSponson: radarSponson(), raftRack: raftRack(), catwalk: catwalk(), edgeElevator: edgeElevator(), fuelStation: fuelStation(),
    islandStealth: islandStealth(), islandTall: islandTall(), helicopter: helicopter(), fuelTruck: fuelTruck(), waterTank: waterTank(), acUnits: acUnits(), helipad: helipad(), lighthouse: lighthouse(), oilRig: oilRig(), buoy: buoy(),
    islandHill: islandHill(), volcano: volcano(), ashCone: ashCone(), basaltA: basaltBoulder(5, 0.8, 2), basaltB: basaltBoulder(29, 1.3, 2), basaltCrag: basaltCrag(), columns: basaltColumns(), station: station(true), outpost: station(false), palm: palm(), hut: hut(), containerShip: containerShip(), tanker: tanker(), sailboat: sailboat(), berg: berg(), icebreaker: icebreaker(), skiJump: skiJump() };
  return cache as Record<'tree' | 'carrier' | 'battleship' | 'destroyer' | 'riverBoat' | 'barge' | 'jet' | 'tractor' | 'island' | 'wake' | 'boulderA' | 'boulderB' | 'spire' | 'mesa' | 'crag' | 'scrub'
    | 'gunSponson' | 'radarSponson' | 'raftRack' | 'catwalk' | 'edgeElevator' | 'fuelStation' | 'islandStealth' | 'islandTall' | 'helicopter' | 'fuelTruck' | 'waterTank' | 'acUnits' | 'helipad' | 'lighthouse' | 'oilRig' | 'buoy'
    | 'islandHill' | 'volcano' | 'ashCone' | 'basaltA' | 'basaltB' | 'basaltCrag' | 'columns' | 'station' | 'outpost' | 'palm' | 'hut' | 'containerShip' | 'tanker' | 'sailboat' | 'berg' | 'icebreaker' | 'skiJump', Part>;
}
export const isKitGeometry = (g: THREE.BufferGeometry) => !!cache && Object.values(cache).includes(g);

/** Soft cloud-bank texture (drawn once): overlapping noisy puffs with a sunlit top-left and shaded base. */
let cloudTex: THREE.CanvasTexture | null = null;
export function cloudTexture(): THREE.Texture | null {
  if (cloudTex) return cloudTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70, x = 128 + Math.cos(a) * d * 1.3, y = 128 + Math.sin(a) * d * 0.8, rad = 22 + r() * 34;
    const shade = 0.72 + 0.28 * Math.max(0, 1 - (y - 70) / 140) * (0.6 + 0.4 * (1 - (x - 40) / 200));
    const grad = g.createRadialGradient(x - rad * 0.25, y - rad * 0.3, rad * 0.1, x, y, rad);
    const v = Math.round(255 * shade), b = Math.round(255 * Math.min(1, shade + 0.06));
    grad.addColorStop(0, `rgba(${v},${v},${b},0.55)`); grad.addColorStop(1, `rgba(${v},${v},${b},0)`);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  cloudTex = new THREE.CanvasTexture(c); cloudTex.colorSpace = THREE.SRGBColorSpace; return cloudTex;
}
