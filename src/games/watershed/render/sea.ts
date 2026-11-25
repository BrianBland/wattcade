// The sea: one big plane whose swells, ripples, colour and foam all run on the GPU (nothing per frame on the CPU).
// It knows the land under it from two height textures (the live valley at full resolution and the static outer coast),
// so it can shade by depth: clear turquoise over sand, deep blue offshore, and a lace of foam that laps at every beach,
// including the delta the river builds. Fresnel sky reflection and a sun glitter path on top.
import * as THREE from 'three';
import { SEA } from '../sim/terrain';
import { CLOUD_SHADOW_GLSL, NOISE_GLSL } from './glsl';

/** Height encoding shared by the land height textures (one byte): metres in [H_LO, H_LO + H_SPAN]. */
export const H_LO = -24, H_SPAN = 36;
export const encodeH = (h: number) => Math.max(0, Math.min(255, Math.round(((h - H_LO) / H_SPAN) * 255)));

export function heightTexture(w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(w * h), w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vW; varying vec3 vN;
#include <fog_pars_vertex>
// long swells rolling in toward the coast (+X is downstream / out to sea, so they travel −X), plus a cross chop
vec3 swell(vec2 p, float t) {
  float a1 = 0.16, k1 = 0.16, w1 = 1.1; vec2 d1 = normalize(vec2(-1.0, 0.18));
  float a2 = 0.08, k2 = 0.37, w2 = 1.7; vec2 d2 = normalize(vec2(-0.6, -0.8));
  float a3 = 0.05, k3 = 0.71, w3 = 2.3; vec2 d3 = normalize(vec2(-0.9, 0.45));
  float s1 = dot(d1, p) * k1 + t * w1, s2 = dot(d2, p) * k2 + t * w2, s3 = dot(d3, p) * k3 + t * w3;
  float y = a1 * sin(s1) + a2 * sin(s2) + a3 * sin(s3);
  vec2 g = d1 * (a1 * k1 * cos(s1)) + d2 * (a2 * k2 * cos(s2)) + d3 * (a3 * k3 * cos(s3));
  return vec3(y, g);
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 s = swell(wp.xz, uTime);
  wp.y += s.x;
  vW = wp.xyz; vN = normalize(vec3(-s.y, 1.0, -s.z));
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uZen; uniform vec3 uHor;
uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep;
uniform sampler2D uVH; uniform vec4 uVRect; uniform vec2 uVSize;   // valley: x0, z0 (world), fine grid size
uniform sampler2D uOH; uniform vec4 uORect;                        // outer: x0, z0, width, depth
varying vec3 vW; varying vec3 vN;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${CLOUD_SHADOW_GLSL}
float landH(vec2 xz) {
  // the live valley texture inside its rect, the static outer coast beyond, cross-faded over a few metres at the seam
  vec2 vu = (vec2((xz.y - uVRect.y) * 2.0, (xz.x - uVRect.x) * 2.0) + 0.5) / uVSize;
  float ho = texture2D(uOH, (xz - uORect.xy) / uORect.zw).r;
  vec2 e = min(vu, 1.0 - vu) * uVSize * 0.5;          // metres to the valley rect's edge
  float w = smoothstep(0.0, 8.0, min(e.x, e.y));
  float h = w > 0.0 ? mix(ho, texture2D(uVH, clamp(vu, 0.0, 1.0)).r, w) : ho;
  return ${H_LO.toFixed(1)} + h * ${H_SPAN.toFixed(1)};
}
vec2 ripple(vec2 p) { float e = 0.08, a = wsFbm(p); return vec2(wsFbm(p + vec2(e, 0.0)) - a, wsFbm(p + vec2(0.0, e)) - a) / e; }
void main() {
  float depth = vW.y - landH(vW.xz);
  if (depth < -0.05) discard;   // under the land: skip the work
  depth = max(0.0, depth);
  float t = uTime;
  vec2 g = ripple(vW.xz * 0.35 + vec2(-t * 0.09, t * 0.03)) * 0.6;
  vec2 q = vW.xz * 1.3 + vec2(t * 0.07, -t * 0.11);
  float q0 = wsNoise(q); g += vec2(wsNoise(q + vec2(0.1, 0.0)) - q0, wsNoise(q + vec2(0.0, 0.1)) - q0) * 4.0;
  vec3 N = normalize(vN + vec3(-g.x, 0.0, -g.y) * 0.11);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.6, R.y));
  float shade = wsCloudShadow(vW, uTime);
  // the water body by depth: turquoise over sand, blue, then deep ink offshore
  vec3 body = mix(uShallow, uMid, smoothstep(0.3, 4.0, depth));
  body = mix(body, uDeep, smoothstep(4.0, 16.0, depth));
  body *= (0.78 + 0.3 * clamp(dot(N, uSun), 0.0, 1.0)) * (1.0 - 0.3 * shade);
  vec3 col = mix(body, sky, clamp(fres * 0.9, 0.0, 1.0));
  // sun: a tight glitter path plus a soft sheen; cloud shade dims it
  vec3 H = normalize(uSun + V);
  float nh = clamp(dot(N, H), 0.0, 1.0);
  float glit = pow(nh, 900.0) * 6.0 * smoothstep(0.55, 0.8, wsNoise(vW.xz * 3.0 + t * 0.8));
  col += uSunCol * (glit + pow(nh, 70.0) * 0.22) * (1.0 - 0.8 * shade);
  // foam: a wet line on the sand, and bands of surf that roll in and fade over the shallows
  float n1 = wsFbm(vW.xz * 0.9 + vec2(t * 0.15, 0.0)), n2 = wsNoise(vW.xz * 2.6 - vec2(0.0, t * 0.3));
  float edge = (1.0 - smoothstep(0.0, 0.32 + 0.2 * n1, depth)) * (0.55 + 0.45 * n2);
  float band = smoothstep(0.72, 0.98, sin(depth * 4.2 + t * 1.6 + n1 * 5.0)) * (1.0 - smoothstep(0.25, 1.8, depth)) * smoothstep(0.35, 0.65, n2);
  float caps = smoothstep(0.86, 0.95, wsFbm(vW.xz * 0.22 + vec2(-t * 0.12, t * 0.02))) * smoothstep(5.0, 12.0, depth) * 0.35;
  float foam = clamp(max(edge, band * 0.85) + caps, 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (1.0 - 0.25 * shade), foam);
  float alpha = mix(0.42, 0.96, smoothstep(0.15, 5.0, depth));
  alpha = clamp(max(alpha, foam) + fres * 0.2, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface SeaRects {
  /** Plane: centre x, width (X), centre z, depth (Z). */
  plane: { x: number; w: number; z: number; d: number; segX: number; segZ: number };
  /** Valley fine height texture and its world origin (x0 = wx(0), z0 = wz(0)). */
  valley: { tex: THREE.Texture; x0: number; z0: number; FX: number; FY: number };
  /** Outer land height texture and its world rect. */
  outer: { tex: THREE.Texture; x0: number; z0: number; w: number; d: number };
}

export class SeaView {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(r: SeaRects, sunDir: THREE.Vector3, sky: { zenith: THREE.Color; horizon: THREE.Color }) {
    const P = r.plane;
    const g = new THREE.PlaneGeometry(P.w, P.d, P.segX, P.segZ);
    g.rotateX(-Math.PI / 2);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSun: { value: sunDir.clone().normalize() }, uSunCol: { value: new THREE.Color(0xfff1d6) },
      uZen: { value: sky.zenith.clone() }, uHor: { value: sky.horizon.clone() },
      uShallow: { value: new THREE.Color(0x48c9c0) }, uMid: { value: new THREE.Color(0x1984ad) }, uDeep: { value: new THREE.Color(0x0a3966) },
      uVH: { value: null }, uVRect: { value: new THREE.Vector4(r.valley.x0, r.valley.z0, 0, 0) }, uVSize: { value: new THREE.Vector2(r.valley.FX, r.valley.FY) },
      uOH: { value: null }, uORect: { value: new THREE.Vector4(r.outer.x0, r.outer.z0, r.outer.w, r.outer.d) },
    }]);
    // textures must not be cloned by UniformsUtils.merge
    this.uniforms.uVH.value = r.valley.tex; this.uniforms.uOH.value = r.outer.tex;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.position.set(P.x, SEA + 0.02, P.z);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  update(t: number): void { this.uniforms.uTime.value = t; }
}
