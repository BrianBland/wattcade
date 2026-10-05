import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const TRAIL = 48;

/**
 * The anti-grav craft: hull + neon edges, engine glow, a pool of light on the track, a ribbon trail.
 * Reacts to the game: absorbing a block flashes it in that colour and kicks the glow; a grey hit knocks it back,
 * flashes red and pops a shield bubble; dropout ghosts it; Overdrive turns it pink and hot.
 */
export class Craft {
  readonly group = new THREE.Group();     // positioned on the track by the renderer
  private ship = new THREE.Group();       // local offsets (knockback, bob)
  private body: THREE.MeshBasicMaterial; private edge: THREE.LineBasicMaterial;
  private glow: THREE.Sprite; private under: THREE.Sprite; private bubble: THREE.Mesh;
  private trail: THREE.Mesh; private trailPos = new Float32Array(TRAIL * 4 * 3); private trailCol = new Float32Array(TRAIL * 4 * 4); private trailInit = false;
  private base: THREE.Color; private flashC = new THREE.Color(); private flash = 0; private kick = 0; private hurt = 0; private knock = 0;
  private tmp = new THREE.Vector3(); private col = new THREE.Color();
  constructor(color: string) {
    this.base = new THREE.Color(color);
    this.body = new THREE.MeshBasicMaterial({ color: this.base.clone().multiplyScalar(0.3), transparent: true });
    const hull = new THREE.ConeGeometry(0.95, 3.4, 4, 1); hull.rotateX(-Math.PI / 2); hull.rotateZ(Math.PI / 4); hull.scale(1.25, 0.35, 1);
    const wing = new THREE.BoxGeometry(3.6, 0.12, 0.9); wing.translate(0, -0.05, 0.9);
    const fin = new THREE.BoxGeometry(0.1, 0.7, 1.1); fin.translate(0, 0.35, 1.1);
    const geo = mergeGeometries([hull.toNonIndexed(), wing.toNonIndexed(), fin.toNonIndexed()])!;
    this.edge = new THREE.LineBasicMaterial({ color, transparent: true, toneMapped: false });
    const tex = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.glow.position.set(0, 0, 1.9);
    this.under = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, toneMapped: false }));
    this.under.position.set(0, -0.7, 0.2); this.under.scale.set(4.2, 1.6, 1);
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: '#ff2030', wireframe: true, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.ship.add(new THREE.Mesh(geo, this.body), new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), this.edge), this.glow, this.under, this.bubble);
    this.ship.scale.setScalar(1.3);
    this.group.add(this.ship);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    // two thin ribbons streaming from the wing tips: per row 4 verts (left in/out, right in/out)
    const idx: number[] = []; for (let i = 0; i < TRAIL - 1; i++) for (const o of [0, 2]) { const a = i * 4 + o, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
  }
  get trailMesh() { return this.trail; }

  absorb(c: THREE.Color) { this.flashC.copy(c); this.flash = 1; this.kick = Math.min(1.6, this.kick + 0.5); }
  greyHit() { this.hurt = 1; this.knock = 1; }

  /** Per frame: state, world frame (right/up/forward) and world position for the trail. */
  update(dt: number, t: number, s: { overdrive: boolean; ghost: boolean; bank: number; beat: number }, right: THREE.Vector3, up: THREE.Vector3) {
    this.flash = Math.max(0, this.flash - dt * 5); this.kick = Math.max(0, this.kick - dt * 3);
    this.hurt = Math.max(0, this.hurt - dt * 2.2); this.knock = Math.max(0, this.knock - dt * 3.5);
    const accent = s.overdrive ? this.col.set('#ff2bd6') : this.col.copy(this.base);
    if (this.flash > 0) accent.lerp(this.flashC, this.flash * 0.8);
    if (this.hurt > 0) accent.lerp(new THREE.Color('#ff1020'), this.hurt);
    this.edge.color.copy(accent).multiplyScalar(0.85 + this.flash * 0.8);
    this.body.color.copy(accent).multiplyScalar(0.18 + 0.35 * this.flash + 0.6 * this.hurt);
    const ghost = s.ghost ? 0.25 + 0.15 * Math.sin(t * 20) : 1;
    this.body.opacity = ghost; this.edge.opacity = s.ghost ? 0.45 : 1;
    (this.glow.material as THREE.SpriteMaterial).color.copy(accent);
    this.glow.scale.setScalar((s.overdrive ? 3 : 1.7) * (1 + 0.45 * this.kick + 0.2 * s.beat) * (0.92 + 0.16 * Math.random()));
    (this.under.material as THREE.SpriteMaterial).color.copy(accent); (this.under.material as THREE.SpriteMaterial).opacity = 0.22 + 0.3 * this.kick + 0.15 * s.beat;
    const bm = this.bubble.material as THREE.MeshBasicMaterial; bm.opacity = this.hurt * 0.9; this.bubble.scale.setScalar(1 + (1 - this.hurt) * 0.5); this.bubble.rotation.y = t * 3;
    // knockback: jolt back and shake sideways; bob on the hover field; bank into lane changes
    this.ship.position.set(Math.sin(t * 60) * 0.35 * this.knock, 0.12 * Math.sin(t * 3) + 0.3 * this.knock, 1.8 * this.knock);
    this.ship.rotation.set(-0.25 * this.knock, 0, s.bank + Math.sin(t * 45) * 0.2 * this.knock);
    // trail: a ribbon from the wing tips, fading out behind
    const wp = this.group.position, half = 1.9;
    if (!this.trailInit) { for (let i = 0; i < TRAIL; i++) this.writeTrail(i, wp, right, up, half); this.trailInit = true; }
    this.trailPos.copyWithin(12, 0, (TRAIL - 1) * 12);
    this.writeTrail(0, wp, right, up, half);
    for (let i = 0; i < TRAIL; i++) {
      const a = Math.pow(1 - i / TRAIL, 1.6) * (s.ghost ? 0.15 : s.overdrive ? 0.9 : 0.6);
      for (let k = 0; k < 4; k++) this.trailCol.set([accent.r * a, accent.g * a, accent.b * a, a], (i * 4 + k) * 4);
    }
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trail.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
  private writeTrail(i: number, p: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, half: number) {
    this.tmp.copy(p).addScaledVector(u, 0.05);
    const w = 0.09, out: number[] = [];
    for (const side of [-1, 1]) for (const e of [-w, w]) { const k = side * half + e; out.push(this.tmp.x + r.x * k, this.tmp.y + r.y * k, this.tmp.z + r.z * k); }
    this.trailPos.set(out, i * 12);
  }
}
