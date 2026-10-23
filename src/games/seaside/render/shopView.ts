import type { Insets } from '../../../contracts';
import type { ShopId } from '../sim/economy';
import { stillPierStand, stillShop } from '../stills/shopStill';
import type { Stage } from '../stills/stage';
import * as THREE from 'three';

/** A locked diorama, rendered only on entry / resize. All interactive paper stays in the foreground canvas. */
export class ShopDiorama {
  private stage: Stage | null = null;
  private kind: ShopId | null = null;
  private size = '';
  constructor(private canvas: HTMLCanvasElement) {}
  show(kind: ShopId, W: number, H: number, inset: Insets): void {
    const w = Math.max(1, W - inset.left - inset.right), h = Math.max(1, H - inset.top - inset.bottom);
    this.canvas.style.cssText = `position:absolute;left:${inset.left}px;top:${inset.top}px;width:${w}px;height:${h}px;pointer-events:none;display:block`;
    if (this.kind !== kind) {
      this.dispose(); this.kind = kind;
      this.stage = kind === 'shop1' ? stillShop(this.canvas, w, h) : stillPierStand(this.canvas, w, h);
      this.size = '';
    }
    const key = `${w}/${h}`;
    if (key !== this.size && this.stage) {
      const { renderer, camera, scene } = this.stage;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      camera.lookAt(-0.05, w / h < 0.8 ? 1.04 : 1.42, -2.6);
      renderer.render(scene, camera); this.size = key;
    }
  }
  hide(): void { this.canvas.style.display = 'none'; }
  dispose(): void {
    if (!this.stage) return;
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.stage.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometry.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometry.forEach((g) => g.dispose()); textures.forEach((t) => t.dispose()); materials.forEach((m) => m.dispose());
    this.stage.sun.shadow.dispose(); this.stage.renderer.dispose(); this.stage = null; this.kind = null; this.size = '';
  }
}
