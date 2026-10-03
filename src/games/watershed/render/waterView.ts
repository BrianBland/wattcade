// The river as one liquid surface. The particles stay the truth (depth, flow, erosion); this view merges them:
// depth = blurred + time-smoothed particle volume, flow = volume-weighted particle velocity per cell, foam = fast or
// falling water. Drawn at 2× with a shader: depth colour (turquoise shallows → deep blue), soft alpha shorelines,
// ripples advected along the local flow (two-phase flow map over procedural noise), Fresnel sky, sun glint, foam lace.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, sample } from '../sim/terrain';
import { NOISE_GLSL } from './glsl';
import { gridIndex } from './terrainView';
import { fine, upsample2 } from './upsample';

const VERT = /* glsl */ `
attribute float aDepth; attribute vec2 aFlow; attribute float aFoam;
varying float vDepth; varying vec2 vFlow; varying float vFoam; varying vec3 vWPos; varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vDepth = aDepth; vFlow = aFlow; vFoam = aFoam;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uShallow; uniform vec3 uDeep;
varying float vDepth; varying vec2 vFlow; varying float vFoam; varying vec3 vWPos; varying vec3 vN;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
vec2 ripple(vec2 p) { float e = 0.07, a = wsFbm(p); return vec2(wsFbm(p + vec2(e, 0.0)) - a, wsFbm(p + vec2(0.0, e)) - a) / e; }
void main() {
  if (vDepth < 0.008) discard;
  float sp = length(vFlow);
  float t = uTime * 0.55, p0 = fract(t), p1 = fract(t + 0.5), wgt = abs(0.5 - p0) * 2.0;
  vec2 base = vWPos.xz * 0.5;
  vec2 g = mix(ripple(base - vFlow * 0.22 * p0), ripple(base + vec2(0.37, 0.11) - vFlow * 0.22 * p1), wgt);
  g += ripple(vWPos.xz * 1.1 + vec2(uTime * 0.13, -uTime * 0.09)) * 0.3;
  float amp = 0.035 + 0.09 * clamp(sp / 6.0, 0.0, 1.0);
  vec3 N = normalize(vN + vec3(-g.x * amp, 0.0, -g.y * amp));
  vec3 V = normalize(cameraPosition - vWPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  float d = clamp(vDepth / 1.3, 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, d) * (0.6 + 0.4 * clamp(dot(N, uSun), 0.0, 1.0));
  col = mix(col, uSky, fres * 0.5);
  col += uSunCol * pow(clamp(dot(N, normalize(uSun + V)), 0.0, 1.0), 600.0) * 0.9;  // tight sparkles, not glare
  // foam streaks: noise stretched along the flow direction
  vec2 fdir = sp > 0.01 ? vFlow / sp : vec2(1.0, 0.0);
  vec2 fp = vec2(dot(vWPos.xz, fdir) * 0.7, dot(vWPos.xz, vec2(-fdir.y, fdir.x)) * 1.3);
  float n = wsFbm(fp - vec2(sp * 0.25 * p0, 0.0));
  float n2 = wsFbm(vWPos.xz * 2.3 + vec2(uTime * 0.2, 0.0));
  float foam = clamp(vFoam, 0.0, 1.0) * smoothstep(0.55, 0.72, n) * 0.85;
  foam = max(foam, (1.0 - smoothstep(0.02, 0.07, vDepth)) * smoothstep(0.55, 0.75, n2) * 0.35);
  col = mix(col, vec3(0.94, 0.97, 1.0), foam);
  float alpha = mix(0.62, 0.92, d) * smoothstep(0.008, 0.07, vDepth);
  alpha = clamp(max(alpha, foam * 0.9) + fres * 0.15, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class WaterView {
  readonly mesh: THREE.Mesh;
  /** Coarse (sim-grid) smoothed fields: depth, flow (grid x/y), foam. */
  readonly depth: Float32Array; private fx: Float32Array; private fy: Float32Array; private foam: Float32Array;
  private blur: Float32Array; private sx: Float32Array; private sy: Float32Array;
  private fd: Float32Array; private fflow: Float32Array; private ffoam: Float32Array; private cflow: Float32Array;
  private t1: Float32Array; private t2: Float32Array;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(private nx: number, private ny: number, wx: (j: number) => number, wz: (i: number) => number, sunDir: THREE.Vector3) {
    const n = nx * ny, FX = fine(nx), FY = fine(ny), F = FX * FY;
    this.depth = new Float32Array(n); this.fx = new Float32Array(n); this.fy = new Float32Array(n); this.foam = new Float32Array(n);
    this.blur = new Float32Array(n); this.sx = new Float32Array(n); this.sy = new Float32Array(n); this.cflow = new Float32Array(n * 2);
    this.fd = new Float32Array(F); this.fflow = new Float32Array(F * 2); this.ffoam = new Float32Array(F);
    this.t1 = new Float32Array(FX * ny); this.t2 = new Float32Array(FX * ny * 2);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(F * 3);
    for (let J = 0; J < FY; J++) for (let I = 0; I < FX; I++) { const k = (J * FX + I) * 3; pos[k] = wx(J / 2); pos[k + 2] = wz(I / 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(F * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(F), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(F * 2), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFoam', new THREE.BufferAttribute(new Float32Array(F), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(gridIndex(FX, FY));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSun: { value: sunDir.clone().normalize() }, uSunCol: { value: new THREE.Color(0xfff3dd) },
      uSky: { value: new THREE.Color(0xbfe0f2) }, uShallow: { value: new THREE.Color(0x3fb8c4) }, uDeep: { value: new THREE.Color(0x14548f) },
    }]);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** Re-derive the smoothed coarse fields from the particles (call on every sim tick). */
  absorb(s: WatershedSnapshot): void {
    const { nx, ny, w } = s, B = this.blur, E = this.depth;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let a = 0, m = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= ny || ii < 0 || ii >= nx) continue;
        const wt = di === 0 && dj === 0 ? 4 : 1;
        a += w[jj * nx + ii] * wt; m += wt;
      }
      const k = j * nx + i;
      B[k] = a / m; E[k] += (B[k] - E[k]) * 0.25;
    }
    // volume-weighted particle velocity per cell
    const sx = this.sx, sy = this.sy; sx.fill(0); sy.fill(0);
    for (let q = 0; q < s.n; q++) {
      const i = Math.min(nx - 1, Math.max(0, Math.round(s.px[q]))), j = Math.min(ny - 1, Math.max(0, Math.round(s.py[q])));
      const v = s.pvol[q], k = j * nx + i;
      sx[k] += s.pvx[q] * v; sy[k] += s.pvy[q] * v;
    }
    for (let k = 0; k < nx * ny; k++) {
      const wv = Math.max(0.05, w[k]), vx = sx[k] / wv, vy = sy[k] / wv;
      this.fx[k] += (vx - this.fx[k]) * 0.2; this.fy[k] += (vy - this.fy[k]) * 0.2;
    }
    // foam: fast water, or water dropping steeply (falls)
    const h = s.h;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      const sl = Math.hypot(h[k + nx] + E[k + nx] - h[k - nx] - E[k - nx], h[k + 1] + E[k + 1] - h[k - 1] - E[k - 1]) / 2;
      const target = E[k] > 0.05 ? Math.min(1, Math.max(0, (Math.hypot(this.fx[k], this.fy[k]) - 6.5) / 4) + Math.max(0, (sl - 0.8) * 1.2)) : 0;
      this.foam[k] += (target - this.foam[k]) * 0.15;
    }
  }

  /** Rebuild the surface mesh on top of the drawn terrain heights (fine grid). */
  update(fh: Float32Array): void {
    const { nx, ny } = this, FX = fine(nx), FY = fine(ny);
    upsample2(this.depth, nx, ny, this.fd, this.t1, false);
    upsample2(this.foam, nx, ny, this.ffoam, this.t1, false);
    const cf = this.cflow;
    for (let k = 0; k < nx * ny; k++) { cf[k * 2] = this.fy[k]; cf[k * 2 + 1] = this.fx[k]; } // world (X, Z) = grid (y, x)
    upsample2(cf, nx, ny, this.fflow, this.t2, false, 2);
    const g = this.mesh.geometry;
    const P = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const N = (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const D = (g.getAttribute('aDepth') as THREE.BufferAttribute).array as Float32Array;
    const FL = (g.getAttribute('aFlow') as THREE.BufferAttribute).array as Float32Array;
    const FO = (g.getAttribute('aFoam') as THREE.BufferAttribute).array as Float32Array;
    const fd = this.fd;
    const surf = (k: number) => fh[k] + fd[k] * 0.9 + 0.04;
    for (let J = 0; J < FY; J++) {
      const jm = J > 0 ? J - 1 : J, jp = J < FY - 1 ? J + 1 : J;
      for (let I = 0; I < FX; I++) {
        const k = J * FX + I, o = k * 3;
        const im = I > 0 ? I - 1 : I, ip = I < FX - 1 ? I + 1 : I;
        P[o + 1] = surf(k);
        const dx = (surf(jp * FX + I) - surf(jm * FX + I)) / ((jp - jm) * 0.5), dz = (surf(J * FX + ip) - surf(J * FX + im)) / ((ip - im) * 0.5);
        const inv = 1 / Math.hypot(dx, 1, dz);
        N[o] = -dx * inv; N[o + 1] = inv; N[o + 2] = -dz * inv;
        // fade the river out where it meets the sea (the sea surface takes over)
        D[k] = fh[k] < SEA - 0.3 ? 0 : fd[k];
        FL[k * 2] = this.fflow[k * 2]; FL[k * 2 + 1] = this.fflow[k * 2 + 1];
        FO[k] = this.ffoam[k];
      }
    }
    for (const n of ['position', 'normal', 'aDepth', 'aFlow', 'aFoam']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }

  tick(time: number): void { this.uniforms.uTime.value = time; }

  /** Smoothed water speed (cells/s) at sim-grid coords. */
  speedAt(x: number, y: number): number {
    return Math.hypot(sample(this.fx, this.nx, this.ny, x, y), sample(this.fy, this.nx, this.ny, x, y));
  }
}
