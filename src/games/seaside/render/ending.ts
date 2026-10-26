// The ending over the coast world (#195), posed from the director (render/endingShots.ts). The Cliff: first person off
// the bend and over the drop, the road curving back under, Lou's open car coming up it with its headlights on and Lou
// waving up at you as it passes beneath. The Angel: the camera eases out behind a voxel rider (neutral kit, the same
// grey gloves you've been looking at all ride) with two great white wings and the faint ring of a halo, climbing into
// the sunset; then the white bird over the morning sea.
import * as THREE from 'three';
import type { SeasideSnapshot } from '../sim/types';
import { addGrid } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { buildBike, KIT } from '../world/rider';
import { buildLou, louArm, LOU } from '../world/lou';
import { disposeSet } from './dispose';
import { addGlow } from '../stills/later/kit';
import { buildWing } from './flight';
import { buildBird, MORNING_PAL } from './morning';
import { EVENING } from './flightShots';
import { endingShot, type EndingShot } from './endingShots';
import type { WorldView } from './worldView';

const NONE = { cast: false, receive: false };

/** The rider's kit: neutral greys (the gloves and warmers are the first-person ones), a pale helmet. */
const RIDER = definePalette({
  glove: 0x6a707a, gloveTop: 0xa9b0b9, warmer: 0x3b4150, jersey: 0x8a919c, jersey2: 0x6f7682, shorts: 0x2a2d33,
  skin: 0xc98f6b, helmet: 0xeef0f2, helmet2: 0xc9ced5, vent: 0x2b2e34, shoe: 0x2a2c30, sock: 0xe8e6e0,
});
const R = RIDER.idx;
const CAR = definePalette({
  body: 0x3a6ea8, body2: 0x2f5c8f, chrome: 0xd9dde2, tyre: 0x1d1e20, hub: 0xb8bec4, seat: 0xc8a27a, seat2: 0xb08a62, dash: 0x2b2420, glass: 0x9fc3d6,
});
const C = CAR.idx;
/** Legs: frames through one crank turn (one set per side, swapped as the crank turns). */
const LEG_FRAMES = 8;
const CRANK = { bb: [0, 0.3, 0] as const, r: 0.17 };

/** One leg (side `sx`) with the crank at angle `a` (0 = forward, turning down): hip → knee → foot on the pedal. */
function buildLeg(sx: number, a: number): VoxelGrid {
  const g = new VoxelGrid(0.025), hip = [sx * 0.1, 1.04, 0.12];
  const foot = [sx * 0.12, CRANK.bb[1] + Math.sin(-a) * CRANK.r, CRANK.bb[2] - Math.cos(a) * CRANK.r];
  // two-bone IK in the y–z plane, the knee bent forward (−z)
  const T = 0.46, S = 0.45, dy = foot[1] - hip[1], dz = foot[2] - hip[2], d = Math.min(T + S - 0.01, Math.hypot(dy, dz));
  const al = Math.acos(Math.max(-1, Math.min(1, (T * T + d * d - S * S) / (2 * T * d)))), uy = dy / Math.hypot(dy, dz), uz = dz / Math.hypot(dy, dz);
  const turn = (a2: number) => [uy * Math.cos(a2) - uz * Math.sin(a2), uy * Math.sin(a2) + uz * Math.cos(a2)];
  const [k1, k2] = [turn(al), turn(-al)], kk = k1[1] < k2[1] ? k1 : k2;
  const knee = [sx * 0.11, hip[1] + kk[0] * T, hip[2] + kk[1] * T];
  g.wsegment(hip, knee, 0.075, R.shorts);
  g.wsegment(knee, [(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2, (knee[2] + foot[2]) / 2], 0.055, R.skin);
  g.wsegment([(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2, (knee[2] + foot[2]) / 2], [foot[0], foot[1] + 0.06, foot[2] + 0.03], 0.045, R.sock);
  g.wellipsoid([foot[0], foot[1] + 0.03, foot[2] - 0.04], [0.045, 0.04, 0.12], R.shoe);
  return g;
}

/** The rider from the hips up, on the bike's saddle with hands on the hoods (faces −z; wheels touch y = 0). */
function buildRider(): VoxelGrid {
  const g = new VoxelGrid(0.025);
  g.wellipsoid([0, 1.1, 0.13], [0.17, 0.12, 0.16], R.shorts);
  g.wsegment([0, 1.13, 0.1], [0, 1.35, -0.18], 0.15, R.jersey);
  g.wellipsoid([0, 1.33, -0.17], [0.2, 0.11, 0.16], (x) => (Math.abs(x * g.size) < 0.04 ? R.jersey2 : R.jersey));
  for (const s of [1, -1]) {
    const sh = [s * 0.19, 1.37, -0.21], el = [s * 0.22, 1.13, -0.36], hand = [s * 0.2, 0.96, -0.54];
    g.wellipsoid(sh, [0.08, 0.07, 0.08], R.jersey);
    g.wsegment(sh, [(sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, (sh[2] + el[2]) / 2], 0.055, R.jersey2);
    g.wsegment([(sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, (sh[2] + el[2]) / 2], el, 0.048, R.warmer);
    g.wsegment(el, hand, 0.042, R.warmer);
    g.wellipsoid(hand, [0.045, 0.04, 0.055], (_x, y) => (y * g.size > 0.98 ? R.gloveTop : R.glove));
  }
  g.wellipsoid([0, 1.44, -0.3], [0.05, 0.05, 0.05], R.skin);
  g.wellipsoid([0, 1.5, -0.35], [0.1, 0.11, 0.11], R.skin);
  // the helmet, vents running front to back
  g.wellipsoid([0, 1.56, -0.34], [0.125, 0.1, 0.16], (x, y) => (y * g.size < 1.5 ? R.helmet2 : Math.abs(x * g.size) % 0.06 < 0.016 && y * g.size > 1.58 ? R.vent : R.helmet));
  return g;
}

/** Lou's old convertible, top down: nose +z, wheels on y = 0. Its lamps are separate (they glow). */
function buildCar(): VoxelGrid {
  const g = new VoxelGrid(0.05);
  g.wbox([-0.9, 0.32, -2.2], [0.9, 0.8, 2.25], C.body);
  g.wbox([-0.92, 0.55, -2.25], [0.92, 0.62, 2.3], C.body2); // the swage line
  for (const z of [-2.3, 2.32]) g.wbox([-0.95, 0.3, z - 0.06], [0.95, 0.42, z + 0.06], C.chrome); // bumpers
  // the open cabin: a hollow with bench seats, a dash and the windscreen frame
  g.wbox([-0.78, 0.55, -1.0], [0.78, 0.85, 0.62], 0);
  g.wbox([-0.78, 0.45, -1.0], [0.78, 0.6, 0.62], C.seat2);
  for (const z of [-0.95, 0.0]) g.wbox([-0.78, 0.6, z], [0.78, 1.05, z + 0.16], C.seat);
  g.wbox([-0.8, 0.8, 0.62], [0.8, 0.95, 0.85], C.dash);
  g.wbox([-0.82, 0.95, 0.8], [-0.76, 1.32, 0.86], C.chrome); g.wbox([0.76, 0.95, 0.8], [0.82, 1.32, 0.86], C.chrome);
  g.wbox([-0.82, 1.3, 0.8], [0.82, 1.36, 0.86], C.chrome);
  g.wbox([-0.76, 0.95, 0.82], [0.76, 1.3, 0.84], C.glass);
  // the steering wheel on the driver's side (+x is his left)
  for (let a = 0; a < Math.PI * 2; a += 0.15) g.wellipsoid([0.38 + Math.cos(a) * 0.17, 1.0 + Math.sin(a) * 0.17 * 0.8, 0.5 - Math.sin(a) * 0.17 * 0.5], [0.025, 0.025, 0.025], C.dash);
  for (const x of [-0.82, 0.82]) for (const z of [-1.45, 1.45]) {
    g.wellipsoid([x, 0.32, z], [0.12, 0.32, 0.32], C.tyre);
    g.wellipsoid([x + Math.sign(x) * 0.08, 0.32, z], [0.04, 0.15, 0.15], C.hub);
  }
  return g;
}

export class EndingSet {
  private root = new THREE.Group();
  private rider = new THREE.Group();
  private legs: THREE.Group[][] = [[], []];
  private wings: Array<{ pivot: THREE.Group; sx: number }> = [];
  private halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private car = new THREE.Group();
  private arm = new THREE.Group();
  private bird = new THREE.Group();

  constructor(private view: WorldView) {
    const st = view.stage;
    // the rider: bike, body, legs (a frame per crank angle), wings at the shoulder blades, the halo
    const bike = new VoxelGrid(0.025); buildBike(bike, [0, 0, 0], 0);
    addGrid(st, 'angel bike', bike, { palette: KIT.linear, jitter: 0.02 }, this.rider, NONE);
    addGrid(st, 'angel', buildRider(), { palette: RIDER.linear, jitter: 0.02 }, this.rider, NONE);
    [1, -1].forEach((sx, side) => {
      for (let f = 0; f < LEG_FRAMES; f++) {
        const g = new THREE.Group();
        addGrid(st, `leg ${sx} ${f}`, buildLeg(sx, (f / LEG_FRAMES) * Math.PI * 2 + (side ? Math.PI : 0)), { palette: RIDER.linear, jitter: 0.02 }, g, NONE);
        g.visible = false; this.rider.add(g); this.legs[side].push(g);
      }
    });
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.1, 1.36, -0.08);
      addGlow(st, 'angel wing', buildWing(sx, 3.4), 1.12, pivot); // unlit: white against the sun, a little glow
      this.rider.add(pivot); this.wings.push({ pivot, sx });
    }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.011, 6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1c2).multiplyScalar(1.6), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.rotation.x = Math.PI / 2; this.halo.position.set(0, 1.76, -0.34);
    this.rider.add(this.halo);
    // a soft fill from behind (the sun is ahead of you): the kit reads against it
    const fill = new THREE.PointLight(0xffd6b0, 6, 9, 1.2); fill.position.set(0, 2.4, 2.6); this.rider.add(fill);
    this.rider.rotation.order = 'YXZ'; this.rider.visible = false;
    // Lou's car, Lou at the wheel (one hand on it, the other waving), its lamps lit
    addGrid(st, 'lou car', buildCar(), { palette: CAR.linear, jitter: 0.03 }, this.car, { cast: true, receive: false });
    const k = 0.85, lou = new THREE.Group();
    addGrid(st, 'lou driving', buildLou({ pose: 'wave', scale: k, voxel: 0.03 }), { palette: LOU.linear, jitter: 0.03 }, lou, NONE);
    lou.position.set(0.38, 0.55 - 0.8 * k, 0.04); this.car.add(lou);
    addGrid(st, 'lou arm', louArm({ scale: 1.3, voxel: 0.025 }), { palette: LOU.linear, jitter: 0.03 }, this.arm, NONE);
    this.arm.position.set(0.38 + 0.27 * k, 0.55 - 0.8 * k + 1.44 * k, 0.04); this.car.add(this.arm);
    const lamp = (color: number, k2: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k2), fog: false });
    for (const x of [-0.62, 0.62]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.08), lamp(0xfff2d0, 3)); h.position.set(x, 0.62, 2.27); this.car.add(h);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), lamp(0xff3020, 2)); b.position.set(x, 0.62, -2.24); this.car.add(b);
    }
    this.car.visible = false;
    // the morning's white bird
    addGrid(st, 'last bird', buildBird(), { palette: MORNING_PAL.linear, jitter: 0.02 }, this.bird, NONE);
    this.bird.visible = false; this.bird.scale.setScalar(2.6);
    this.root.add(this.rider, this.car, this.bird);
    st.scene.add(this.root);
  }

  /** Pose and render one frame. `t` = story clock (s), `cadence` from the bike. */
  frame(snap: SeasideSnapshot, t: number, _dt: number, cadence: number): EndingShot | null {
    const shot = endingShot(snap);
    if (!shot) return null;
    const fx = shot.fx, evening = fx.morning === null;
    this.props(shot, t, cadence);
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye: shot.eye, aim: shot.target,
      bars: shot.bars, cadence: cadence || 70, atmos: evening ? { ...EVENING, density: EVENING.density * (1 + 0.5 * fx.high) } : undefined });
    return shot;
  }

  private props(shot: EndingShot, t: number, cadence: number) {
    const fx = shot.fx, r = fx.rider;
    // the rider, third person only
    this.rider.visible = fx.third > 0 && fx.morning === null;
    if (this.rider.visible) {
      this.rider.position.set(r.at.x, r.at.y, r.at.z);
      this.rider.rotation.set(r.pitch * 0.6, r.yaw, 0);
      const crank = ((t * (cadence || 70)) / 60) % 1, f = Math.floor(crank * LEG_FRAMES) % LEG_FRAMES;
      this.legs.forEach((side) => side.forEach((g, i) => { g.visible = i === f; }));
      const beat = Math.sin(t * Math.PI * 2 * 0.45);
      for (const w of this.wings) w.pivot.rotation.set(0.25 + beat * 0.08, -w.sx * 0.25, w.sx * (beat * 0.28 - 0.42));
      this.halo.material.opacity = 0.32 + 0.1 * Math.sin(t * 1.3);
    }
    // Lou's car up the road, Lou waving
    this.car.visible = !!fx.car;
    if (fx.car) {
      this.car.position.set(fx.car.at.x, fx.car.at.y, fx.car.at.z); this.car.rotation.y = fx.car.yaw;
      this.arm.rotation.set(0, 0, 0.25 + 0.4 * Math.sin(t * Math.PI * 2 * 1.6));
    }
    // the last shot: far out over the morning sea, gliding west
    this.bird.visible = fx.morning !== null;
    if (fx.morning !== null) {
      const u = fx.morning, e = shot.eye, fwd = new THREE.Vector3(shot.target.x - e.x, 0, shot.target.z - e.z).normalize();
      const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this.bird.position.set(e.x, e.y + 30 + 6 * u + Math.sin(t * 0.9) * 0.5, e.z).addScaledVector(fwd, 300).addScaledVector(left, -40 + 160 * u);
      this.bird.rotation.set(Math.sin(t * 0.7) * 0.08, Math.atan2(-left.z, left.x), 0);
    }
  }

  dispose(): void { disposeSet(this.root); }
}
