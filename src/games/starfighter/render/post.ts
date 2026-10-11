import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Half-resolution bloom on bright additive things (bullets, lasers, beams). It switches itself off if frames run long,
 * so a slower GPU keeps the plain render instead of dropping frames.
 */
export class SquadronPost {
  private composer: EffectComposer; private bloom: UnrealBloomPass;
  private slow = 0; private last = 0; enabled = true;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(400, 300), 0.4, 0.25, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  /** `pulse` lifts bloom a touch on the bar line. */
  render(scene: THREE.Scene, camera: THREE.Camera, pulse: number, now: number) {
    if (this.last) { const ms = now - this.last; this.slow = ms > 24 ? this.slow + 1 : Math.max(0, this.slow - 2); if (this.slow > 90) this.enabled = false; }
    this.last = now;
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.bloom.strength = 0.4 + pulse * 0.1; this.composer.render();
  }
  dispose() { for (const pass of this.composer.passes) pass.dispose(); this.composer.dispose(); }
}
