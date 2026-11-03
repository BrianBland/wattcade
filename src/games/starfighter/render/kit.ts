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
let cache: Record<string, Part> | null = null;
export function kit() {
  cache ??= { tree: tree(), carrier: carrierShip(), battleship: battleship(), destroyer: destroyer(), riverBoat: riverBoat(), barge: barge(), jet: parkedJet(), tractor: tractor(), island: island(), wake: wake(),
    boulderA: boulder(5, 0.85, 1), boulderB: boulder(17, 1.35, 2), spire: spire(), mesa: mesa(), crag: crag(), scrub: scrub(),
    gunSponson: gunSponson(), radarSponson: radarSponson(), raftRack: raftRack(), catwalk: catwalk(), edgeElevator: edgeElevator(), fuelStation: fuelStation(),
    islandStealth: islandStealth(), islandTall: islandTall(), helicopter: helicopter(), fuelTruck: fuelTruck(), waterTank: waterTank(), acUnits: acUnits(), helipad: helipad() };
  return cache as Record<'tree' | 'carrier' | 'battleship' | 'destroyer' | 'riverBoat' | 'barge' | 'jet' | 'tractor' | 'island' | 'wake' | 'boulderA' | 'boulderB' | 'spire' | 'mesa' | 'crag' | 'scrub'
    | 'gunSponson' | 'radarSponson' | 'raftRack' | 'catwalk' | 'edgeElevator' | 'fuelStation' | 'islandStealth' | 'islandTall' | 'helicopter' | 'fuelTruck' | 'waterTank' | 'acUnits' | 'helipad', Part>;
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
