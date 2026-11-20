// The valley mesh, drawn at 2× the sim grid (Catmull-Rom heights, linear colours) with per-pixel procedural detail
// (mottling, speckle, strata on steep ground, a little normal noise) so it reads as land rather than a low-poly grid.
// Plus the diorama skirt that follows the edge.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, fbm } from '../sim/terrain';
import { CLOUD_SHADOW_GLSL, NOISE_GLSL } from './glsl';
import { fine, upsample2 } from './upsample';
import { encodeH, heightTexture } from './sea';

export const BASE = -10;   // diorama floor

const C = {
  grass: new THREE.Color(0x467f33), meadow: new THREE.Color(0x93b552), lush: new THREE.Color(0x35702d), dry: new THREE.Color(0xa9a35a),
  rock: new THREE.Color(0x857c70), snow: new THREE.Color(0xf4f7fa), sand: new THREE.Color(0xe2cf98),
  strata: new THREE.Color(0x9c8a76), earth: new THREE.Color(0x7a5236), canyon: new THREE.Color(0xb0643e),
  silt: new THREE.Color(0xccb688), seabed: new THREE.Color(0xd8c48e), wet: new THREE.Color(0x34482c),
  lavaHot: new THREE.Color(0xff6a1a), basalt: new THREE.Color(0x2e2a28), scorch: new THREE.Color(0x3a2e26), debris: new THREE.Color(0x8a7350),
};

/**
 * The terrain material. With `maps`, colour and the surface normal come per pixel from fine-grid textures (bilinear),
 * not from the vertices, so the mesh's triangles don't show in the shading: only the silhouette is polygonal.
 * Without maps (other meshes reuse it) it falls back to vertex colours and normals.
 * Per pixel on top: macro/micro mottling, rock on steep faces (strata, lichen), drifting cloud shadows, and under the
 * river (normal-map alpha = water depth) a darker wet bed with dancing caustics.
 */
export function terrainMaterial(maps?: { color: THREE.Texture; normal: THREE.Texture }, time: { value: number } = { value: 0 }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: !maps, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    if (maps) { sh.uniforms.uTCol = { value: maps.color }; sh.uniforms.uTNor = { value: maps.normal }; }
    const M = !!maps;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN;${M ? '\nattribute vec2 tuv; varying vec2 vTUv;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);${M ? ' vTUv = tuv;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform float uTime;\n${M ? 'varying vec2 vTUv; uniform sampler2D uTCol; uniform sampler2D uTNor;' : ''}\n${NOISE_GLSL}\n${CLOUD_SHADOW_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${M ? `vec4 tc = texture2D(uTCol, vTUv); diffuseColor.rgb = tc.rgb;
      vec4 tnr = texture2D(uTNor, vTUv);
      vec3 tn = normalize(tnr.xyz * 2.0 - 1.0);
      float fresh = tc.a, wdep = tnr.a * 4.0;` : 'vec3 tn = normalize(vWN); float fresh = 0.0, wdep = 0.0;'}
      float wsShade = 0.0;
      {
        float n1 = wsFbm(vWPos.xz * 0.32);
        float n2 = wsNoise(vWPos.xz * 3.1);
        float n3 = wsFbm(vWPos.xz * 0.05 + 3.0);
        float slope = 1.0 - clamp(tn.y, 0.0, 1.0);
        vec3 c = diffuseColor.rgb;
        float lum = dot(c, vec3(0.3, 0.55, 0.15));
        float green = clamp((c.g - max(c.r, c.b)) * 6.0, 0.0, 1.0);
        // big soft patches: warmer/drier and cooler/lusher grass, so meadows don't read as one flat green
        c = mix(c, c * vec3(1.16, 1.04, 0.78), green * smoothstep(0.45, 0.8, n3) * 0.7);
        c = mix(c, c * vec3(0.82, 0.95, 0.9), green * smoothstep(0.45, 0.2, n3) * 0.6);
        c *= 0.82 + 0.32 * n1;
        c *= 0.91 + 0.18 * n2;
        // close up (chase and landmark cams) the ground gets grain and pebbles; faded out with distance so the
        // overview never shimmers
        float nearK = 1.0 - smoothstep(22.0, 60.0, length(cameraPosition - vWPos));
        if (nearK > 0.0) {
          float g1 = wsNoise(vWPos.xz * 9.0), g2 = wsNoise(vWPos.xz * 23.0 + 7.0);
          c *= 1.0 + nearK * ((g1 - 0.5) * 0.24 + (g2 - 0.5) * 0.16);
          c = mix(c, c * 1.35 + 0.04, nearK * smoothstep(0.8, 0.9, g2) * 0.6);
        }
        // steep faces turn to rock: warm grey with strata bands and a little lichen, whatever the coarse colour said
        float cliff = smoothstep(0.42, 0.72, slope + (n1 - 0.5) * 0.25) * (1.0 - smoothstep(0.0, 0.3, wdep));
        float strata = 0.5 + 0.5 * sin(vWPos.y * 2.6 + n1 * 4.0);
        vec3 rock = mix(vec3(0.30, 0.26, 0.22), vec3(0.47, 0.41, 0.34), strata) * (0.85 + 0.3 * n2);
        rock = mix(rock, vec3(0.36, 0.42, 0.26), smoothstep(0.62, 0.8, n1) * 0.35);
        c = mix(c, mix(rock, c, 0.25 * smoothstep(0.85, 0.4, lum)), cliff * ${M ? '0.85' : '0.7'});
        // freshly cut ground (alpha of the colour map): dark, wet, glistening earth with crumbs that trickle downhill
        ${M ? `float crumb = wsNoise(vWPos.xz * 4.0 + vec2(0.0, uTime * 0.9)) * wsNoise(vWPos.xz * 7.3 - vec2(uTime * 0.6, 0.0));
        c = mix(c, vec3(0.20, 0.12, 0.07) + 0.18 * vec3(crumb), fresh * 0.75);
        // the river bed: darker and cooler with depth, with caustics dancing in the shallows
        float under = smoothstep(0.02, 0.25, wdep);
        c *= mix(1.0, 0.55, under * smoothstep(0.0, 2.5, wdep));
        c = mix(c, c * vec3(0.78, 0.95, 1.0), under);
        vec2 cp = vWPos.xz * 1.15;
        float k1 = wsNoise(cp + vec2(uTime * 0.35, uTime * 0.22)), k2 = wsNoise(cp * 1.37 - vec2(uTime * 0.27, -uTime * 0.31));
        float caus = pow(1.0 - abs(k1 - k2), 9.0);
        c += vec3(0.75, 0.95, 0.9) * caus * 0.55 * under * (1.0 - smoothstep(0.6, 2.2, wdep));` : ''}
        diffuseColor.rgb = c;
        wsShade = wsCloudShadow(vWPos, uTime);
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
      }`)
      // cloud shadows dim the direct sun only (the sky fill stays), so shade reads as weather, not dirt
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.directDiffuse *= 1.0 - 0.55 * wsShade;
      reflectedLight.directSpecular *= 1.0 - 0.7 * wsShade;`);
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
  /** Drawn heights as a byte texture (sea.ts encoding), so the sea can shade by depth over the live coast. */
  readonly hTex: THREE.DataTexture;
  /** Coarse heights at the last update, and how freshly each cell has been cut (0..1, decays over a few seconds). */
  private hPrev: Float32Array | null = null; readonly fresh: Float32Array;
  /** Fixed macro noise per cell (lush / dry patches) and the fine water depth (normal-map alpha). */
  private macro: Float32Array; private fwet: Float32Array; private occ: Float32Array;
  /** Shader clock for the trickling crumbs on fresh cuts. */
  readonly time: { value: number };

  constructor(private nx: number, private ny: number, wx: (j: number) => number, wz: (i: number) => number, time: { value: number } = { value: 0 }) {
    this.time = time;
    const FX = this.FX = fine(nx), FY = this.FY = fine(ny);
    this.fh = new Float32Array(FX * FY); this.fcol = new Float32Array(FX * FY * 4);
    this.ccol = new Float32Array(nx * ny * 4); this.tmp1 = new Float32Array(FX * ny); this.tmp3 = new Float32Array(FX * ny * 4);
    this.fresh = new Float32Array(nx * ny); this.occ = new Float32Array(nx * ny); this.fwet = new Float32Array(FX * FY);
    this.macro = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) this.macro[j * nx + i] = fbm(i * 0.09, j * 0.09, 4242, 3);
    const tex = (srgb: boolean) => {
      const t = new THREE.DataTexture(new Uint8Array(FX * FY * 4), FX, FY, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    this.colTex = tex(true); this.norTex = tex(false); this.hTex = heightTexture(FX, FY);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(FX * FY * 3);
    for (let J = 0; J < FY; J++) for (let I = 0; I < FX; I++) { const k = (J * FX + I) * 3; pos[k] = wx(J / 2); pos[k + 2] = wz(I / 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(FX * FY * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const tuv = new Float32Array(FX * FY * 2);
    for (let J = 0; J < FY; J++) for (let I = 0; I < FX; I++) { const k = (J * FX + I) * 2; tuv[k] = (I + 0.5) / FX; tuv[k + 1] = (J + 0.5) / FY; }
    g.setAttribute('tuv', new THREE.BufferAttribute(tuv, 2));
    g.setIndex(gridIndex(FX, FY));
    this.mesh = new THREE.Mesh(g, terrainMaterial({ color: this.colTex, normal: this.norTex }, this.time));
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

  dispose(): void { this.colTex.dispose(); this.norTex.dispose(); this.hTex.dispose(); }

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
    relief(h, nx, ny, this.occ);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = h[k], mac = this.macro[k];
      const slope = Math.hypot((at(i, j + 1) - at(i, j - 1)) / 2, (at(i + 1, j) - at(i - 1, j)) / 2);
      if (z < SEA) c.copy(C.seabed).multiplyScalar(Math.max(0.45, 1 + z * 0.07));
      else if (z < 0.7) c.copy(C.sand).lerp(C.meadow, Math.max(0, (z - 0.35) / 0.35));
      else {
        // lowland meadow → grass → lush hollows / dry sunny shoulders, then rock high up or on steep ground, snow on top
        c.copy(C.meadow).lerp(C.grass, Math.min(1, z / 9));
        if (mac < 0) c.lerp(C.lush, Math.min(1, -mac * 2.2)); else c.lerp(C.dry, Math.min(0.75, mac * 1.8 * Math.min(1, slope * 1.5 + 0.2)));
        c.lerp(C.rock, Math.min(1, Math.max(0, (z - 27 + mac * 6) / 12, (slope - 0.95) * 1.4)));
        c.lerp(C.strata, Math.min(1, Math.max(0, 0.75 - hard[k]) * 1.2) * (0.75 + 0.25 * Math.min(1, slope)));
        const snowLine = 38 + mac * 6 + Math.max(0, slope - 0.8) * 8;
        if (z > snowLine) c.lerp(C.snow, Math.min(1, (z - snowLine) / 4));
      }
      const d = z - h0[k];
      if (d < -0.15) c.lerp(-d > 3 ? C.canyon : C.earth, Math.min(1, -d / 2.5));
      else if (d > 0.1) {
        c.lerp(C.silt, Math.min(0.8, d / 1.5) * (0.85 + 0.15 * Math.abs(mac)));
        // dry banks of old silt grow a sparse green fuzz in patches, so a big delta reads as land, not desert
        if (wet[k] < 0.02 && z > 0.9) c.lerp(C.grass, 0.55 * Math.min(1, Math.max(0, (mac - 0.02) * 5)));
      }
      if (wet[k] > 0.05 && z >= SEA) c.lerp(C.wet, 0.3);
      const mat = s.mat?.[k] ?? 0;
      if (mat === 1) c.copy(C.lavaHot).lerp(C.basalt, Math.min(1, lavaAge / 45));
      else if (mat === 2) c.lerp(C.scorch, 0.8);
      else if (mat === 3) c.lerp(C.debris, 0.7);
      // baked relief: hollows and gullies darken, crests catch a little light (cheap ambient occlusion)
      const o = this.occ[k], lit = mat === 1 && lavaAge < 30 ? 1 : o > 0 ? 1 - Math.min(0.36, o) : 1 + Math.min(0.12, -o * 0.5);
      cc[k * 4] = c.r * lit; cc[k * 4 + 1] = c.g * lit; cc[k * 4 + 2] = c.b * lit; cc[k * 4 + 3] = z >= SEA ? fr[k] : 0;
    }
    const { FX, FY, fh, fcol } = this;
    upsample2(h, nx, ny, fh, this.tmp1, true);
    upsample2(cc, nx, ny, fcol, this.tmp3, false, 4);
    upsample2(wet, nx, ny, this.fwet, this.tmp1, false);
    const fw = this.fwet;
    const g = this.mesh.geometry;
    const P = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const N = (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const CT = this.colTex.image.data as Uint8Array, NT = this.norTex.image.data as Uint8Array, HT = this.hTex.image.data as Uint8Array;
    for (let J = 0; J < FY; J++) {
      const jm = J > 0 ? J - 1 : J, jp = J < FY - 1 ? J + 1 : J;
      for (let I = 0; I < FX; I++) {
        const k = J * FX + I, o = k * 3;
        const im = I > 0 ? I - 1 : I, ip = I < FX - 1 ? I + 1 : I;
        const dx = (fh[jp * FX + I] - fh[jm * FX + I]) / ((jp - jm) * 0.5), dz = (fh[J * FX + ip] - fh[J * FX + im]) / ((ip - im) * 0.5);
        const inv = 1 / Math.hypot(dx, 1, dz);
        P[o + 1] = fh[k]; HT[k] = encodeH(fh[k]);
        const nx_ = -dx * inv, ny_ = inv, nz_ = -dz * inv;
        N[o] = nx_; N[o + 1] = ny_; N[o + 2] = nz_;
        const q = k * 4;
        NT[q] = (nx_ * 0.5 + 0.5) * 255; NT[q + 1] = (ny_ * 0.5 + 0.5) * 255; NT[q + 2] = (nz_ * 0.5 + 0.5) * 255; NT[q + 3] = Math.min(255, Math.max(0, fw[k] * 64));
        CT[q] = SRGB[Math.min(1023, Math.max(0, (fcol[q] * 1023) | 0))]; CT[q + 1] = SRGB[Math.min(1023, Math.max(0, (fcol[q + 1] * 1023) | 0))];
        CT[q + 2] = SRGB[Math.min(1023, Math.max(0, (fcol[q + 2] * 1023) | 0))]; CT[q + 3] = Math.min(255, Math.max(0, fcol[q + 3] * 255));
      }
    }
    for (const n of ['position', 'normal']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    this.colTex.needsUpdate = true; this.norTex.needsUpdate = true; this.hTex.needsUpdate = true;
    g.computeBoundingSphere();
    const sp = this.skirt.geometry.getAttribute('position') as THREE.BufferAttribute, SP = sp.array as Float32Array;
    this.ring.forEach(([I, J], n) => { SP[n * 6 + 1] = Math.max(fh[J * FX + I], BASE + 0.5); });
    sp.needsUpdate = true;
  }
}

/**
 * Cheap ambient occlusion from the heightfield: how far each cell sits below (+) or above (−) the mean of rings of
 * neighbours at 1.5 and 4 cells, in metres, scaled. Gullies and the foot of slopes darken; ridgelines lift.
 */
export function relief(h: Float32Array, nx: number, ny: number, out: Float32Array): void {
  const at = (i: number, j: number) => h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const R: Array<[number, number, number]> = [];
  for (const [r, w] of [[1.5, 0.5], [4, 0.5]] as const) for (let a = 0; a < 8; a++) R.push([Math.round(Math.cos(a * Math.PI / 4) * r), Math.round(Math.sin(a * Math.PI / 4) * r), w / 8]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = Math.max(SEA, h[j * nx + i]);
    let m = 0;
    for (const [di, dj, w] of R) m += Math.max(SEA, at(i + di, j + dj)) * w;
    out[j * nx + i] = (m - z) * 0.11;
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
