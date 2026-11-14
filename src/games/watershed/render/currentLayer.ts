// The rider's current marker (river blocks) and the "where the water will go" line from it to the sea.
// The marker is a glowing chevron riding the water, pointing downstream; the line is a trail of soft dots that pulse
// downhill along the steepest-descent trace (sim/flowLine.ts), so the saddle the river will take is visible ahead.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { traceFlow } from '../sim/flowLine';
import { SEA, sample } from '../sim/terrain';

const DOTS = 90;

export class CurrentLayer {
  readonly group = new THREE.Group();
  private marker = new THREE.Group(); private ripple: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  private path: Array<[number, number]> = []; private acc = 1;
  private shown = new THREE.Vector3(); private init = false;
  private m = new THREE.Matrix4(); private v = new THREE.Vector3();

  constructor(color: string, private wx: (j: number) => number, private wz: (i: number) => number) {
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 });
    // a chevron (two slanted bars) pointing downstream (+X)
    for (const side of [1, -1]) {
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 2.2, 4, 10), glow);
      bar.rotation.set(Math.PI / 2, 0, side * 0.9); bar.position.set(-0.5, 0.4, side * 0.85); bar.castShadow = true;
      this.marker.add(bar);
    }
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.marker.add(this.ripple);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85, depthWrite: false }), DOTS);
    this.dots.frustumCulled = false; this.dots.renderOrder = 4;
    this.group.add(this.marker, this.dots);
    this.group.visible = false;
  }

  update(s: WatershedSnapshot, depth: Float32Array, heightAt: (x: number, y: number) => number, dt: number, time: number): void {
    const c = s.current;
    this.group.visible = !!c;
    if (!c) { this.init = false; return; }
    const surf = (x: number, y: number) => Math.max(heightAt(x, y), SEA) + sample(depth, s.nx, s.ny, x, y) * 0.9;
    const tx = this.wx(c.y), tz = this.wz(c.x), ty = surf(c.x, c.y) + 0.3;
    // smooth, but snap when it jumps back to the spring
    if (!this.init || Math.abs(tx - this.shown.x) > 20) { this.shown.set(tx, ty, tz); this.init = true; }
    const k = 1 - Math.exp(-dt * 8);
    this.shown.x += (tx - this.shown.x) * k; this.shown.y += (ty - this.shown.y) * k; this.shown.z += (tz - this.shown.z) * k;
    this.marker.position.copy(this.shown);
    this.marker.position.y += 0.25 * Math.sin(time * 3);
    const ph = (time * 0.9) % 1;
    this.ripple.scale.setScalar(0.8 + ph * 0.8); (this.ripple.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ph);
    this.marker.scale.setScalar(c.steering ? 2 : 1.6);   // readable from the overview
    // the line: re-traced a few times a second (the ground and water change slowly)
    this.acc += dt;
    if (this.acc > 0.25) { this.acc = 0; this.path = traceFlow(s.h, depth, s.nx, s.ny, c.x, c.y, { maxSteps: 260 }); }
    const P = this.path, every = 3, flow = (time * 4) % every;
    let n = 0;
    for (let i = every; i < P.length && n < DOTS; i += every, n++) {
      const f = Math.min(P.length - 1.001, i + flow), a = Math.floor(f), u = f - a;
      const x = P[a][0] + (P[a + 1][0] - P[a][0]) * u, y = P[a][1] + (P[a + 1][1] - P[a][1]) * u;
      const fade = Math.max(0.25, 1 - n / 60);
      this.v.set(this.wx(y), surf(x, y) + 0.35, this.wz(x));
      this.m.makeScale(fade, fade, fade).setPosition(this.v);
      this.dots.setMatrixAt(n, this.m);
    }
    for (; n < DOTS; n++) { this.m.makeScale(0, 0, 0); this.dots.setMatrixAt(n, this.m); }
    this.dots.instanceMatrix.needsUpdate = true;
  }
}
