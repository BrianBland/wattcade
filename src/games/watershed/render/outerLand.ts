// The world beyond the playable valley: land that continues the valley walls into rolling hills and higher peaks
// upstream, a sea that runs to the horizon, a few distant forests, and a faint boundary fence that lights up as the
// player's focus (spring, cloud or salmon) nears the edge. Render-only; the sim grid stays the playable area.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, fbm, hash2, sample } from '../sim/terrain';
import { pineGeometry, broadleafGeometry, swayMaterial } from './models';
import { terrainMaterial } from './terrainView';

const C = {
  seabed: new THREE.Color(0xc9b68a), sand: new THREE.Color(0xe6d39c), meadow: new THREE.Color(0x8fb85a), grass: new THREE.Color(0x4f8a3c),
  rock: new THREE.Color(0x857a6c), snow: new THREE.Color(0xf4f7fa),
};

export function landColor(z: number, out: THREE.Color): THREE.Color {
  if (z < SEA) return out.copy(C.seabed).multiplyScalar(Math.max(0.5, 1 + z * 0.05));
  if (z < 1) return out.copy(C.sand);
  out.copy(C.meadow).lerp(C.grass, Math.min(1, z / 10));
  out.lerp(C.rock, Math.min(1, Math.max(0, (z - 20) / 10)));
  if (z > 34) out.lerp(C.snow, Math.min(1, (z - 34) / 6));
  return out;
}

export class OuterLand {
  readonly group = new THREE.Group();
  readonly fenceUniforms: Record<string, THREE.IUniform>;

  constructor(s: WatershedSnapshot, wx: (j: number) => number, wz: (i: number) => number) {
    const { nx, ny, h0, coastY } = s;
    const X0 = wx(0) - 320, X1 = wx(ny - 1) + 420, Z0 = wz(0) - 330, Z1 = wz(nx - 1) + 330;
    const SX = 150, SZ = 120;
    const pos = new Float32Array(SX * SZ * 3), col = new Float32Array(SX * SZ * 3), c = new THREE.Color();
    const heightAt = (X: number, Z: number) => {
      const gy = X + ny / 2, gx = Z + nx / 2;
      const cy = Math.min(ny - 1, Math.max(0, gy)), cx = Math.min(nx - 1, Math.max(0, gx));
      const hb = sample(h0, nx, ny, cx, cy);
      const d = Math.hypot(gx - cx, gy - cy);
      if (d === 0) return hb - 0.6;                                         // just under the real terrain (no seam cliffs)
      const k = Math.min(1, d / 45), kk = k * k * (3 - 2 * k);
      const n = fbm(X * 0.018, Z * 0.018, 77) * 7 + fbm(X * 0.06, Z * 0.06, 78) * 2;
      const seaward = Math.min(1, Math.max(0, (gy - coastY) / 14));        // past the coast, the land slopes into the sea
      const land = hb + kk * (n + Math.min(16, d * 0.06) + (gy < 0 ? Math.min(25, -gy * 0.12) : 0));
      const sea = hb + kk * (-6 - Math.min(10, d * 0.04) - hb * 0.6);
      return land * (1 - seaward) + sea * seaward;
    };
    for (let j = 0; j < SZ; j++) for (let i = 0; i < SX; i++) {
      const X = X0 + (X1 - X0) * (i / (SX - 1)), Z = Z0 + (Z1 - Z0) * (j / (SZ - 1)), k = (j * SX + i) * 3;
      const y = heightAt(X, Z);
      pos.set([X, y, Z], k);
      landColor(y, c); col.set([c.r, c.g, c.b], k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx: number[] = [];
    for (let j = 0; j < SZ - 1; j++) for (let i = 0; i < SX - 1; i++) { const a = j * SX + i; idx.push(a, a + SX, a + 1, a + 1, a + SX, a + SX + 1); }
    g.setIndex(idx); g.computeVertexNormals();
    const land = new THREE.Mesh(g, terrainMaterial());
    land.receiveShadow = true;
    this.group.add(land);

    // distant forests on the outer land
    const spots: Array<[number, number, number, number]> = [];
    // forests hug the valley (dense near the edge, thinning with distance) so the valley doesn't read as a cut-out
    const R = 140, ax = wx(0) - R, bx = wx(ny - 1) + R, az = wz(0) - R, bz = wz(nx - 1) + R;
    for (let n = 0; n < 9000 && spots.length < 2200; n++) {
      const X = ax + hash2(n, 1, 61) * (bx - ax), Z = az + hash2(n, 2, 61) * (bz - az);
      const dd = Math.max(Math.abs(Z) - nx / 2, Math.abs(X - (wx(0) + wx(ny - 1)) / 2) - ny / 2, 0);
      if (hash2(n, 4, 61) > Math.exp(-dd / 55)) continue;
      const gy = X + ny / 2, gx = Z + nx / 2;
      if (gx > -2 && gx < nx + 1 && gy > -2 && gy < ny + 1) continue;
      const y = heightAt(X, Z);
      if (y < 1.5 || y > 24) continue;
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
          float near = 1.0 - smoothstep(10.0, 70.0, distance(vW.xz, uFocus.xz));
          float a = (0.035 + 0.55 * near) * line + 0.05 * near;
          a *= 1.0 - smoothstep(14.0, 38.0, vW.y);
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
