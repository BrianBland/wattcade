import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Slow section colour grade: builds warm up, drops brighten and saturate, breaks cool and dim. Never a flash. */
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uExp: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uSat; uniform float uExp; varying vec2 vUv;
  void main() { vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); vec3 g = mix(vec3(l), c.rgb, uSat) * uTint * uExp; gl_FragColor = vec4(g, c.a); }`,
};
const MOODS: Record<string, [number, number, number, number, number]> = {
  intro: [1, 1, 1, 0.95, 0.97], verse: [1, 1, 1, 1, 1], build: [1.05, 1, 0.94, 1.05, 1.02], drop: [1.02, 1, 1.03, 1.16, 1.06], break: [0.93, 0.98, 1.07, 0.84, 0.93], outro: [0.96, 0.98, 1.04, 0.9, 0.95],
};

/**
 * Half-resolution bloom on bright additive things (bullets, lasers, beams). It switches itself off if frames run long,
 * so a slower GPU keeps the plain render instead of dropping frames.
 */
export class SquadronPost {
  private composer: EffectComposer; private bloom: UnrealBloomPass;
  private slow = 0; private last = 0; enabled = true; private gradePass: ShaderPass; private mood = [1, 1, 1, 1, 1];
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(400, 300), 0.4, 0.25, 0.97);
    this.composer.addPass(this.bloom);
    this.gradePass = new ShaderPass(GRADE); this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  /** Ease toward the current section's grade over a few seconds; intensity nudges saturation a little. */
  grade(section: string, intensity: number) {
    const target = MOODS[section] ?? MOODS.verse;
    for (let i = 0; i < 5; i++) this.mood[i] += (target[i] - this.mood[i]) * 0.012;
    const u = this.gradePass.uniforms as typeof GRADE.uniforms;
    u.uTint.value.set(this.mood[0], this.mood[1], this.mood[2]); u.uSat.value = this.mood[3] + (intensity - 0.5) * 0.08; u.uExp.value = this.mood[4];
  }
  /** `pulse` lifts bloom a touch on the bar line. */
  render(scene: THREE.Scene, camera: THREE.Camera, pulse: number, now: number) {
    if (this.last) { const ms = now - this.last; this.slow = ms > 24 ? this.slow + 1 : Math.max(0, this.slow - 2); if (this.slow > 90) this.enabled = false; }
    this.last = now;
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.bloom.strength = 0.4 + pulse * 0.1; this.composer.render();
  }
  dispose() { for (const pass of this.composer.passes) pass.dispose(); this.composer.dispose(); }
}
