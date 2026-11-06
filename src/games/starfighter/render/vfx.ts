import * as THREE from 'three';
/**
 * Procedural particles as camera-facing instanced quads (like render/bullets.ts): one additive draw for everything that
 * glows, one alpha-blended draw for smoke. Each particle is a pure function of its effect's age, so nothing is
 * simulated or allocated per frame; callers push the particles they want this frame and `flush()` uploads them.
 *
 * Types (additive): fireball, spark streak, flash with a cross flare, shock ring, player bolt, beam segment, and a
 * flat shock ring lying in the world's horizontal plane (`shock`).
 * Alpha: smoke puff, snow flake (a soft white streak along the wind; `life` carries its opacity), and a flat dust ring
 * on the ground (`dust`). Quads stretch along a world direction projected into view space (streaks, bolts, beams), or
 * stay round when the direction is zero; the flat types ignore the direction.
 *
 * Fireballs read their colour's red channel as a heat scale (1 = fresh, lower = cooler, smaller flames), so a blast can
 * mix a white-hot core with cooler outer billows from one particle type.
 */
export const VFX = { fire: 0, spark: 1, flash: 2, ring: 3, bolt: 4, beam: 5, smoke: 6, flake: 7, shock: 8, dust: 9 } as const;
const vertex = /* glsl */ `
  attribute vec3 aCenter; attribute vec3 aDir; attribute vec2 aSize; attribute vec3 aColor; attribute vec3 aMisc; // type, life 0..1, seed
  varying vec2 vUv; varying vec3 vColor; varying vec3 vMisc;
  void main() {
    if (aMisc.x > 7.5) { // flat ring in the horizontal plane (perspective makes it an ellipse on the ground)
      gl_Position = projectionMatrix * viewMatrix * vec4(aCenter + vec3(position.x * aSize.y, 0.0, position.y * aSize.x), 1.0);
      vUv = position.xy * 2.0; vColor = aColor; vMisc = aMisc; return;
    }
    vec4 c = viewMatrix * vec4(aCenter, 1.0);
    vec3 dv = (viewMatrix * vec4(aDir, 0.0)).xyz; vec2 d = dot(dv.xy, dv.xy) > 1e-8 ? normalize(dv.xy) : vec2(0.0, 1.0);
    vec2 n = vec2(d.y, -d.x);
    vec2 off = d * position.y * aSize.x + n * position.x * aSize.y;
    gl_Position = projectionMatrix * (c + vec4(off, 0.0, 0.0));
    vUv = position.xy * 2.0; vColor = aColor; vMisc = aMisc;
  }`;
const noise = /* glsl */ `
  float vh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(vh(i),vh(i+vec2(1,0)),f.x),mix(vh(i+vec2(0,1)),vh(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return vn(p)*0.55+vn(p*2.1)*0.3+vn(p*4.3)*0.15;}`;
const additive = /* glsl */ `
  varying vec2 vUv; varying vec3 vColor; varying vec3 vMisc; ${noise}
  // Fire colour by heat: white-hot, yellow, orange, deep red, then nothing.
  vec3 heatRamp(float h){return h>0.75?mix(vec3(1.0,0.85,0.45),vec3(1.0,0.97,0.85),(h-0.75)*4.0):h>0.45?mix(vec3(1.0,0.45,0.08),vec3(1.0,0.85,0.45),(h-0.45)/0.3):mix(vec3(0.35,0.05,0.02),vec3(1.0,0.45,0.08),h/0.45);}
  void main() {
    float type = vMisc.x, life = clamp(vMisc.y, 0.0, 1.0), seed = vMisc.z; vec2 q = vUv; float r = length(q); vec3 col;
    if (type < 0.5) { // fireball: a ragged, churning billow; hotter inside, cooling and breaking up with age
      vec2 dir = q / (r + 1e-3), s7 = vec2(seed * 7.3, seed * 3.1);
      // Domain-warped billows that roll outward as the puff ages.
      vec2 w = vec2(fbm(q * 1.6 + s7), fbm(q * 1.6 + s7 + 4.7)) - 0.5;
      float t = fbm(q * (2.4 - life * 0.6) + w * 1.6 + s7 - dir * life * 1.2);
      // Lobed silhouette: the edge radius wanders around the rim, and the puff tears apart as it cools.
      float edge = 0.78 + (fbm(dir * 1.9 + s7 * 1.7 + life * 0.7) - 0.5) * 0.7;
      float shape = smoothstep(edge, edge - 0.32, r + (t - 0.5) * 0.45) * smoothstep(0.12, 0.42, t + 0.35 - life * 0.3);
      float hs = clamp(vColor.r, 0.0, 1.5);
      float heat = hs * pow(1.0 - life, 1.15) * (1.0 - r * 0.85) + (t - 0.5) * 0.6;
      // Cooler cells go dull red rather than vanishing, which gives the ball inner structure instead of a gradient.
      col = heatRamp(clamp(heat, 0.0, 1.0)) * shape * (0.3 + 0.8 * t) * pow(1.0 - life, 0.5) * 0.5; // many puffs overlap: stay orange, not white
    } else if (type < 1.5) { // spark streak: hot head, fading tail, thin
      float along = q.y * 0.5 + 0.5, across = abs(q.x);
      col = mix(vec3(1.0, 0.95, 0.8), vColor, life) * smoothstep(1.0, 0.0, across) * along * along * (1.0 - life);
    } else if (type < 2.5) { // flash: soft glow and a brief cross flare
      float g = exp(-r * r * 3.5), rays = exp(-abs(q.x) * 16.0) * exp(-abs(q.y) * 1.6) + exp(-abs(q.y) * 16.0) * exp(-abs(q.x) * 1.6);
      col = vColor * (g + rays * 0.5) * (1.0 - life) * (1.0 - life);
    } else if (type < 3.5 || type > 7.5) { // shock ring (camera-facing or flat): a bright leading edge with a soft wake
      float k = (r - 0.82) * 12.0, wake = smoothstep(0.35, 0.82, r) * step(r, 0.82) * 0.25;
      float broken = 0.75 + 0.25 * vn(normalize(q + 1e-4) * 3.0 + seed * 11.0);
      col = vColor * (exp(-k * k) + wake) * broken * (1.0 - life) * 0.9;
    } else if (type < 4.5) { // player bolt: a capsule with a white core, coloured glow and a short tail
      float y = q.y, cap = length(vec2(q.x, max(abs(y) - 0.55, 0.0) * 2.2));
      float core = smoothstep(0.32, 0.05, cap), glow = exp(-cap * cap * 5.0), tail = smoothstep(-1.0, 0.4, y);
      col = (vec3(1.0) * core + vColor * glow * 0.8) * tail;
    } else { // beam segment: gaussian across, white core
      float x = q.x; col = (vec3(1.0) * exp(-x * x * 30.0) * 0.7 + vColor * exp(-x * x * 4.0) * 0.4) * (1.0 - life);
    }
    col = min(col, vec3(1.0)); // in range: colour survives the bloom instead of clipping to white
    if (dot(col, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }`;
const alpha = /* glsl */ `
  varying vec2 vUv; varying vec3 vColor; varying vec3 vMisc; ${noise}
  void main() {
    if (vMisc.x > 8.5) { // dust ring: a ragged brown band rolling outward over the ground
      float r = length(vUv), life = clamp(vMisc.y, 0.0, 1.0), n = fbm(vUv * 3.0 + vMisc.z * 9.0);
      float a = smoothstep(0.45, 0.85, r + (n - 0.5) * 0.3) * smoothstep(1.0, 0.82, r + (n - 0.5) * 0.2) * (1.0 - life) * (1.0 - life) * 0.55;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor * (0.8 + 0.4 * n), a); return;
    }
    if (vMisc.x > 6.5) { // snow flake: soft streak, opacity in vMisc.y
      float a = exp(-vUv.x * vUv.x * 3.0) * (1.0 - vUv.y * vUv.y) * vMisc.y;
      if (a < 0.01) discard;
      gl_FragColor = vec4(0.93, 0.96, 1.0, a); return;
    }
    // smoke: a lumpy, domain-warped billow; fire-lit from inside when young, sooty, then grey and thin as it rises
    float life = clamp(vMisc.y, 0.0, 1.0), seed = vMisc.z, r = length(vUv);
    vec2 s5 = vec2(seed * 5.1, seed * 2.7 + life * 0.8), w = vec2(fbm(vUv * 1.4 + s5), fbm(vUv * 1.4 + s5 + 3.3)) - 0.5;
    float t = fbm(vUv * 2.0 + w * 1.4 + s5), edge = 0.9 + (fbm(normalize(vUv + 1e-4) * 1.6 + seed * 6.0) - 0.5) * 0.45;
    float a = smoothstep(edge, edge - 0.6, r + (t - 0.5) * 0.6) * pow(1.0 - life, 1.4) * 0.85;
    if (a < 0.01) discard;
    float lit = (1.0 - smoothstep(0.0, 0.3, life)) * smoothstep(0.9, 0.1, r) * smoothstep(0.35, 0.7, t);
    vec3 c = mix(vec3(0.12, 0.09, 0.08), vColor, smoothstep(0.05, 0.6, life)) * (0.6 + 0.6 * t) + vec3(1.0, 0.42, 0.1) * lit * 0.9;
    gl_FragColor = vec4(c, a);
  }`;
function layer(scene: THREE.Scene, max: number, frag: string, blending: THREE.Blending, order: number) {
  const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position'));
  const attr = (n: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const A = { aCenter: attr(3), aDir: attr(3), aSize: attr(2), aColor: attr(3), aMisc: attr(3) };
  for (const [k, v] of Object.entries(A)) geo.setAttribute(k, v);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending }));
  mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
  return { mesh, geo, A, max, n: 0 };
}
const WHITE = new THREE.Color(1, 1, 1);
export function createVfx(scene: THREE.Scene) {
  const glow = layer(scene, 3072, additive, THREE.AdditiveBlending, 6), smoke = layer(scene, 2400, alpha, THREE.NormalBlending, 4);
  const put = (L: typeof glow, type: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, width: number, color: THREE.Color, life: number, seed: number) => {
    if (L.n >= L.max) return; const i = L.n++;
    L.A.aCenter.setXYZ(i, x, y, z); L.A.aDir.setXYZ(i, dx, dy, dz); L.A.aSize.setXY(i, len, width);
    L.A.aColor.setXYZ(i, color.r, color.g, color.b); L.A.aMisc.setXYZ(i, type, life, seed);
  };
  return {
    /** Start a frame. */
    begin() { glow.n = 0; smoke.n = 0; },
    /** A glowing particle (any type but smoke). Zero direction keeps it round. */
    add(type: number, x: number, y: number, z: number, len: number, width: number, color: THREE.Color, life: number, seed = 0, dx = 0, dy = 0, dz = 0) { put(glow, type, x, y, z, dx, dy, dz, len, width, color, life, seed); },
    /** A snow flake streak along (dx, dy, dz), with opacity `alpha`. */
    flake(x: number, y: number, z: number, len: number, width: number, alpha: number, dx: number, dy: number, dz: number) { put(smoke, VFX.flake, x, y, z, dx, dy, dz, len, width, WHITE, alpha, 0); },
    smoke(x: number, y: number, z: number, size: number, color: THREE.Color, life: number, seed: number) { put(smoke, VFX.smoke, x, y, z, 0, 0, 0, size, size, color, life, seed); },
    /** A flat dust ring on the ground (alpha layer), radius `r`. */
    dust(x: number, y: number, z: number, r: number, color: THREE.Color, life: number, seed: number) { put(smoke, VFX.dust, x, y, z, 0, 0, 0, r, r, color, life, seed); },
    /** Upload this frame's particles. */
    flush() {
      for (const L of [glow, smoke]) { L.geo.instanceCount = L.n; for (const a of Object.values(L.A)) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, L.n * a.itemSize); } }
    },
    counts: () => ({ glow: glow.n, smoke: smoke.n }),
    dispose() { for (const L of [glow, smoke]) { L.geo.dispose(); (L.mesh.material as THREE.Material).dispose(); scene.remove(L.mesh); } },
  };
}
/** Small seeded hash for per-particle variation (stable for an effect id). */
export const h01 = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
