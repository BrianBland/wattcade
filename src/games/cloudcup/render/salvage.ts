import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { courses, type Course } from '../sim/track';

// UV tiles in salvage-enamel.webp, in reading order.
const [
  steel,
  red,
  bone,
  ochre,
  glass,
  tyre,
  vents,
  blade,
  hazard,
  number,
  yardSign,
  light,
  teal,
  livery,
  roofing,
  rust,
] = Array.from({ length: 16 }, (_, i) => i);
type Point = [number, number, number];
const tau = Math.PI * 2;

/** Bake local parts and their atlas UVs into one reusable, opaque mesh per prop. */
class Model {
  parts: T.BufferGeometry[] = [];
  frame = new T.Matrix4();
  part(geo: T.BufferGeometry, tile: number, pos: Point = [0, 0, 0], rot: Point = [0, 0, 0]) {
    const uv = geo.getAttribute('uv'),
      col = tile % 4,
      row = Math.floor(tile / 4);
    for (let i = 0; i < uv.count; i++) {
      // An inset of four texels also protects the smaller mip levels.
      uv.setXY(i, (col + 0.016 + 0.968 * uv.getX(i)) / 4, 1 - (row + 1 - 0.016 - 0.968 * uv.getY(i)) / 4);
    }
    const local = new T.Matrix4().makeRotationFromEuler(new T.Euler(...rot, 'YXZ')).setPosition(...pos);
    geo.applyMatrix4(local.premultiply(this.frame));
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    this.parts.push(flat);
  }
  box(tile: number, pos: Point, size: Point, rot: Point = [0, 0, 0]) {
    this.part(new T.BoxGeometry(...size), tile, pos, rot);
  }
  rod(tile: number, a: Point, b: Point, width: number, depth = width) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const g = new T.BoxGeometry(width, delta.length(), depth);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    const mid = start.lerp(end, 0.5);
    this.part(g, tile, [mid.x, mid.y, mid.z]);
  }
  quad(tile: number, a: Point, b: Point, c: Point, d: Point, u0 = 0, u1 = 1) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    this.part(g, tile);
  }
  drum(tile: number, pos: Point, rFront: number, rBack: number, length: number, segments = 24, open = false) {
    this.part(new T.CylinderGeometry(rFront, rBack, length, segments, 1, open), tile, pos, [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  finish() {
    const geometry = mergeGeometries(this.parts)!;
    this.parts.forEach((g) => g.dispose());
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function turbine() {
  const m = new Model();
  // Positive Z is the intake. Its dark throat is recessed behind two rolled lips.
  const y = 2.72;
  m.frame.makeRotationZ(-0.12);
  m.drum(vents, [0, y, -1.9], 1.66, 1.26, 5.0);
  m.drum(tyre, [0, y, 1.17], 2.01, 1.92, 1.0, 32, true);
  m.drum(tyre, [0, y, 1.86], 2.1, 1.98, 0.73, 32, true);
  m.drum(tyre, [0, y, 1.1], 1.95, 1.95, 0.12, 32);
  for (let i = 0; i < 15; i++) {
    const a = (tau * i) / 15;
    const polar = (r: number, angle: number, z: number): Point => [
      r * Math.cos(angle),
      y + r * Math.sin(angle),
      z,
    ];
    const radius = i === 8 ? 1.34 : 1.97;
    const root = polar(0.49, a, 1.67),
      ridge = polar(radius, a + 0.26, 1.66);
    m.quad(blade, root, polar(0.5, a + 0.17, 1.63), polar(radius, a + 0.48, 1.32), ridge);
    m.quad(steel, polar(0.47, a - 0.12, 1.54), root, ridge, polar(radius, a + 0.1, 1.51));
  }
  m.drum(rust, [0, y, 1.52], 0.6, 0.68, 0.5);
  m.drum(steel, [0, y, 1.75], 0.52, 0.62, 0.17);
  m.drum(red, [0, y, 1.91], 0.4, 0.52, 0.24);
  m.drum(bone, [0, y, 2.19], 0.09, 0.4, 0.34);

  // Individual cowling segments leave a ragged opening over the exposed compressor.
  const ring = (r: number, a: number, z: number): Point => [r * Math.cos(a), y + r * Math.sin(a), z];
  const stations = [
    [-4.45, 1.19],
    [-3.65, 1.64],
    [-1.35, 1.95],
    [0.68, 2.15],
    [2.25, 2.2],
  ];
  for (let i = 0; i < 24; i++) {
    const a = (tau * i) / 24,
      b = (tau * (i + 1)) / 24;
    for (let j = 0; j < stations.length - 1; j++) {
      if (j === 1 && (i < 4 || i > 20 || (i >= 9 && i <= 12))) continue;
      const [z, r] = stations[j],
        [z1, r1] = stations[j + 1];
      const color =
        j === 3 ? (i % 9 < 2 ? red : bone) : i === 4 || i === 5 || i === 17 ? ochre : i % 7 < 3 ? red : rust;
      m.quad(color, ring(r, a, z), ring(r, b, z), ring(r1, b, z1), ring(r1, a, z1));
    }
    m.quad(ochre, ring(2.2, a, 2.25), ring(2.2, b, 2.25), ring(2.08, b, 2.27), ring(2.08, a, 2.27));
  }
  // Rolled bright-metal lip and two external hoop clamps catch the grazing sun.
  for (const [z, r, wire] of [
    [2.24, 2.15, 0.1],
    [0.65, 2.16, 0.055],
    [-1.34, 1.96, 0.055],
  ]) {
    m.part(new T.TorusGeometry(r, wire, 6, 40), blade, [0, y, z]);
  }
  m.drum(steel, [0, y, -4.69], 1.24, 0.92, 0.56, 24, true);
  m.drum(tyre, [0, y, -4.99], 0.91, 0.88, 0.13, 24);
  for (let i = 0; i < 8; i++) {
    const a = (i * tau) / 8 + 0.12;
    m.rod(blade, ring(1.66, a, -3.7), ring(1.87, a, -1.56), 0.115);
  }
  for (const s of [-1, 1]) {
    const a = s === 1 ? -0.15 : Math.PI + 0.15;
    const point = (angle: number, z: number): Point => ring(2.18, angle, z);
    m.quad(number, point(a - 0.3, 0.77), point(a + 0.3, 0.77), point(a + 0.3, 1.85), point(a - 0.3, 1.85));
    m.rod(steel, [s * 1.82, y + 0.48, -2.84], [s * 2.05, y + 0.52, -1.13], 0.24);
    m.rod(blade, [s * 2.03, y + 0.52, -1.15], [s * 2.19, y + 0.54, 0.23], 0.12);
  }
  for (const z of [-4.45, -3.3, -2.85, -2.35, -1.86, -1.36])
    m.drum(steel, [0, y, z], z === -4.45 ? 1.23 : 1.7, z === -4.45 ? 1.23 : 1.7, 0.1, 24, true);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++)
      m.rod(
        k === 1 ? ochre : steel,
        [s * 1.61, y - 0.39 + k * 0.2, -3.8],
        [s * 1.96, y - 0.29 + k * 0.2, -0.6],
        0.12,
      );
    m.quad(
      red,
      [s * 0.49, y + 1.39, -1.45],
      [s * 0.57, y + 1.62, -3.93],
      [s * 1.14, y + 3.23, -4.62],
      [s * 0.89, y + 2.97, -3.84],
    );
    m.rod(steel, [s * 0.89, y + 2.97, -3.84], [s * 0.49, y + 1.39, -1.45], 0.12);
    m.box(hazard, [s * 1.75, 0.8, -0.3], [0.72, 1.26, 3.7], [0, 0, s * -0.32]);
  }
  m.frame.identity();
  m.box(rust, [0, 0.24, -0.45], [4.9, 0.48, 7.3]);
  footing(m, 3.2, 4.5);
  return m.finish();
}

function carHeap() {
  const m = new Model();
  // Loft the rocker panel, belt line and hood over varying widths along each wreck.
  function shell(paint: number, stripe: number) {
    const sections = [
      [-2.65, 0.8, 0.52],
      [-2.12, 1.1, 0.74],
      [-0.65, 1.17, 0.85],
      [1.34, 1.15, 0.78],
      [2.48, 0.92, 0.58],
    ];
    for (let j = 0; j < sections.length - 1; j++) {
      const [a, w, h] = sections[j],
        [b, v, k] = sections[j + 1];
      m.quad(j === sections.length - 2 ? number : paint, [-w, h, a], [w, h, a], [v, k, b], [-v, k, b]);
      for (const sign of [-1, 1]) {
        m.quad(
          stripe,
          [sign * w * 0.89, 0.29, a],
          [sign * v * 0.89, 0.29, b],
          [sign * v, k, b],
          [sign * w, h, a],
          (2.48 - a) / 5.13,
          (2.48 - b) / 5.13,
        );
      }
    }
    // Folded hood, raised light pods and sill pipes break the body silhouette.
    for (const sign of [-1, 1]) {
      m.quad(
        paint,
        [sign * 0.5, 0.69, 2.39],
        [sign * 0.9, 0.63, 2.39],
        [sign * 1.14, 0.92, 1.26],
        [sign * 0.61, 0.85, 1.16],
      );
      m.quad(
        vents,
        [sign * 0.51, 0.73, 2.18],
        [sign * 0.85, 0.71, 2.2],
        [sign * 0.91, 0.79, 1.89],
        [sign * 0.56, 0.8, 1.85],
      );
      m.rod(steel, [sign * 1.07, 0.26, -1.89], [sign * 1.16, 0.35, 0.75], 0.13);
      m.rod(rust, [sign * 0.86, 0.25, -2.59], [sign * 1.07, 0.26, -1.89], 0.12);
    }
    m.box(steel, [0, 0.43, -2.58], [1.72, 0.21, 0.21]);
    m.box(vents, [0, 0.56, 2.43], [1.76, 0.29, 0.11]);
    for (const sign of [-1, 1]) {
      m.box(bone, [sign * 0.75, 0.64, 2.45], [0.29, 0.12, 0.16]);
      m.box(red, [sign * 0.72, 0.63, -2.55], [0.34, 0.12, 0.16]);
      // Windshield and rear pillars hold a flattened roof above the window openings.
      m.quad(
        glass,
        [sign * 1.02, 0.82, -1.47],
        [sign * 1.06, 0.82, 0.92],
        [sign * 0.78, 1.46, 0.12],
        [sign * 0.76, 1.45, -0.83],
      );
      for (const [z, roofZ] of [
        [-1.49, -0.84],
        [-0.36, -0.42],
        [0.94, 0.14],
      ])
        m.rod(paint, [sign * 1.05, 0.8, z], [sign * 0.78, 1.45, roofZ], 0.085);
      for (const z of [-1.55, 1.49]) {
        const x = sign * 1.055;
        // Folded arch flanges catch the light above the tyres.
        for (let j = 0; j < 5; j++) {
          const a = (j * Math.PI) / 5,
            b = ((j + 1) * Math.PI) / 5;
          const lip = (rad: number, ang: number): Point => [
            x + sign * 0.17,
            0.41 + Math.sin(ang) * rad,
            z + Math.cos(ang) * rad,
          ];
          m.quad(paint, lip(0.52, a), lip(0.52, b), lip(0.64, b), lip(0.64, a));
        }
        m.part(new T.CylinderGeometry(0.48, 0.48, 0.31, 12), tyre, [x, 0.42, z], [0, 0, Math.PI / 2]);
        m.part(
          new T.CylinderGeometry(0.27, 0.27, 0.05, 10),
          steel,
          [x + sign * 0.17, 0.42, z],
          [0, 0, Math.PI / 2],
        );
      }
      // Five pressed spokes sit proud of the dark hub on each exposed wheel.
      for (const z of [-1.55, 1.49]) {
        for (let j = 0; j < 5; j++) {
          const a = (j * tau) / 5;
          m.rod(
            blade,
            [sign * 1.26, 0.42 + 0.06 * Math.sin(a), z + 0.06 * Math.cos(a)],
            [sign * 1.26, 0.42 + 0.25 * Math.sin(a + 0.2), z + 0.25 * Math.cos(a + 0.2)],
            0.058,
          );
        }
      }
      m.rod(steel, [sign * 0.68, 0.77, -1.98], [sign * 0.66, 1.07, -2.17], 0.09);
    }
    m.quad(glass, [-1.06, 0.8, 0.92], [1.06, 0.8, 0.92], [0.78, 1.46, 0.12], [-0.78, 1.46, 0.12]);
    m.quad(glass, [1.02, 0.81, -1.47], [-1.02, 0.81, -1.47], [-0.76, 1.45, -0.83], [0.76, 1.45, -0.83]);
    m.box(paint, [0, 1.46, -0.36], [1.61, 0.1, 1.05]);
    m.box(paint, [0, 1.1, -2.19], [2.19, 0.13, 0.43], [0.13, 0, 0]);
    m.box(vents, [0, 0.29, -0.05], [1.77, 0.21, 3.78]);
    m.box(vents, [0, 0.62, -2.54], [1.48, 0.25, 0.2]);
    for (const x of [-0.66, 0.66]) {
      m.rod(steel, [x, 0.31, -1.4], [x, 0.31, 1.29], 0.15);
      m.drum(steel, [x, 0.38, -2.63], 0.12, 0.15, 0.29, 8, true);
    }
  }
  const poses = [
    [-0.19, 0.22, 0, 0.12, -0.14, -0.05],
    [0.14, 1.28, -0.15, -0.1, 0.35, 0.16],
    [-0.18, 2.4, -0.2, -0.21, -0.28, -0.15],
  ];
  m.box(roofing, [0, 0, 0], [3.35, 0.34, 5.58]);
  for (const [i, [x, y, z, pitch, yaw, roll]] of poses.entries()) {
    m.frame.makeRotationFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ')).setPosition(x, y, z);
    m.frame.scale(new T.Vector3(1, i === 0 ? 0.81 : i === 1 ? 0.9 : 1, 1));
    shell([ochre, teal, red][i], livery);
  }
  m.frame.identity();
  for (const x of [-1.51, 1.47]) {
    m.rod(rust, [x, 0.17, 2.1], [x * 0.91, 2.88, 0.51], 0.16);
    m.rod(steel, [x, 0.16, -1.86], [x * 1.05, 1.88, -1.6], 0.12);
  }
  m.box(hazard, [1.43, 0.64, 2.1], [1.04, 1.27, 0.22], [-0.19, 0.21, -0.16]);
  footing(m, 2.5, 3.8);
  return m.finish();
}

function footing(m: Model, w: number, d: number) {
  // A bed of clinker over a battered retaining wall. Extend the pilings down
  // into the scrapyard below this elevated road.
  // Faceted spoil slopes away from the base. Its uneven skirt extends below
  // the elevated circuit, leaving no rectangular shelf under the wreckage.
  const rim = (i: number, band: number): Point => {
    const a = (tau * i) / 14,
      crag = 1 + 0.07 * Math.sin(3 * a) + 0.05 * Math.cos(5 * a);
    return [
      Math.cos(a) * w * crag * (0.86 + band * 0.08),
      [0.04, -1.2, -7][band] + 0.24 * Math.sin(a * 4),
      Math.sin(a) * d * crag * (0.86 + band * 0.08),
    ];
  };
  for (let i = 0; i < 14; i++) {
    for (let band = 0; band < 2; band++)
      m.quad(steel, rim(i, band + 1), rim(i + 1, band + 1), rim(i + 1, band), rim(i, band));
    m.quad(steel, [0, 0.01, 0], rim(i, 0), rim(i + 1, 0), [0, 0.01, 0]);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i * tau) / 14;
    const g = new T.IcosahedronGeometry(1, 0);
    g.scale(0.59 + (i % 3) * 0.19, 0.29 + (i % 5) * 0.09, 0.8);
    m.part(
      g,
      i % 4 === 0 ? steel : rust,
      [Math.sin(a) * w * 0.9, 0.09, Math.cos(a) * d * 0.87],
      [i * 0.76, i * 0.63, 0],
    );
  }
}
function tower() {
  const m = new Model();
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      m.rod(rust, [sx * 2.07, 0, sz * 1.76], [sx * 1.36, 6.0, sz * 1.22], 0.27, 0.33);
      m.box(roofing, [sx * 2.06, 0.37, sz * 1.76], [0.74, 0.74, 0.72]);
    }
  for (const s of [-1, 1]) {
    for (const base of [0, 2.75]) {
      const w = 2.03 - base * 0.11,
        d = 1.73 - base * 0.085;
      m.rod(steel, [-w, base + 0.19, s * d], [w - 0.31, base + 2.86, s * (d - 0.24)], 0.13);
      m.rod(rust, [w, base + 0.19, s * d], [-w + 0.31, base + 2.86, s * (d - 0.24)], 0.15);
      m.rod(steel, [s * w, base + 0.19, -d], [s * (w - 0.31), base + 2.86, d - 0.24], 0.13);
    }
  }
  m.box(steel, [0, 5.89, 0], [4.58, 0.3, 3.67]);
  m.box(roofing, [0, 6.39, 0], [3.96, 0.74, 2.72]);
  const sill = 6.7,
    eave = 8.28;
  // Splayed cab glazing with slim mullions. Each face has its own atlas UVs.
  const corners = (w: number, h: number, d: number): Point[] => [
    [-w, h, d],
    [w, h, d],
    [w, h, -d],
    [-w, h, -d],
  ];
  const bottom = corners(1.94, sill, 1.31),
    top = corners(2.2, eave, 1.54);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.quad(glass, bottom[i], bottom[j], top[j], top[i]);
    m.rod(red, bottom[i], top[i], 0.12);
    for (const t of [0.33, 0.67]) {
      const mix = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t];
      m.rod(steel, mix(bottom[i], bottom[j]), mix(top[i], top[j]), 0.076);
    }
  }
  m.box(ochre, [0, 8.38, 0], [4.91, 0.24, 3.56]);
  m.box(roofing, [0, 8.56, 0], [4.55, 0.14, 3.17]);
  m.box(teal, [1.94, 4.94, -0.2], [1.0, 0.17, 4.6]);
  // An exposed stair and handrail descend from the catwalk.
  for (let j = 0; j < 14; j++) {
    const t = j / 13;
    m.box(steel, [2.18, 0.55 + t * 4.34, 4.53 - t * 3.13], [0.93, 0.1, 0.36]);
  }
  for (const x of [1.72, 2.65]) {
    m.rod(rust, [x, 0.38, 4.71], [x, 4.84, 1.35], 0.14);
    m.rod(ochre, [x, 1.44, 4.66], [x, 5.93, 1.33], 0.08);
    for (let j = 0; j < 4; j++) {
      const t = j / 3;
      m.rod(steel, [x, 0.54 + t * 4.35, 4.55 - t * 3.2], [x, 1.43 + t * 4.35, 4.55 - t * 3.2], 0.06);
    }
  }
  for (const x of [1.48, 2.42]) {
    m.rod(ochre, [x, 5.03, -2.26], [x, 5.86, -2.26], 0.08);
    m.rod(ochre, [x, 5.86, -2.26], [x, 5.86, 1.37], 0.07);
  }
  for (const x of [1.38, 1.9]) m.rod(steel, [x, 4.97, -1.46], [x, 6.45, -1.46], 0.06);
  for (let y = 5.1; y < 6.4; y += 0.28) m.rod(ochre, [1.38, y, -1.46], [1.9, y, -1.46], 0.055);
  m.quad(yardSign, [-1.34, 3.49, 1.58], [1.34, 3.49, 1.58], [1.34, 5.62, 1.4], [-1.34, 5.62, 1.4]);
  m.rod(steel, [-1.35, 8.6, 0.96], [-1.52, 9.43, 1.03], 0.14);
  m.box(steel, [-1.28, 9.49, 1.11], [1.85, 0.91, 0.31], [0, 0, 0.04]);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      m.drum(light, [-1.85 + i * 0.57, 9.27 + j * 0.43, 1.3], 0.2, 0.22, 0.14, 10);
    }
  m.rod(steel, [1.19, 8.42, -0.8], [1.19, 11.27, -0.8], 0.085);
  const dish = new T.SphereGeometry(0.66, 12, 5, 0, tau, Math.PI * 0.66, Math.PI * 0.34);
  m.part(dish, bone, [1.16, 9.42, -0.76], [-1.1, 0, -0.31]);
  // Torn signal pennants with a kinked fabric plane give the tower a distinct side view.
  m.rod(steel, [-2.22, 7.71, -1.43], [-5.15, 6.46, -1.89], 0.044);
  for (let i = 0; i < 4; i++) {
    const x = -2.35 - i * 0.68,
      y = 7.63 - i * 0.29,
      z = -1.45 - i * 0.107;
    m.quad(
      i % 2 ? bone : red,
      [x, y, z],
      [x - 0.55, y - 0.24, z - 0.09],
      [x - 0.37, y - 0.69, z + 0.11],
      [x - 0.22, y - 0.44, z + 0.13],
    );
  }
  footing(m, 2.9, 3.15);
  return m.finish();
}

// Set-dress by section. A quiet shoulder before a landmark lets riders see
// the silhouette, then the flank, before the next structure enters the frame.
type Site = [at: number, side: number, scale: number, yaw: number];
const turbines: Site[] = [
  [74, -3.62, 1.52, 1.51],
  [181, 3.75, 1.5, -1.54],
  [278, -4.5, 1.2, 0.3],
  [424, 3.55, 1.4, -1.05],
  [566, -3.2, 1.45, 0.98],
  [716, 3.6, 1.54, -0.65],
  [891, -3.65, 1.22, 1.91],
  [1029, 3.24, 1.4, -0.94],
];
const towers: Site[] = [
  [110, 3.8, 1.09, -0.64],
  [203, -4.1, 1.2, 0.59],
  [378, -3.72, 1.12, 0.83],
  [599, 4.36, 1.25, -0.78],
  [744, -4.0, 1.16, 0.8],
  [951, 4.15, 1.21, -0.77],
];
const heaps: Site[] = [
  [23, 3.06, 1.23, -0.8],
  [64, 4.32, 1.04, -1.55],
  [137, -2.85, 1.37, 1.02],
  [163, -4.57, 1.08, 0.72],
  [211, 3.35, 1.35, -0.94],
  [321, 3.46, 1.27, -1.23],
  [357, -3.31, 1.26, 1.13],
  [460, 3.22, 1.43, -1.06],
  [494, -3.23, 1.19, 0.76],
  [545, 3.35, 1.33, -0.51],
  [592, -3.24, 1.27, 1.52],
  [638, -3.48, 1.47, 0.83],
  [666, 4.25, 1.12, -0.63],
  [769, -3.6, 1.3, 0.7],
  [854, 3.68, 1.51, -0.89],
  [996, -3.3, 1.24, 1.23],
];
export function buildSalvage(scene: T.Object3D, map: T.Texture, course: Course = courses[0]) {
  const { world } = course;
  const metal = new T.MeshStandardMaterial({ map, roughness: 0.83, metalness: 0.16, side: T.DoubleSide });
  for (const [name, geo, sites] of [
    ['turbine', turbine(), turbines],
    ['signal tower', tower(), towers],
    ['car heap', carHeap(), heaps],
  ] as const) {
    for (const [at, side, scale, yaw] of sites) {
      const p = world(at, side);
      const mesh = new T.Mesh(geo, metal);
      mesh.name = name;
      mesh.position.set(p.x, p.y - 1.9 * scale, p.z);
      mesh.rotation.y = -p.yaw + yaw;
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}
