import * as T from 'three';

type Ring = [height: number, width: number, depth: number, forward?: number];
type Point = [number, number, number];

// Build one coloured, indexed skin per prop, so an entire pose or tree can be instanced.
class Skin {
  private vertices: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private faces: number[] = [];

  vertex(x: number, y: number, z: number, c: T.Color, u = 0.039, v = 0.96) {
    this.uvs.push(u, v);
    this.vertices.push(x, y, z);
    this.colors.push(c.r, c.g, c.b);
    return this.vertices.length / 3 - 1;
  }
  triangle(a: number, b: number, c: number) {
    this.faces.push(a, b, c);
  }
  loft(base: Point, rings: Ring[], n: number, tint: string, rotation = new T.Quaternion()) {
    const start = this.vertices.length / 3,
      c = new T.Color(tint),
      v = new T.Vector3();
    for (const [y, w, h, z = 0] of rings) {
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) * Math.PI * 2) / n;
        v.set(w * Math.cos(a), y, h * Math.sin(a) + z).applyQuaternion(rotation);
        this.vertex(base[0] + v.x, base[1] + v.y, base[2] + v.z, c);
      }
    }
    for (let j = 0; j < rings.length - 1; j++)
      for (let i = 0; i < n; i++) {
        const a = start + j * n + i,
          b = start + j * n + ((i + 1) % n);
        this.faces.push(a, a + n, b + n, a, b + n, b);
      }
    for (let i = 1; i < n - 1; i++) {
      const top = start + (rings.length - 1) * n;
      this.faces.push(start, start + i, start + i + 1, top, top + i + 1, top + i);
    }
  }
  limb(a: Point, b: Point, r: number, end: number, color: string, n = 5) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = d.length(),
      q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    this.loft(
      a,
      [
        [0, r, r],
        [length, end, end],
      ],
      n,
      color,
      q,
    );
  }
  finish() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.vertices, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.faces);
    g.computeVertexNormals();
    return g;
  }
}

// Front is +Z. Separate knees, shirt fronts, cap bills and hands survive an
// oblique view from the home turn. Fans lean over the rail, sit or raise a fist.
export function spectator(style: number, distant = false) {
  const s = new Skin(),
    coat = ['#ae5135', '#52716a', '#b48844', '#485d70', '#8e6952', '#667454'][style];
  const face = ['#b07c54', '#85543b', '#ce9a73', '#a66a46', '#ce916c', '#945e42'][style];
  const accent = ['#e4bf79', '#b45338', '#384f4e', '#e3b97b', '#80a39c', '#c6ab76'][style];
  const seated = style % 3 === 1,
    hip = seated ? 0.59 : 0.93;
  if (distant) {
    s.loft(
      [0, 0, 0],
      [
        [0.04, 0.19, 0.14],
        [hip, 0.21, 0.14],
      ],
      5,
      '#434c49',
    );
    s.loft(
      [0, hip - 0.06, 0],
      [
        [0, 0.23, 0.16],
        [0.36, 0.31, 0.18],
        [0.51, 0.17, 0.12],
      ],
      5,
      coat,
    );
    s.loft(
      [0, hip + 0.44, 0.04],
      [
        [0, 0.12, 0.12],
        [0.12, 0.165, 0.145],
        [0.31, 0.14, 0.14],
      ],
      5,
      face,
    );
    s.loft(
      [0, hip + 0.73, 0.04],
      [
        [0, 0.17, 0.16],
        [0.11, 0.11, 0.09],
      ],
      5,
      accent,
    );
    if (style % 3 === 0) s.limb([0.22, hip + 0.35, 0], [0.4, hip + 0.93, 0.1], 0.088, 0.063, coat, 4);
    return s.finish();
  }
  for (const side of [-1, 1]) {
    const knee: Point = [side * 0.15, seated ? 0.53 : 0.48, seated ? 0.32 : 0.035];
    const ankle: Point = [side * 0.16, 0.13, seated ? 0.33 : 0.07 * side];
    s.limb([side * 0.12, hip, 0], knee, 0.12, 0.096, '#414b4b');
    s.limb(knee, ankle, 0.095, 0.073, '#465050');
    s.loft(
      [ankle[0], 0.018, ankle[2] + 0.055],
      [
        [0, 0.094, 0.17],
        [0.105, 0.097, 0.17],
        [0.16, 0.078, 0.085, -0.045],
      ],
      6,
      '#413730',
    );
  }
  s.loft(
    [0, hip - 0.06, 0],
    [
      [0, 0.23, 0.16],
      [0.15, 0.275, 0.195],
      [0.43, 0.285, 0.18, 0.024],
      [0.52, 0.184, 0.13, 0.045],
    ],
    8,
    coat,
  );
  s.loft(
    [0, hip + 0.39, 0.035],
    [
      [0, 0.19, 0.141],
      [0.13, 0.16, 0.13],
    ],
    7,
    accent,
  );
  s.loft(
    [0, hip + 0.49, 0.059],
    [
      [0, 0.106, 0.11],
      [0.107, 0.162, 0.151],
      [0.253, 0.168, 0.157],
      [0.314, 0.125, 0.116],
    ],
    8,
    face,
  );
  s.loft(
    [0, hip + 0.64, 0.202],
    [
      [0, 0.042, 0.026],
      [0.072, 0.029, 0.056],
    ],
    5,
    face,
  );
  s.loft(
    [0, hip + 0.71, 0.05],
    [
      [0, 0.179, 0.155],
      [0.063, 0.173, 0.161],
      [0.146, 0.091, 0.084],
    ],
    8,
    style % 2 ? accent : '#4c423b',
  );
  if (style % 2)
    s.loft(
      [0, hip + 0.717, 0.176],
      [
        [0, 0.15, 0.13],
        [0.026, 0.147, 0.13],
      ],
      7,
      accent,
    );
  for (const side of [-1, 1]) {
    const wave = (style === 0 || style === 3 || style === 5) && side === (style === 3 ? -1 : 1);
    const elbow: Point = [side * (wave ? 0.42 : 0.31), hip + (wave ? 0.59 : 0.19), wave ? 0.07 : 0.15];
    const wrist: Point = [side * (wave ? 0.39 : 0.23), hip + (wave ? 0.87 : 0.18), wave ? 0.14 : 0.33];
    s.limb([side * 0.223, hip + 0.41, 0.04], elbow, 0.107, 0.082, coat);
    s.limb(elbow, wrist, 0.085, 0.067, coat);
    s.loft(
      wrist,
      [
        [0, 0.067, 0.068],
        [0.091, 0.077, 0.068],
        [0.126, 0.048, 0.054],
      ],
      5,
      face,
    );
  }
  return s.finish();
}

// A tire has a hollow bead, flattened sidewalls, a rounded shoulder and pairs
// of staggered tread grooves. Dust settles in the grooves and on the upper sidewall.
export function barrierTire(chalk: boolean, distant = false) {
  const s = new Skin(),
    n = distant ? 16 : 48;
  const profile = [
    [0.36, 0.035],
    [0.39, 0.016],
    [0.72, 0.035],
    [0.82, 0.09],
    [0.865, 0.17],
    [0.865, 0.355],
    [0.82, 0.425],
    [0.7, 0.465],
    [0.47, 0.472],
    [0.385, 0.455],
    [0.35, 0.415],
    [0.35, 0.09],
  ];
  const colors = profile.map(
    (_, j) => new T.Color(j < 3 || j > 8 ? '#302e2b' : j > 5 ? '#57534a' : '#393b38'),
  );
  const c = new T.Color();
  for (const [j, [r, y]] of profile.entries())
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n,
        groove = j >= 3 && j <= 6 && (i + (j >= 5 ? 1 : 0)) % 4 === 0;
      c.copy(colors[j]).multiplyScalar(groove ? 0.55 : 0.9 + 0.1 * Math.sin(i * 2.3));
      if (chalk && j >= 5 && j <= 8 && ((i / n) * 2) % 1 < 0.28 && i % 13 !== 0) c.set('#bba783');
      s.vertex((r - (groove ? 0.029 : 0)) * Math.cos(a), y, (r - (groove ? 0.029 : 0)) * Math.sin(a), c);
    }
  for (let j = 0; j < profile.length; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i,
        l = j * n + ((i + 1) % n),
        m = ((j + 1) % profile.length) * n;
      s.triangle(k, m + i, m + ((i + 1) % n));
      s.triangle(k, m + ((i + 1) % n), l);
    }
  return s.finish();
}

// Each radial bough has a folded ridge and its own spray of needles. Vary
// the whorl, droop and spacing so gaps open through the crown as riders turn.
export function spruce(style: number, distant: boolean) {
  const s = new Skin(),
    tiers = distant ? 7 : 12,
    branches = distant ? 5 : 8;
  s.loft(
    [0, 0, 0],
    [
      [0, 0.018, 0.017],
      [0.53, 0.01, 0.01],
      [1, 0.002, 0.002],
    ],
    7,
    '#8a7358',
  );
  const tint = new T.Color();
  for (let j = 0; j < tiers; j++) {
    const h = 0.12 + (j * 0.88) / tiers;
    for (let k = 0; k < branches; k++) {
      const n = Math.sin(k * 17.7 + j * 19.1 + style * 3.2);
      const a = (k * Math.PI * 2) / branches + j * 2.4 + n * 0.24;
      const length = (1 - h) * (0.37 + 0.07 * n) * (style === 1 ? 0.86 : 1);
      const ca = Math.cos(a),
        sa = Math.sin(a),
        spread = length * (distant ? 0.79 : 0.65);
      const baseY = h + 0.093 + 0.019 * n,
        midY = h - 0.013 + 0.019 * n;
      tint.set(j < 2 ? '#9ea289' : j > tiers * 0.72 ? '#cadaaf' : '#b2c4a3').multiplyScalar(0.91 + 0.14 * n);
      const pt = (r: number, w: number, y: number, u: number, v: number) =>
        s.vertex(ca * r - sa * w, y, sa * r + ca * w, tint, u, v);
      const base = pt(0, 0, baseY, 0.5, 0.93),
        left = pt(length * 0.46, spread, midY - 0.032, 0, 0.52);
      const ridge = pt(length * 0.48, 0, midY + 0.023, 0.5, 0.52),
        right = pt(length * 0.47, -spread, midY - 0.037, 1, 0.52);
      const tipL = pt(length, -spread * 0.3, midY + 0.012 + 0.023 * n, 0.78, 0.018);
      const tipR = pt(length, spread * 0.3, midY + 0.008 + 0.021 * n, 0.22, 0.018);
      s.triangle(base, left, ridge);
      s.triangle(base, ridge, right);
      s.triangle(ridge, left, tipR);
      s.triangle(ridge, tipR, tipL);
      s.triangle(ridge, tipL, right);
    }
  }
  return s.finish();
}
