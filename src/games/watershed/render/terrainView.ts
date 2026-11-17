// The valley mesh, drawn at 2× the sim grid (Catmull-Rom heights, linear colours) with per-pixel procedural detail
// (mottling, speckle, strata on steep ground, a little normal noise) so it reads as land rather than a low-poly grid.
// Plus the diorama skirt that follows the edge.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA } from '../sim/terrain';
import { NOISE_GLSL } from './glsl';
import { fine, upsample2 } from './upsample';

export const BASE = -10;   // diorama floor

const C = {
  grass: new THREE.Color(0x4f8a3c), meadow: new THREE.Color(0x8fb85a), rock: new THREE.Color(0x857a6c), snow: new THREE.Color(0xf4f7fa),
  strata: new THREE.Color(0xc49070), earth: new THREE.Color(0x8a5a3a), canyon: new THREE.Color(0xc0643c),
  silt: new THREE.Color(0xdcc893), seabed: new THREE.Color(0xd2c08c), wet: new THREE.Color(0x3a5236),
  lavaHot: new THREE.Color(0xff6a1a), basalt: new THREE.Color(0x2e2a28), scorch: new THREE.Color(0x3a2e26), debris: new THREE.Color(0x8a7350),
};

/**
 * The terrain material. With `maps`, colour and the surface normal come per pixel from fine-grid textures (bilinear),
 * not from the vertices, so the mesh's triangles don't show in the shading: only the silhouette is polygonal.
 * Without maps (other meshes reuse it) it falls back to vertex colours and normals.
 */
export function terrainMaterial(maps?: { color: THREE.Texture; normal: THREE.Texture; fresh: { value: number } }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: !maps, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    if (maps) { sh.uniforms.uTCol = { value: maps.color }; sh.uniforms.uTNor = { value: maps.normal }; sh.uniforms.uTime = maps.fresh; }
    const M = !!maps;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN;${M ? '\nattribute vec2 tuv; varying vec2 vTUv;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);${M ? ' vTUv = tuv;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN;\n${M ? 'varying vec2 vTUv; uniform sampler2D uTCol; uniform sampler2D uTNor; uniform float uTime;' : ''}\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${M ? `vec4 tc = texture2D(uTCol, vTUv); diffuseColor.rgb = tc.rgb;
      vec3 tn = normalize(texture2D(uTNor, vTUv).xyz * 2.0 - 1.0);
      float fresh = tc.a;` : 'vec3 tn = normalize(vWN); float fresh = 0.0;'}
      {
        float n1 = wsFbm(vWPos.xz * 0.32);
        float n2 = wsNoise(vWPos.xz * 3.1);
        float slope = 1.0 - clamp(tn.y, 0.0, 1.0);
        vec3 c = diffuseColor.rgb;
        c *= 0.8 + 0.36 * n1;
        c *= 0.9 + 0.2 * n2;
        float strata = 0.5 + 0.5 * sin(vWPos.y * 3.4 + n1 * 3.0);
        c = mix(c, c * (0.86 + 0.2 * strata), smoothstep(0.35, 0.7, slope));
        // freshly cut ground (alpha of the colour map): dark, wet, glistening earth with crumbs that trickle downhill
        ${M ? `float crumb = wsNoise(vWPos.xz * 4.0 + vec2(0.0, uTime * 0.9)) * wsNoise(vWPos.xz * 7.3 - vec2(uTime * 0.6, 0.0));
        c = mix(c, vec3(0.20, 0.12, 0.07) + 0.18 * vec3(crumb), fresh * 0.75);` : ''}
        diffuseColor.rgb = c;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.4, fresh * 0.8);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${M ? 'normal = normalize((viewMatrix * vec4(tn, 0.0)).xyz);' : ''}
      {
        vec2 p = vWPos.xz * 1.4; float e = 0.06;
        vec2 g = vec2(wsNoise(p + vec2(e, 0.0)) - wsNoise(p - vec2(e, 0.0)), wsNoise(p + vec2(0.0, e)) - wsNoise(p - vec2(0.0, e))) / (2.0 * e);
        vec3 dn = vec3(-g.x, 0.0, -g.y) * 0.08;
        normal = normalize(normal + (viewMatrix * vec4(dn, 0.0)).xyz);
      }`);
  };
  return m;
}

export class TerrainView {
  readonly mesh: THREE.Mesh; readonly skirt: THREE.Mesh;
  readonly FX: number; readonly FY: number;
  /** Fine heights (FX × FY), the surface actually drawn. */
  readonly fh: Float32Array;
  private ccol: Float32Array; private fcol: Float32Array; private tmp1: Float32Array; private tmp3: Float32Array;
  private ring: Array<[number, number]> = [];
  /** Per-pixel colour (sRGB, alpha = freshly cut ground) and normal maps at the fine resolution. */
  private colTex: THREE.DataTexture; private norTex: THREE.DataTexture;
  /** Coarse heights at the last update, and how freshly each cell has been cut (0..1, decays over a few seconds). */
  private hPrev: Float32Array | null = null; readonly fresh: Float32Array;
  /** Shader clock for the trickling crumbs on fresh cuts. */
  readonly time = { value: 0 };

  constructor(private nx: number, private ny: number, wx: (j: number) => number, wz: (i: number) => number) {
    const FX = this.FX = fine(nx), FY = this.FY = fine(ny);
    this.fh = new Float32Array(FX * FY); this.fcol = new Float32Array(FX * FY * 4);
    this.ccol = new Float32Array(nx * ny * 4); this.tmp1 = new Float32Array(FX * ny); this.tmp3 = new Float32Array(FX * ny * 4);
    this.fresh = new Float32Array(nx * ny);
    const tex = (srgb: boolean) => {
      const t = new THREE.DataTexture(new Uint8Array(FX * FY * 4), FX, FY, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    this.colTex = tex(true); this.norTex = tex(false);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(FX * FY * 3);
    for (let J = 0; J < FY; J++) for (let I = 0; I < FX; I++) { const k = (J * FX + I) * 3; pos[k] = wx(J / 2); pos[k + 2] = wz(I / 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(FX * FY * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const tuv = new Float32Array(FX * FY * 2);
    for (let J = 0; J < FY; J++) for (let I = 0; I < FX; I++) { const k = (J * FX + I) * 2; tuv[k] = (I + 0.5) / FX; tuv[k + 1] = (J + 0.5) / FY; }
    g.setAttribute('tuv', new THREE.BufferAttribute(tuv, 2));
    g.setIndex(gridIndex(FX, FY));
    this.mesh = new THREE.Mesh(g, terrainMaterial({ color: this.colTex, normal: this.norTex, fresh: this.time }));
    this.mesh.receiveShadow = true; this.mesh.castShadow = true;

    // skirt around the fine edge, from the terrain down to BASE (lighter at the top, dark at the base)
    const ring = this.ring;
    for (let I = 0; I < FX; I++) ring.push([I, 0]);
    for (let J = 1; J < FY; J++) ring.push([FX - 1, J]);
    for (let I = FX - 2; I >= 0; I--) ring.push([I, FY - 1]);
    for (let J = FY - 2; J > 0; J--) ring.push([0, J]);
    ring.push(ring[0]);
    const sp = new Float32Array(ring.length * 6), scol = new Float32Array(ring.length * 6);
    const top = new THREE.Color(0x8a6244), bot = new THREE.Color(0x2e1e12);
    ring.forEach(([I, J], n) => {
      sp.set([wx(J / 2), 0, wz(I / 2), wx(J / 2), BASE, wz(I / 2)], n * 6);
      scol.set([top.r, top.g, top.b, bot.r, bot.g, bot.b], n * 6);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const sidx: number[] = [];
    for (let n = 0; n < ring.length - 1; n++) { const a = n * 2, b = a + 1, c = a + 2, d = a + 3; sidx.push(a, b, c, b, d, c); }
    sg.setIndex(sidx); sg.computeVertexNormals();
    this.skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  }

  dispose(): void { this.colTex.dispose(); this.norTex.dispose(); }

  /** Height of the drawn surface at sim-grid coords (x across, y downstream). */
  heightAt(x: number, y: number): number {
    const { FX, FY, fh } = this;
    const fx = Math.min(FX - 1.001, Math.max(0, x * 2)), fy = Math.min(FY - 1.001, Math.max(0, y * 2));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * FX + i;
    return (fh[k] * (1 - u) + fh[k + 1] * u) * (1 - v) + (fh[k + FX] * (1 - u) + fh[k + FX + 1] * u) * v;
  }

  update(s: WatershedSnapshot, wet: Float32Array): void {
    const { nx, ny, h, h0, hard } = s, cc = this.ccol, c = new THREE.Color();
    // fresh cuts: wherever the ground dropped since the last update (rivers biting into banks, slumps), decaying
    const fr = this.fresh;
    if (!this.hPrev) this.hPrev = h.slice();
    for (let k = 0; k < nx * ny; k++) {
      const cut = this.hPrev[k] - h[k];
      fr[k] = Math.max(fr[k] * 0.965, Math.min(1, cut > 0.002 ? cut * 30 : 0));
      this.hPrev[k] = h[k];
    }
    const lavaAge = s.events?.find((e) => e.kind === 'volcano' && e.state !== 'pending' && e.state !== 'warning')?.age ?? 0;
    const at = (i: number, j: number) => h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = h[k];
      const slope = Math.hypot((at(i, j + 1) - at(i, j - 1)) / 2, (at(i + 1, j) - at(i - 1, j)) / 2);
      if (z < SEA) c.copy(C.seabed).multiplyScalar(Math.max(0.55, 1 + z * 0.06));
      else {
        c.copy(C.meadow).lerp(C.grass, Math.min(1, z / 10));
        c.lerp(C.rock, Math.min(1, Math.max(0, (z - 18) / 8, (slope - 0.9) * 1.5)));
        c.lerp(C.strata, Math.min(1, Math.max(0, 0.75 - hard[k])) * 1.2);
        if (z > 28) c.lerp(C.snow, Math.min(1, (z - 28) / 3));
      }
      const d = z - h0[k];
      if (d < -0.15) c.lerp(-d > 3 ? C.canyon : C.earth, Math.min(1, -d / 2.5));
      else if (d > 0.1) c.lerp(C.silt, Math.min(0.9, d / 1.5));
      if (wet[k] > 0.05 && z >= SEA) c.lerp(C.wet, 0.35);
      const mat = s.mat?.[k] ?? 0;
      if (mat === 1) c.copy(C.lavaHot).lerp(C.basalt, Math.min(1, lavaAge / 45));
      else if (mat === 2) c.lerp(C.scorch, 0.8);
      else if (mat === 3) c.lerp(C.debris, 0.7);
      cc[k * 4] = c.r; cc[k * 4 + 1] = c.g; cc[k * 4 + 2] = c.b; cc[k * 4 + 3] = z >= SEA ? fr[k] : 0;
    }
    const { FX, FY, fh, fcol } = this;
    upsample2(h, nx, ny, fh, this.tmp1, true);
    upsample2(cc, nx, ny, fcol, this.tmp3, false, 4);
    const g = this.mesh.geometry;
    const P = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const N = (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const CT = this.colTex.image.data as Uint8Array, NT = this.norTex.image.data as Uint8Array;
    for (let J = 0; J < FY; J++) {
      const jm = J > 0 ? J - 1 : J, jp = J < FY - 1 ? J + 1 : J;
      for (let I = 0; I < FX; I++) {
        const k = J * FX + I, o = k * 3;
        const im = I > 0 ? I - 1 : I, ip = I < FX - 1 ? I + 1 : I;
        const dx = (fh[jp * FX + I] - fh[jm * FX + I]) / ((jp - jm) * 0.5), dz = (fh[J * FX + ip] - fh[J * FX + im]) / ((ip - im) * 0.5);
        const inv = 1 / Math.hypot(dx, 1, dz);
        P[o + 1] = fh[k];
        const nx_ = -dx * inv, ny_ = inv, nz_ = -dz * inv;
        N[o] = nx_; N[o + 1] = ny_; N[o + 2] = nz_;
        const q = k * 4;
        NT[q] = (nx_ * 0.5 + 0.5) * 255; NT[q + 1] = (ny_ * 0.5 + 0.5) * 255; NT[q + 2] = (nz_ * 0.5 + 0.5) * 255; NT[q + 3] = 255;
        CT[q] = SRGB[Math.min(1023, Math.max(0, (fcol[q] * 1023) | 0))]; CT[q + 1] = SRGB[Math.min(1023, Math.max(0, (fcol[q + 1] * 1023) | 0))];
        CT[q + 2] = SRGB[Math.min(1023, Math.max(0, (fcol[q + 2] * 1023) | 0))]; CT[q + 3] = Math.min(255, Math.max(0, fcol[q + 3] * 255));
      }
    }
    for (const n of ['position', 'normal']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    this.colTex.needsUpdate = true; this.norTex.needsUpdate = true;
    g.computeBoundingSphere();
    const sp = this.skirt.geometry.getAttribute('position') as THREE.BufferAttribute, SP = sp.array as Float32Array;
    this.ring.forEach(([I, J], n) => { SP[n * 6 + 1] = Math.max(fh[J * FX + I], BASE + 0.5); });
    sp.needsUpdate = true;
  }
}

/** Linear [0,1] (1024 steps) → sRGB byte. */
const SRGB = Uint8Array.from({ length: 1024 }, (_, i) => {
  const v = i / 1023;
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
});

export function gridIndex(FX: number, FY: number): THREE.BufferAttribute {
  const idx = new Uint32Array((FX - 1) * (FY - 1) * 6);
  let n = 0;
  for (let J = 0; J < FY - 1; J++) for (let I = 0; I < FX - 1; I++) {
    const a = J * FX + I, b = a + 1, c = a + FX, d = c + 1;
    idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = b; idx[n++] = d; idx[n++] = c;
  }
  return new THREE.BufferAttribute(idx, 1);
}
