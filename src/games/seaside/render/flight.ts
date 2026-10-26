// Chapter 3c over the coast world (#194), posed from the director (render/flightShots.ts). Re-entry: the planet below
// in camera space, the air igniting, fire streaming outward from the centre of view past the frame, a plasma bloom
// under the front wheel, the camera shaking, the wings tearing out and beating as the sprint goes on; then the cloud
// deck rushing past (white) and out under it, high over the evening coast. The wings: they beat with your cadence
// (each downstroke is the trainer's pulse), banking rolls the view, a ribbon of air streams ahead along the line of
// flight, a cypress on the cliff edge passes just under you, and the wings fold away as you touch down.
import * as THREE from 'three';
import type { SeasideSnapshot } from '../sim/types';
import { ribbonAt } from '../sim/flight';
import { addGlow, addLit, L, Particles, rnd, wob } from '../stills/later/kit';
import { VoxelGrid } from '../voxel/grid';
import { disposeSet } from './dispose';
import { earthTextures } from './gate';
import { cypressAt, EVENING, FLIGHT_S0, flightShot, glideAt, WINGS_LEN, type FlightShot } from './flightShots';
import type { WorldView } from './worldView';

const NONE = { cast: false, receive: false };
const STREAKS = 160, RIBBON = 220, PUFFS = 70;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)).getHex();

/** A wing: a fan of long primary feathers sweeping up and out from the shoulder (camera space, `sx` = side). */
function buildWing(sx: number): VoxelGrid {
  const g = new VoxelGrid(0.012);
  for (let f = 0; f < 8; f++) {
    const ang = 0.15 + f * 0.17, len = 0.42 + (f < 5 ? f * 0.05 : (8 - f) * 0.05);
    const tip = [sx * Math.cos(ang) * len * 0.75, Math.sin(ang) * len, -0.12 - f * 0.012];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, w = 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.008;
      g.wellipsoid([tip[0] * t, tip[1] * t, tip[2] * t], [w, w, 0.008], t > 0.85 ? L.feather3 : f % 2 ? L.feather : L.feather2);
    }
  }
  return g;
}

/** A Monterey cypress on the cliff edge: a leaning trunk and flat, wind-combed tiers of dark crown (landward = +x). */
function buildCypress(h: number): VoxelGrid {
  const g = new VoxelGrid(0.25);
  g.wsegment([0, 0, 0], [0.6, h * 0.45, 0.2], 0.45, L.bark);
  g.wsegment([0.6, h * 0.45, 0.2], [1.8, h * 0.75, -0.3], 0.32, L.bark2);
  g.wsegment([0.6, h * 0.45, 0.2], [-0.8, h * 0.68, 0.6], 0.25, L.bark2);
  for (let i = 0; i < 7; i++) {
    const y = h * (0.62 + 0.06 * i), r = 2.6 + 1.4 * Math.sin(1.1 + i * 0.5);
    g.wellipsoid([1.2 + 0.5 * i, y, (rnd(i, 1, 41) - 0.5) * 1.5], [r, 0.7, r * 0.8], i % 2 ? L.leafDark : L.jungle3);
  }
  g.wellipsoid([2.2, h - 0.6, 0], [3.4, 0.6, 2.6], L.leafDark);
  return g;
}

export class FlightSet {
  private root = new THREE.Group();
  private fx = new THREE.Group();
  private earth = new THREE.Group();
  private streaks: Particles; private ribbon: Particles; private puffs: Particles;
  private plasma: THREE.Group;
  private wings: Array<{ pivot: THREE.Group; sx: number }>;
  private wingLight = new THREE.PointLight(0xff8a3a, 0, 3, 1);
  private cypress = new THREE.Group();

  constructor(private view: WorldView) {
    const st = view.stage;
    st.camera.add(this.fx);
    // the planet, in camera space below and ahead
    const tex = earthTextures(), mat = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ fog: false, ...o });
    const ground = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), mat({ map: tex.ground }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.01, 64, 40), mat({ map: tex.clouds, transparent: true }));
    const air = new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 40), mat({ color: 0x5ab8ff, transparent: true, opacity: 0.4, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ground.rotation.set(0.9, 1.6, 0.3); clouds.rotation.copy(ground.rotation);
    clouds.material.depthWrite = false;
    [ground, clouds, air].forEach((m) => { m.frustumCulled = false; }); // depth-tested: in front of the sky, behind the bars
    this.earth.add(ground, clouds, air);
    this.fx.add(this.earth);
    // fire streaking past, the plasma bloom under the front wheel, cloud puffs rushing by
    this.streaks = new Particles(st, STREAKS, { intensity: 2.6, parent: this.fx });
    this.puffs = new Particles(st, PUFFS, { lit: true, parent: this.fx });
    const plasma = new VoxelGrid(0.012);
    plasma.wellipsoid([0, -0.46, -0.92], [0.17, 0.04, 0.09], L.fire3);
    plasma.wellipsoid([0, -0.47, -0.94], [0.26, 0.05, 0.13], L.fire2);
    this.plasma = addGlow(st, 'plasma', plasma, 2.6, this.fx);
    this.wings = [-1, 1].map((sx) => {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.34, -0.32, -0.5); this.fx.add(pivot);
      addLit(st, 'wing', buildWing(sx), 0.04, NONE, pivot);
      return { pivot, sx };
    });
    this.wingLight.position.set(0, -0.5, -0.8); this.fx.add(this.wingLight);
    // the ribbon of air (world space), the cypress
    this.ribbon = new Particles(st, RIBBON, { intensity: 1.8, parent: this.root });
    const c = cypressAt();
    addLit(st, 'cypress', buildCypress(11), 0.06, { cast: true, receive: true }, this.cypress);
    this.cypress.position.set(c.x, c.y - 0.3, c.z);
    const r0 = glideAt(0.9), r1 = glideAt(0.96); // crown combed landward, along the glide's last swing in
    this.cypress.rotation.y = Math.atan2(-(r1.z - r0.z), r1.x - r0.x) + Math.PI / 2;
    this.root.add(this.cypress);
    st.scene.add(this.root);
  }

  /** Pose and render one frame. `t` = story clock (s), `cadence` from the bike. */
  frame(snap: SeasideSnapshot, t: number, _dt: number, cadence: number): FlightShot | null {
    const shot = flightShot(snap, t);
    if (!shot) return null;
    const fx = shot.fx, re = fx.reentry;
    this.view.showWorld(fx.terrain);
    // atmosphere: space (black, the fire's glow at the horizon) → the evening coast
    const e = fx.evening, glow = re ? re.fire * 0.3 : 0;
    const space = { zenith: 0x02030a, horizon: mixHex(0x0a1030, 0xc8501a, glow), fog: 0x000000 };
    const eve = { zenith: EVENING.zenith, horizon: EVENING.horizon, fog: EVENING.fog };
    const atmos = {
      zenith: mixHex(space.zenith, eve.zenith, e), horizon: mixHex(space.horizon, eve.horizon, e), fog: mixHex(space.fog, eve.fog, e),
      density: lerp(0, EVENING.density, e), sunColor: EVENING.sunColor, sunI: lerp(2.6, EVENING.sunI, e), hemiI: lerp(0.5, EVENING.hemiI, e),
    };
    // shake: the eye jitters and rolls while the air burns
    const sh = fx.shake, eye = { x: shot.eye.x + wob(t * 1.7, 1) * sh * 0.4, y: shot.eye.y + wob(t * 2.1, 2) * sh * 0.3, z: shot.eye.z + wob(t * 1.3, 3) * sh * 0.4 };
    this.props(shot, snap, t);
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye, aim: shot.target,
      bars: shot.bars, cadence: cadence || 86, atmos, roll: fx.roll + wob(t * 2.7, 4) * sh * 0.03 });
    return shot;
  }

  private props(shot: FlightShot, snap: SeasideSnapshot, t: number) {
    const fx = shot.fx, re = fx.reentry, w = fx.wings;
    // the planet below until the clouds; it swells as you fall
    this.earth.visible = !!re && !fx.terrain;
    if (re) {
      const k = clamp01(snap.scene.progress * 1.3), R = lerp(70, 140, k);
      this.earth.position.set(0, -R * 1.02 - 6, -R * 0.55 - 40);
      this.earth.scale.setScalar(R); this.earth.rotation.y = t * 0.01;
    }
    // fire: streaks born near the centre race outward and back past the frame (fewer as it dies)
    const fire = re?.fire ?? 0, n = Math.round(STREAKS * fire);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const life = 0.45 + rnd(i, 0, 160) * 0.3, born = rnd(i, 1, 160) * life, gen = Math.floor((t - born) / life), u = ((t - born) % life + life) % life / life;
      const a = rnd(i, gen, 161) * Math.PI * 2;
      if (Math.abs(Math.cos(a)) > 0.8 && rnd(i, gen, 162) < 0.5) continue; // thinner over the wings
      const r = 0.45 + u * 0.9, len = (0.12 + 0.35 * u) * (0.7 + 0.3 * (re?.effort || 1)), z = -1.3 + u * 0.7;
      const col = rnd(i, gen, 163) < 0.33 ? L.fire3 : rnd(i, gen, 164) < 0.5 ? L.fire2 : L.fire;
      this.streaks.set(m++, [Math.cos(a) * r * 1.6, Math.sin(a) * r, z], [len, 0.008 + 0.01 * rnd(i, gen, 165), 0.01], col, [0, 0, Math.atan2(Math.sin(a), Math.cos(a) * 1.6)]);
    }
    this.streaks.commit(m);
    this.plasma.visible = fire > 0.02;
    this.plasma.scale.set((1 + 0.15 * wob(t * 3, 4)) * fire, (1 + 0.3 * Math.abs(wob(t * 5, 5))) * fire, Math.max(0.01, fire));
    this.wingLight.intensity = 4 * fire;
    // the cloud deck: puffs rushing at you
    const cl = re?.cloud ?? 0;
    let q = 0;
    if (cl > 0.02) for (let i = 0; i < PUFFS; i++) {
      const life = 0.7 + rnd(i, 2, 170) * 0.4, u = ((t + rnd(i, 3, 170) * life) % life) / life, a = rnd(i, Math.floor(t / life), 171) * Math.PI * 2, r = 1 + rnd(i, 5, 170) * 4;
      if (rnd(i, 6, 170) > cl) continue;
      const sz = 0.4 + rnd(i, 7, 170) * 0.9;
      this.puffs.set(q++, [Math.cos(a) * r, Math.sin(a) * r * 0.7, -30 + u * 31], [sz * 1.6, sz * 0.7, sz * 1.2], i % 3 ? L.cloud : L.cloud2);
    }
    this.puffs.commit(q);
    // wings: re-entry grows them (beating hard against the air); the glide beats them with your cadence
    const spread = fx.spread;
    for (const wg of this.wings) {
      const p = wg.pivot, sx = wg.sx;
      p.visible = spread > 0.02;
      if (!p.visible) continue;
      let beat: number;
      if (w) beat = Math.cos(2 * Math.PI * w.flap); // 1 at the top of the stroke, down through the pulse
      else beat = Math.sin(t * Math.PI * 2 * 1.4) * (0.6 + 0.4 * fire);
      const fold = 1 - spread;
      p.scale.setScalar(0.2 + 0.8 * spread);
      p.rotation.set(beat * 0.12 - fold * 0.6, -sx * beat * 0.1, sx * (beat * 0.35 * spread - 0.5 * spread + fold * 1.1)); // held out to the sides
    }
    // the ribbon of air: streaks streaming ahead along its line, bright when you're in it, fading as you line up to land
    let k = 0;
    if (w && w.align < 0.98) {
      const p0 = snap.scene.progress, span = 340 / WINGS_LEN, on = w.inRibbon ? 1 : 0.55;
      for (let i = 0; i < RIBBON; i++) {
        if (rnd(i, 9, 180) > on * (1 - w.align)) continue;
        const u = (rnd(i, 1, 180) + t * 0.05) % 1, pp = p0 + 25 / WINGS_LEN + u * span;
        if (pp > 1) continue;
        const half = 7, jx = (rnd(i, 2, 180) - 0.5) * 2 * half, jy = (rnd(i, 3, 180) - 0.5) * 5 + Math.sin(pp * 40 + i) * 0.8;
        const a = glideAt(pp, ribbonAt(pp) + jx), b = glideAt(pp + 4 / WINGS_LEN, ribbonAt(pp + 4 / WINGS_LEN) + jx);
        const len = 2.5 + rnd(i, 4, 180) * 5, yaw = Math.atan2(b.x - a.x, b.z - a.z);
        const col = rnd(i, 5, 180) < 0.5 ? L.feather3 : rnd(i, 6, 180) < 0.5 ? L.star : L.spark;
        this.ribbon.set(k++, [a.x, a.y + jy, a.z], [0.22, 0.22, len], col, [0, yaw, 0]);
      }
    }
    this.ribbon.commit(k);
    this.cypress.visible = !re && shot.s > FLIGHT_S0 + 0.5 * WINGS_LEN;
  }

  dispose(): void {
    this.view.showWorld(true);
    disposeSet(this.fx, this.root);
  }
}
