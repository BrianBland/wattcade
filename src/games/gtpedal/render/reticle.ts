// Lock-on indicator: billboarded corner brackets + a small chevron, crisp dark outline, muted weapon tint.
// Constant screen size, drawn on top (depthTest off). Snaps in (shrink + un-rotate) when a new target is acquired.
import * as THREE from 'three';

const CREAM = new THREE.Color(0xf3ead8);
export const RETICLE_TINT: Record<string, number> = { bazooka: 0xd0694f, grenade: 0x8fae6e, oil: 0x8a8378, bottle: 0x7fa8b8, molotov: 0xd99a4e };
/** Acquire animation curve: 0 → 1 over `dur` s (ease-out back, slight overshoot). */
export function acquireEase(t: number, dur = 0.28): number {
  const u = Math.min(1, Math.max(0, t / dur)), c = 1.6;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

function bracketShape(w: number, h: number, arm: number, th: number): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const hx = new THREE.PlaneGeometry(arm, th); hx.translate(sx * (w / 2 - arm / 2), sy * (h / 2 - th / 2), 0); gs.push(hx);
    const vy = new THREE.PlaneGeometry(th, arm); vy.translate(sx * (w / 2 - th / 2), sy * (h / 2 - arm / 2), 0); gs.push(vy);
  }
  return mergeSimple(gs);
}
function chevron(w: number, th: number): THREE.BufferGeometry {
  const s = new THREE.Shape(); // downward-pointing V
  s.moveTo(-w / 2, 0); s.lineTo(0, -w * 0.45); s.lineTo(w / 2, 0); s.lineTo(w / 2 - th, 0); s.lineTo(0, -w * 0.45 + th * 1.2); s.lineTo(-w / 2 + th, 0); s.closePath();
  return new THREE.ShapeGeometry(s);
}
function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = []; let o = 0;
  for (const g of gs) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); const ix = g.index!; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + o); o += p.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setIndex(idx); return m;
}

export class Reticle {
  readonly group = new THREE.Group();
  private inner = new THREE.Group();
  private fill: THREE.MeshBasicMaterial; private ink: THREE.MeshBasicMaterial;
  private chev: THREE.Group;
  private last: THREE.Vector3 | null = null; private acquiredAt = -99; private shown = 0;
  constructor() {
    const mat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.fill = mat(0xffffff, 1); this.ink = mat(0x2a1c12, 0.9);
    const W = 1.0, H = 1.3, arm = 0.34, th = 0.09, ink = 0.06;
    const outline = new THREE.Mesh(bracketShape(W + ink * 2, H + ink * 2, arm + ink * 2, th + ink * 2), this.ink); outline.renderOrder = 998;
    const brackets = new THREE.Mesh(bracketShape(W, H, arm, th), this.fill); brackets.renderOrder = 999;
    this.chev = new THREE.Group();
    const cO = new THREE.Mesh(chevron(0.42 + ink * 2.5, th + ink * 2), this.ink); cO.renderOrder = 998; cO.position.y = ink * 1.2;
    const cF = new THREE.Mesh(chevron(0.42, th), this.fill); cF.renderOrder = 999;
    this.chev.add(cO, cF); this.chev.position.y = H / 2 + 0.38;
    this.inner.add(outline, brackets, this.chev);
    this.group.add(this.inner); this.group.visible = false;
  }
  /** target: world point at the body's centre (null = no lock). sizeM: body height to frame. */
  update(cam: THREE.Camera, target: THREE.Vector3 | null, sizeM: number, weapon: string, t: number, dt: number) {
    if (target && (!this.last || this.last.distanceTo(target) > 2.5)) this.acquiredAt = t;
    this.last = target ? target.clone() : null;
    this.shown += ((target ? 1 : 0) - this.shown) * (1 - Math.exp(-(target ? 18 : 10) * dt));
    this.group.visible = this.shown > 0.02;
    if (!target) return;
    this.group.position.copy(target);
    this.group.quaternion.copy(cam.quaternion);
    // constant-ish screen size, but never smaller than the body it frames
    const dist = cam.position.distanceTo(target);
    const base = Math.max(sizeM / 1.3, dist * 0.085);
    const e = acquireEase(t - this.acquiredAt);
    const pulse = 1 + 0.035 * Math.sin(t * 5);
    this.inner.scale.setScalar(base * (1 + 1.3 * (1 - e)) * pulse);
    this.inner.rotation.z = (1 - Math.min(1, e)) * Math.PI / 4;
    this.chev.position.y = 1.3 / 2 + 0.38 + Math.sin(t * 5) * 0.04;
    const tint = new THREE.Color(RETICLE_TINT[weapon] ?? 0xd0694f).lerp(CREAM, 0.4);
    this.fill.color.copy(tint).lerp(CREAM, Math.max(0, 1 - (t - this.acquiredAt) / 0.15) * 0.8); // white flash on lock
    this.fill.opacity = this.shown; this.ink.opacity = 0.9 * this.shown;
  }
}
