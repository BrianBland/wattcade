import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Bloom + a "lens" pass: chromatic aberration that kicks on beats, a red hit flash at the edges, vignette, scanlines, grain. */
const LENS = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAberr: { value: 0.0015 }, uHurt: { value: 0 }, uGray: { value: 0 }, uTime: { value: 0 }, uVignette: { value: 0.9 }, uScan: { value: 0.05 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uAberr; uniform float uHurt; uniform float uGray; uniform float uTime; uniform float uVignette; uniform float uScan;
varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  // underpowered: the signal fails — torn scanline bands slip sideways, colour drains to grey, noise and dark creep in
  float tear = step(1.0 - 0.12 * uGray * uGray, rnd(vec2(floor(uv.y * 48.0), floor(uTime * 14.0))));
  uv.x += tear * (rnd(vec2(floor(uv.y * 48.0), 3.0)) - 0.5) * 0.06 * uGray;
  vec2 d = uv - 0.5; float r = length(d);
  vec2 off = d * (uAberr + 0.006 * uGray) * (1.0 + 4.0 * r);
  vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(luma) * (1.0 - 0.35 * uGray), min(1.0, uGray * 1.1));
  c *= 1.0 - (uScan + 0.25 * uGray) * (0.5 + 0.5 * sin(vUv.y * 900.0));
  c += (rnd(vUv * 731.0) - 0.5) * (0.035 + 0.12 * uGray);
  c *= mix(1.0, (1.0 - smoothstep(0.2, 0.85, r)), uVignette * (0.55 + 0.4 * uGray));
  c = mix(c, vec3(1.0, 0.05, 0.1), uHurt * smoothstep(0.25, 0.75, r) * 0.7);
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}`,
};

export class Post {
  readonly composer: EffectComposer; readonly bloom: UnrealBloomPass; private lens: ShaderPass;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(400, 300), 0.8, 0.45, 0.55);
    this.composer.addPass(this.bloom);
    this.lens = new ShaderPass(LENS);
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  set(o: { bloom: number; aberr: number; hurt: number; time: number; gray?: number }) {
    this.bloom.strength = o.bloom;
    const u = this.lens.uniforms as typeof LENS.uniforms;
    u.uAberr.value = o.aberr; u.uHurt.value = o.hurt; u.uTime.value = o.time; u.uGray.value = o.gray ?? 0;
  }
  render() { this.composer.render(); }
  dispose() { for (const pass of this.composer.passes) pass.dispose(); this.composer.dispose(); }
}
