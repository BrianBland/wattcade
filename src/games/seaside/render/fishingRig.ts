// The voxel fishing rig (#187, ported from the storyboard prototype `stills/ride.ts`): an articulated rod in the
// gloved hands that bends with the load, the line, bobber, ripple rings, splash bursts, and the fish leaping and
// dangling. Everything is posed from `fishPose(view, t)`, so the rig holds no animation state of its own.
import * as THREE from 'three';
import type { FishId } from '../sim/catalogue';
import type { FishingView } from '../sim/fishing';
import { addGrid, type Stage } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { buildFish, FISH_PAL } from '../world/fish';
import { buildBobber, buildRod, buildRodPiece, KIT } from '../world/rider';
import { fishPose } from './fishingPose';

export interface RigPlace {
  /** The water surface height (m). */
  waterY: number;
  /** Lateral metres for spot x = ±1; metres out for far = 0 and far = 1. */
  spread?: number; near?: number; reach?: number;
}

const NONE = { cast: false, receive: false };
const N = 7, ROD_LEN = 2.15;

export class FishingRig {
  readonly root = new THREE.Group();
  private rod = new THREE.Group();
  private joints: THREE.Group[] = [];
  private tipObj = new THREE.Object3D();
  private bendAxisCam: THREE.Vector3;
  private bendAxisLocal: THREE.Vector3;
  private bobber = new THREE.Group();
  private fishG = new THREE.Group();
  private fishKey = '';
  private fishCache = new Map<string, THREE.Group>();
  private linePts = Array.from({ length: 41 }, () => new THREE.Vector3());
  private lineGeo = new THREE.BufferGeometry();
  private line: THREE.Line;
  private rings: Array<{ grp: THREE.Group; mat: THREE.MeshLambertMaterial }>;
  private splash: THREE.InstancedMesh;
  private v = new THREE.Vector3(); private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion();

  constructor(private st: Stage) {
    const cam = st.camera;
    const dir = new THREE.Vector3(-0.3, 0.8, -1).normalize();
    addGrid(st, 'rod handle', buildRod([dir.x, dir.y, dir.z], ROD_LEN, false).grid, { palette: KIT.linear, jitter: 0.04 }, this.rod, NONE);
    const blankRoot = new THREE.Group();
    blankRoot.position.copy(dir).multiplyScalar(0.07);
    blankRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.rod.add(blankRoot);
    const PL = (ROD_LEN - 0.07) / N;
    let parent: THREE.Object3D = blankRoot;
    for (let i = 0; i < N; i++) {
      const j = new THREE.Group(); if (i) j.position.y = PL; parent.add(j); this.joints.push(j);
      const r0 = 0.011 - 0.0075 * (i / N), r1 = 0.011 - 0.0075 * ((i + 1) / N);
      addGrid(st, `rod ${i}`, buildRodPiece(PL, r0, r1, i % 2 ? PL * 0.5 : null), { palette: KIT.linear, jitter: 0.03 }, j, NONE);
      parent = j;
    }
    this.tipObj.position.y = PL; parent.add(this.tipObj);
    this.bendAxisCam = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, -1, -0.6).normalize()).normalize();
    this.bendAxisLocal = this.bendAxisCam.clone().applyQuaternion(blankRoot.quaternion.clone().invert());
    this.rod.position.set(0.15, -0.23, -0.42);
    cam.add(this.rod);

    const bob = new VoxelGrid(1 / 32); buildBobber(bob, [0, 0.1, 0], 0.22);
    addGrid(st, 'bobber', bob, { palette: KIT.linear, jitter: 0 }, this.bobber, NONE);
    this.root.add(this.bobber, this.fishG);
    this.lineGeo.setFromPoints(this.linePts);
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xf6f6f6, transparent: true, opacity: 0.9, fog: false }));
    this.line.frustumCulled = false;
    this.root.add(this.line);
    const ringG = new VoxelGrid(1 / 16);
    for (let a = 0; a < Math.PI * 2; a += 0.04) ringG.wbox([Math.cos(a) - 0.05, 0, Math.sin(a) - 0.05], [Math.cos(a) + 0.05, 0.05, Math.sin(a) + 0.05], KIT.idx.bobWhite);
    this.rings = Array.from({ length: 4 }, (_, i) => {
      const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      addGrid(st, `ring ${i}`, ringG, { palette: KIT.linear, jitter: 0 }, grp, NONE, mat);
      this.root.add(grp); return { grp, mat };
    });
    this.splash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshLambertMaterial({ color: 0xf4fbff }), 64);
    this.splash.frustumCulled = false;
    this.root.add(this.splash);
    st.scene.add(this.root);
    this.setVisible(false);
  }

  setVisible(on: boolean): void { this.root.visible = on; this.rod.visible = on; }

  private fishModel(id: FishId, len: number): THREE.Group {
    const key = `${id}:${len.toFixed(1)}`;
    let g = this.fishCache.get(key);
    if (!g) {
      g = new THREE.Group();
      addGrid(this.st, `fish ${key}`, buildFish(id, len), { palette: FISH_PAL.linear, jitter: 0.03 }, g, NONE);
      this.fishCache.set(key, g);
    }
    return g;
  }

  /** The water point for spot `x` (−1..1) at `far` (0..1), out from the camera along its flat forward. */
  water(x: number, far: number, p: RigPlace, out = new THREE.Vector3()): THREE.Vector3 {
    const cam = this.st.camera, fwd = cam.getWorldDirection(new THREE.Vector3()); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return out.copy(cam.position).addScaledVector(fwd, (p.near ?? 7) + (p.reach ?? 26) * far).addScaledVector(right, x * (p.spread ?? 9)).setY(p.waterY);
  }

  update(view: FishingView | null, t: number, place: RigPlace): void {
    this.setVisible(!!view);
    if (!view) return;
    const pose = fishPose(view, t), cam = this.st.camera;
    // rod swing + per-joint bend (more toward the tip)
    this.rod.position.y = -0.23 + (pose.rodSwing < -0.3 ? 0.05 : 0);
    this.rod.quaternion.setFromAxisAngle(this.bendAxisCam, pose.rodSwing);
    const per = 0.012 + 0.14 * pose.bend;
    this.joints.forEach((j, i) => j.quaternion.setFromAxisAngle(this.bendAxisLocal, per * (0.4 + (i / N) * 1.2)));
    cam.updateMatrixWorld(true);
    const tip = this.tipObj.getWorldPosition(new THREE.Vector3());
    const water = this.water(pose.end.x, pose.end.far, place);
    const dangle = tip.clone().add(new THREE.Vector3(0, -0.35, 0));
    const end = dangle.clone().lerp(water, pose.end.fly);
    end.y += pose.end.lift * 20;
    // fish: leaps at the water, hauled up to dangle in front of you
    this.fishG.visible = !!pose.fish && !!view.fish;
    if (pose.fish && view.fish) {
      const f = view.fish, key = `${f.id}:${f.lenM.toFixed(1)}`;
      if (key !== this.fishKey) { this.fishG.clear(); this.fishG.add(this.fishModel(f.id, f.lenM)); this.fishKey = key; }
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const hang = cam.position.clone().addScaledVector(fwd, 1.2 + f.lenM).add(new THREE.Vector3(0, -0.15 - f.lenM * 0.3, 0)).addScaledVector(side, -0.25);
      const leap = water.clone(); leap.y += pose.fish.leap * 8 * (1 - pose.fish.haul);
      this.fishG.position.lerpVectors(leap, hang, pose.fish.haul);
      this.fishG.position.y += Math.sin(pose.fish.haul * Math.PI) * 2.5;
      this.fishG.rotation.set(0, Math.atan2(fwd.x, fwd.z) + Math.PI / 2, pose.fish.roll);
      this.fishG.scale.setScalar(1.5); // read clearly at arm's length (the prototype's scale)
      end.copy(this.fishG.position); if (pose.fish.hang) end.y += f.lenM * 0.5;
    }
    this.bobber.visible = pose.bobber;
    this.bobber.position.copy(end);
    this.bobber.scale.setScalar(0.35 + 0.65 * pose.end.fly); // small in the hand, readable out on the water
    for (let i = 0; i <= 40; i++) { const k = i / 40; this.linePts[i].lerpVectors(tip, end, k); this.linePts[i].y -= Math.sin(Math.PI * k) * pose.sag; }
    this.lineGeo.setFromPoints(this.linePts);
    // rings + splashes at the water point
    const at = water;
    this.rings.forEach((r, i) => {
      const ev = pose.rings[i];
      r.grp.visible = !!ev;
      if (ev) { r.grp.position.set(at.x, place.waterY + 0.02, at.z); r.grp.scale.setScalar(0.3 + ev.age * 2.4 * ev.size); r.mat.opacity = 1 - ev.age; }
    });
    let si = 0;
    for (const sp of pose.splashes) {
      if (sp.age < 0 || sp.age > 0.9) continue;
      for (let p = 0; p < (sp.big ? 22 : 12) && si < 64; p++) {
        const a = p * 2.39, v = (sp.big ? 2.4 : 1.4) * (0.6 + ((p * 37) % 10) / 20), up = (sp.big ? 4.2 : 2.6) * (0.6 + ((p * 53) % 10) / 25);
        this.v.set(at.x + Math.cos(a) * v * sp.age, place.waterY + up * sp.age - 4.9 * sp.age * sp.age, at.z + Math.sin(a) * v * sp.age);
        if (this.v.y < place.waterY - 0.05) continue;
        this.m4.compose(this.v, this.q, new THREE.Vector3(1, 1, 1).multiplyScalar(1 - sp.age)); this.splash.setMatrixAt(si++, this.m4);
      }
    }
    this.splash.count = si; this.splash.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.st.camera.remove(this.rod); this.st.scene.remove(this.root);
  }
}
