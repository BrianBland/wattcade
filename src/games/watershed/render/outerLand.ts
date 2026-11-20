// The world beyond the playable valley: land that continues the valley walls into rolling hills and higher peaks
// upstream, a sea that runs to the horizon, a few distant forests, and a faint boundary fence that lights up as the
// player's focus (spring, cloud or salmon) nears the edge. Render-only; the sim grid stays the playable area.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, fbm, hash2, sample } from '../sim/terrain';
import { pineGeometry, broadleafGeometry, swayMaterial } from './models';
import { terrainMaterial } from './terrainView';
import { encodeH, heightTexture } from './sea';

const C = {
  seabed: new THREE.Color(0xd2bf8e), sand: new THREE.Color(0xe2cf98), meadow: new THREE.Color(0x93b552), grass: new THREE.Color(0x467f33),
  lush: new THREE.Color(0x35702d), dry: new THREE.Color(0xa9a35a), rock: new THREE.Color(0x7d756b), scree: new THREE.Color(0x9a9286), snow: new THREE.Color(0xf2f6fa),
};

/** Land colour by height, slope (0 flat … 1 vertical) and a macro noise value in about [−1, 1]. */
export function landColor(z: number, out: THREE.Color, slope = 0, mac = 0): THREE.Color {
  if (z < SEA) return out.copy(C.seabed).multiplyScalar(Math.max(0.45, 1 + z * 0.06));
  if (z < 1.2) return out.copy(C.sand).lerp(C.meadow, Math.max(0, (z - 0.7) / 0.5));
  out.copy(C.meadow).lerp(C.grass, Math.min(1, z / 10));
  if (mac < 0) out.lerp(C.lush, Math.min(1, -mac * 2)); else out.lerp(C.dry, Math.min(0.6, mac * 1.5));
  out.lerp(C.scree, Math.min(0.7, Math.max(0, (z - 36) / 14)));
  out.lerp(C.rock, Math.min(1, Math.max(0, (slope - 0.5) * 2.2, (z - 46) / 10)));
  const snowLine = 52 + mac * 6 + slope * 14;
  if (z > snowLine) out.lerp(C.snow, Math.min(1, (z - snowLine) / 4));
  return out;
}

/** Axis samples: dense (≈`fine`) over [a, b] around the valley, growing geometrically out to [lo, hi]. */
function axis(lo: number, a: number, b: number, hi: number, fine: number, inner: number): number[] {
  const out: number[] = [];
  for (let x = a, st = fine; x > lo; st *= 1.07) { x -= st; out.unshift(Math.max(lo, x)); }
  const n = Math.max(2, Math.round((b - a) / inner));
  for (let k = 0; k <= n; k++) out.push(a + ((b - a) * k) / n);
  for (let x = b, st = fine; x < hi; st *= 1.07) { x += st; out.push(Math.min(hi, x)); }
  return out;
}

export class OuterLand {
  readonly group = new THREE.Group();
  readonly fenceUniforms: Record<string, THREE.IUniform>;
  /** World height of the outer land at (X, Z) (inside the valley: just under the real terrain). */
  readonly heightAt: (X: number, Z: number) => number;
  /** Height texture over `rect` (see sea.ts encodeH), for shading the sea by depth. */
  readonly hTex: THREE.DataTexture;
  readonly rect: { x0: number; z0: number; w: number; d: number };

  constructor(s: WatershedSnapshot, wx: (j: number) => number, wz: (i: number) => number, time: { value: number } = { value: 0 }) {
    const { nx, ny, h0, coastY } = s;
    const X0 = wx(0) - 360, X1 = wx(ny - 1) + 520, Z0 = wz(0) - 380, Z1 = wz(nx - 1) + 380;
    const heightAt = this.heightAt = (X: number, Z: number) => {
      const gy = X + ny / 2, gx = Z + nx / 2;
      const cy = Math.min(ny - 1, Math.max(0, gy)), cx = Math.min(nx - 1, Math.max(0, gx));
      const hb = sample(h0, nx, ny, cx, cy);
      const d = Math.hypot(gx - cx, gy - cy);
      if (d === 0) return hb - 0.6;                                         // just under the real terrain (no seam cliffs)
      const k = Math.min(1, d / 50), kk = k * k * (3 - 2 * k);
      // rolling foothills, then ridged ranges that grow with distance (and much more so upstream, behind the spring)
      const roll = fbm(X * 0.016, Z * 0.016, 77) * 7 + fbm(X * 0.05, Z * 0.05, 78) * 2;
      const r1 = 1 - Math.abs(fbm(X * 0.011, Z * 0.011, 91)), r2 = 1 - Math.abs(fbm(X * 0.026, Z * 0.026, 92));
      const ridged = r1 * r1 * 0.75 + r2 * r2 * 0.35;
      const up = gy < 0 ? Math.min(1, -gy / 80) : 0;
      const range = Math.min(1, d / 160);
      const land = hb + kk * (roll + Math.min(14, d * 0.05) + ridged * (8 + 26 * range + 40 * up) + up * 22);
      const seaward = Math.min(1, Math.max(0, (gy - coastY) / 14));        // past the coast, the land slopes into the sea
      const sea = hb + kk * (-6 - Math.min(14, d * 0.05) - hb * 0.6);
      return land * (1 - seaward) + sea * seaward;
    };
    const xs = axis(X0, wx(0) - 2, wx(ny - 1) + 2, X1, 2.2, 6), zs = axis(Z0, wz(0) - 2, wz(nx - 1) + 2, Z1, 2.2, 6);
    const SX = xs.length, SZ = zs.length;
    const pos = new Float32Array(SX * SZ * 3), col = new Float32Array(SX * SZ * 3), c = new THREE.Color();
    for (let j = 0; j < SZ; j++) for (let i = 0; i < SX; i++) pos.set([xs[i], heightAt(xs[i], zs[j]), zs[j]], (j * SX + i) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let j = 0; j < SZ - 1; j++) for (let i = 0; i < SX - 1; i++) { const a = j * SX + i; idx.push(a, a + SX, a + 1, a + 1, a + SX, a + SX + 1); }
    g.setIndex(idx); g.computeVertexNormals();
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let v = 0; v < SX * SZ; v++) {
      const X = pos[v * 3], y = pos[v * 3 + 1], Z = pos[v * 3 + 2];
      landColor(y, c, 1 - Math.abs(nor.getY(v)), fbm(X * 0.02, Z * 0.02, 4242, 3));
      col.set([c.r, c.g, c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const land = new THREE.Mesh(g, terrainMaterial(undefined, time));
    land.receiveShadow = true;
    this.group.add(land);

    // the land under the sea, as a height texture for the sea shader
    const TW = 384, TD = 320;
    this.rect = { x0: X0, z0: Z0, w: X1 - X0, d: Z1 - Z0 };
    this.hTex = heightTexture(TW, TD);
    const HD = this.hTex.image.data as Uint8Array;
    for (let j = 0; j < TD; j++) for (let i = 0; i < TW; i++) HD[j * TW + i] = encodeH(heightAt(X0 + ((i + 0.5) / TW) * (X1 - X0), Z0 + ((j + 0.5) / TD) * (Z1 - Z0)));
    this.hTex.needsUpdate = true;

    // distant forests on the outer land
    const spots: Array<[number, number, number, number]> = [];
    // forests hug the valley (dense near the edge, thinning with distance) so the valley doesn't read as a cut-out
    const R = 140, ax = wx(0) - R, bx = wx(ny - 1) + R, az = wz(0) - R, bz = wz(nx - 1) + R;
    for (let n = 0; n < 14000 && spots.length < 4200; n++) {
      const X = ax + hash2(n, 1, 61) * (bx - ax), Z = az + hash2(n, 2, 61) * (bz - az);
      const dd = Math.max(Math.abs(Z) - nx / 2, Math.abs(X - (wx(0) + wx(ny - 1)) / 2) - ny / 2, 0);
      if (hash2(n, 4, 61) > Math.exp(-dd / 55)) continue;
      const gy = X + ny / 2, gx = Z + nx / 2;
      if (gx > -2 && gx < nx + 1 && gy > -2 && gy < ny + 1) continue;
      const y = heightAt(X, Z);
      if (y < 1.5 || y > 42) continue;
      const sl = Math.abs(heightAt(X + 2, Z) - heightAt(X - 2, Z)) + Math.abs(heightAt(X, Z + 2) - heightAt(X, Z - 2));
      if (sl > 3.2) continue;
      spots.push([X, y, Z, hash2(n, 3, 61)]);
    }
    const wind = { value: 0 };
    const kinds = [pineGeometry(), broadleafGeometry()].map((geo, k) => {
      const mine = spots.filter((p) => (p[3] < 0.6 ? 0 : 1) === k);
      const m = new THREE.InstancedMesh(geo, swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), wind, 0.04), Math.max(1, mine.length));
      const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      mine.forEach(([X, y, Z, r], n) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28); m.setMatrixAt(n, mat.compose(new THREE.Vector3(X, y - 0.1, Z), q, sc.setScalar(1.1 + r))); });
      m.count = mine.length; m.castShadow = false;
      return m;
    });
    this.group.add(...kinds);

    // boundary fence: four vertical grid walls around the playable area, faint far away, bright as the focus nears
    this.fenceUniforms = { uFocus: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xbfefff) } };
    const fenceMat = new THREE.ShaderMaterial({
      uniforms: this.fenceUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uFocus; uniform vec3 uColor; varying vec3 vW;
        float gridLine(float v, float s){ float f = abs(fract(v / s + 0.5) - 0.5) * s; return 1.0 - smoothstep(0.0, 0.18, f); }
        void main(){
          float along = vW.x + vW.z;   // each wall is constant in one of x/z, so this runs along the wall
          float line = max(gridLine(along, 4.0), gridLine(vW.y, 4.0));
          float near = 1.0 - smoothstep(6.0, 34.0, distance(vW.xz, uFocus.xz));
          float a = 0.5 * near * line;
          a *= 1.0 - smoothstep(14.0, 38.0, vW.y);
          a *= smoothstep(18.0, 55.0, distance(vW, cameraPosition));   // never a wall right in front of the camera
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const top = 40, bot = -6;
    const wall = (xa: number, za: number, xb: number, zb: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([xa, bot, za, xb, bot, zb, xa, top, za, xb, top, zb], 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      const m = new THREE.Mesh(geo, fenceMat); m.renderOrder = 5; m.frustumCulled = false; return m;
    };
    const xa = wx(0), xb = wx(ny - 1), za = wz(0), zb = wz(nx - 1);
    this.group.add(wall(xa, za, xb, za), wall(xa, zb, xb, zb), wall(xa, za, xa, zb), wall(xb, za, xb, zb));
  }

  setFocus(p: THREE.Vector3): void { (this.fenceUniforms.uFocus.value as THREE.Vector3).copy(p); }
}
