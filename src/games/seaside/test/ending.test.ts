import { describe, expect, it } from 'vitest';
import { STORY } from '../sim/story';
import { ANGEL, angelEye, angelU, CLIFF, cliffEye, endingShot, EYE, LIFT_S, louCar, SUNWARD } from '../render/endingShots';
import { END_TITLE, endTitle, trackedXs } from '../render/layout';
import { LAND_S } from '../render/flightShots';
import { rideCam, rideSpan } from '../render/morningShots';
import { textAt } from '../world/coastBuild';
import { groundAt } from '../world/coast';
import { CH1, coastRoute, SEA_LEVEL } from '../world/coastLayout';

const ANGEL_S = STORY.find((s) => s.id === 'angel')!.planS;
const shot = (sceneId: string, progress: number) => endingShot({ sceneId, speed: 7, scene: { progress } })!;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const heading = (s: number) => { const r = coastRoute(), a = r.at(s - 5), b = r.at(s + 5); return Math.atan2(b.x - a.x, -(b.z - a.z)); };

describe('the Sunset highway and the cliff (#195)', () => {
  it('rides past Lou’s and ends where the highway turns hard right around the cliff', () => {
    const [a, b] = rideSpan('sunset')!;
    expect(a).toBe(LAND_S);
    expect(b).toBe(LIFT_S);
    expect(CH1.shop).toBeGreaterThan(a + 200);
    expect(CH1.shop).toBeLessThan(b - 200);
    expect(heading(LIFT_S + 250) - heading(LIFT_S)).toBeGreaterThan((35 * Math.PI) / 180); // right = + here
  });

  it('lifts off from the riding camera, goes straight on over the drop, and the road curves back under you', () => {
    expect(dist(cliffEye(0), rideCam(LIFT_S).eye)).toBeLessThan(1e-6);
    const r = coastRoute();
    let maxOut = 0;
    for (let p = 0.08; p <= 1; p += 0.01) { // (the first few metres still roll on the road, lifting)
      const e = cliffEye(p), wheels = e.y - EYE, ground = Math.max(groundAt(e.x, e.z), SEA_LEVEL);
      expect(wheels - ground).toBeGreaterThan(1.5);
      const n = r.nearest(e.x, e.z, 400)!;
      if (p < CLIFF.passP - 0.1) maxOut = Math.max(maxOut, -n.d);
    }
    expect(maxOut).toBeGreaterThan(15); // out over the sea side of the road
    const pass = cliffEye(CLIFF.passP), q = r.offset(CLIFF.passS, 0);
    expect(Math.hypot(pass.x - q.x, pass.z - q.z)).toBeLessThan(0.5);
    expect(pass.y - EYE - q.y).toBeCloseTo(CLIFF.over, 3);
  });

  it('Lou’s car passes right under you, the other way, on the road', () => {
    const r = coastRoute(), car = louCar(CLIFF.passP)!, e = cliffEye(CLIFF.passP);
    expect(Math.hypot(car.at.x - e.x, car.at.z - e.z)).toBeLessThan(3);
    expect(car.at.y).toBeCloseTo(r.offset(car.s, -2.3).y, 6);
    const before = louCar(CLIFF.passP - 0.1)!, after = louCar(CLIFF.passP + 0.05)!;
    expect(before.s).toBeGreaterThan(car.s); // coming toward you down the road
    expect(after.s).toBeLessThan(car.s);
    // the camera turns to watch it come
    const s = shot('cliff', CLIFF.passP - 0.08), ahead = shot('cliff', 0.3);
    expect(s.fx.car).not.toBeNull();
    expect(ahead.bars).toBe(true);
  });
});

describe('the angel (#195)', () => {
  it('carries on from the cliff in first person, then eases out behind you (never in front)', () => {
    expect(dist(angelEye(0), cliffEye(1))).toBeLessThan(1e-6);
    const first = shot('angel', 0);
    expect(dist(first.eye, angelEye(0))).toBeLessThan(1e-6);
    expect(first.bars).toBe(true);
    let prev = first.eye;
    for (let t = 0.5; t < ANGEL.whiteS; t += 0.5) {
      const s = shot('angel', t / ANGEL_S), r = s.fx.rider;
      const fwd = { x: -Math.sin(r.yaw), z: -Math.cos(r.yaw) };
      const head = { x: r.at.x, y: r.at.y + EYE, z: r.at.z };
      expect((s.eye.x - head.x) * fwd.x + (s.eye.z - head.z) * fwd.z).toBeLessThan(0.01); // behind, or at your eyes
      expect(s.eye.y).toBeGreaterThanOrEqual(head.y - 1e-6);
      if (t > ANGEL.easeS + 3) expect(s.bars).toBe(false);
      expect(dist(s.eye, prev)).toBeLessThan(12); // smooth: no cuts until the white
      prev = s.eye;
    }
    const third = shot('angel', ANGEL.thirdS / ANGEL_S);
    expect(third.fx.third).toBeGreaterThan(0.99);
  });

  it('climbs into the sunset over open water', () => {
    const a = angelEye(0), b = angelEye(1);
    expect((b.x - a.x) * SUNWARD.x + (b.z - a.z) * SUNWARD.z).toBeGreaterThan(800);
    expect(b.y - a.y).toBeGreaterThan(100);
    for (let u = 0; u <= 1; u += 0.05) {
      const e = angelEye(u);
      expect(e.y - Math.max(groundAt(e.x, e.z), SEA_LEVEL)).toBeGreaterThan(20);
    }
    expect(angelU(0)).toBe(0);
    expect(angelU(ANGEL.birdS)).toBe(1);
  });

  it('ends on the white bird over the morning sea, through white', () => {
    expect(shot('angel', ANGEL.birdS / ANGEL_S).fx.white).toBeGreaterThan(0.99);
    const last = shot('angel', 1);
    expect(last.fx.morning).toBeCloseTo(1, 6);
    expect(last.fx.white).toBe(0);
    expect(last.s).toBeLessThan(CH1.turnout);
    expect(shot('angel', 0.5).fx.title).toBeGreaterThan(0.99);
    expect(shot('angel', 0).fx.title).toBe(0);
    expect(shot('cliff', 0.5).fx.title).toBe(0);
  });
});

describe('end title and sign (#195)', () => {
  it('shows the title in the space above the HUD', () => {
    for (const [W, H, top] of [[1180, 820, 0], [820, 1180, 24], [600, 600, 40], [1366, 1024, 24], [568, 320, 0]] as const) {
      const UH = H - 140, T = endTitle(W, UH, top);
      expect(T.y + T.px / 2).toBeLessThanOrEqual(UH);
      expect(T.y - T.px / 2).toBeGreaterThanOrEqual(top);
      expect(T.px * END_TITLE.em).toBeLessThanOrEqual(W * 0.9); // the whole word fits across
    }
    const xs = trackedXs([10, 20, 30], 5, 100);
    expect(xs).toEqual([65, 80, 105]);
    expect(xs[2] + 30 - 100).toBeCloseTo(100 - xs[0]); // centred
  });

  it('can spell GONE FISHING on Lou’s door', () => {
    for (const ch of 'GONEFISH') {
      let lit = 0;
      for (let u = 0; u < 5; u++) for (let v = 0; v < 7; v++) if (textAt(ch, u + 0.5, v + 0.5, 1)) lit++;
      expect(lit).toBeGreaterThan(8);
    }
  });
});
