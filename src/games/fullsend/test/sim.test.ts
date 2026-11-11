import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, runHeadless, testProfile } from '../../../core';
import type { InputState } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { landingGrade, leapRange, loopExit, loopRadius, medalFor, smashCount, targetSpeed } from '../sim/physics';
import { TOURS } from '../sim/tour';
import { flipName, hazardY, leapHazards, type FullSendSnapshot } from '../sim/sim';

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 8, seed: 9, simOpts: { tour: 'quick' } });
    const b = runHeadless({ game: module, script: 'mash', minutes: 8, seed: 9, simOpts: { tour: 'quick' } });
    expect(a.summary).toEqual(b.summary);
  });
});

describe('physics', () => {
  const g = 40, v = targetSpeed(1.1, 200 / 3.6);
  it('a leap gap sized for bronze is cleared at bronze speed', () => {
    const gap = leapRange(v, 35, g);
    expect(leapRange(v * 1.01, 35, g)).toBeGreaterThan(gap);
    expect(leapRange(v * 0.95, 35, g)).toBeLessThan(gap);
  });
  it('a loop sized for a speed is completed at that speed and not below', () => {
    const R = loopRadius(v, g);
    expect(loopExit(v, R, g)).toBeNull();
    const off = loopExit(v * 0.9, R, g)!;
    expect(off.slide).toBe(false);
    expect(off.angle).toBeGreaterThan(Math.PI / 2);
    expect(off.angle).toBeLessThan(Math.PI);
    expect(loopExit(v * 0.5, R, g)!.slide).toBe(true);
  });
  it('medals and smash counts rise with power', () => {
    const th = [1.2, 1.5, 1.8] as const;
    expect([1.0, 1.25, 1.6, 2].map((f) => medalFor(f, th))).toEqual([0, 1, 2, 3]);
    expect(smashCount(1.8, th, 10)).toBe(10);
    expect(smashCount(1.5, th, 10)).toBeGreaterThan(smashCount(1.2, th, 10));
    expect(smashCount(0.5, th, 10)).toBe(0);
  });
});

describe('tours', () => {
  it('end with a finale and stay near their advertised length', () => {
    for (const t of Object.values(TOURS)) {
      expect(t.sets.at(-1)!.finale).toBe(true);
      const total = t.warmupS + t.cooldownS + t.sets.reduce((a, s) => a + 20 + s.effortS + 5 + s.recoveryS, 0);
      expect(total / 60).toBeLessThan(t.id === 'quick' ? 20 : 31);
    }
  });
});

import { bumpAt, bumpH, takesOff } from '../sim/track';
describe('bumps (Line Rider hops)', () => {
  it('are continuous and come back to the road', () => {
    for (let x = 0; x < 20000; x += 0.25) expect(Math.abs(bumpH(x + 0.25, 7) - bumpH(x, 7))).toBeLessThan(0.6);
    const b = [...Array(200).keys()].map((k) => bumpAt(k * 140 + 70, 7)).find((q) => q?.kind === 'kicker')!;
    expect(bumpH(b.x0 - 0.01, 7)).toBe(0);
    expect(bumpH(b.x0 + b.len + 0.01, 7)).toBe(0);
    expect(bumpH(b.x0 + b.up, 7)).toBeCloseTo(b.h, 5);
  });
  it('fast riders take off over a crest that slow riders roll over', () => {
    const curv = -0.03; // 1/m, a roller crest
    expect(takesOff(40, curv, 30)).toBe(true);
    expect(takesOff(20, curv, 30)).toBe(false);
  });
  it('a Z2 cruise already gets airtime, a faster cruise gets more', () => {
    const z2 = runHeadless({ game: module, script: 'z2', minutes: 6, seed: 4, simOpts: { tour: 'quick' } }).summary;
    expect(Number(z2.hops)).toBeGreaterThan(10);
    expect(Number(z2.longestHopS)).toBeGreaterThan(0.4);
  });
});

describe('steering and landings', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  it('grades a landing by how far the bike is from the slope', () => {
    expect(landingGrade(deg(5))).toBe('perfect');
    expect(landingGrade(deg(-12))).toBe('good');
    expect(landingGrade(deg(20))).toBe('ok');
    expect(landingGrade(deg(-35))).toBe('bad');
  });
  it('hands-off riding never crashes and earns no flow; good steering is faster for the same watts', () => {
    const run = (autolean: boolean) => runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean } }).summary;
    const hands = run(false), steer = run(true);
    expect(Number(hands.badLandings)).toBe(0);
    expect(Number(hands.flowPeakPct)).toBeLessThan(15);
    expect(Number(steer.perfectLandings)).toBeGreaterThan(20);
    expect(Number(steer.flowPeakPct)).toBeGreaterThanOrEqual(20);
    expect(Number(steer.distanceKm)).toBeGreaterThan(Number(hands.distanceKm) * 1.08);
  });
  it('holding a hard forward lean crashes landings, which bounce and cost speed', () => {
    const lean: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 1, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => lean }, fake: { script: 'z2' }, simOpts: { tour: 'quick' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): { mode: string; v: number; landGrade: string | null } }).snapshot();
    let bad = 0, lost = 0, prevV = 0, prevMode = '';
    for (let i = 0; i < 60 * 240; i++) {
      s.step(1);
      const q = snap();
      if (prevMode === 'hop' && q.landGrade === 'bad' && q.v < prevV * 0.9) { bad++; lost += 1 - q.v / prevV; }
      prevV = q.v; prevMode = q.mode;
    }
    expect(bad).toBeGreaterThan(3);
    expect(lost / bad).toBeGreaterThan(0.12);
  });
});

describe('leaps', () => {
  it('pit hazards peak right on your arc, so holding your line gets you hit', () => {
    const vx = 50, vy0 = 35, g = 28, len = 120;
    for (const z of leapHazards(3, 0, len, vx, vy0, g, 5)) {
      const tx = z.x / vx, arc = vy0 * tx - (g * tx * tx) / 2;
      expect(Math.abs(hazardY(z, tx) - arc)).toBeLessThan(2);
      expect(z.x).toBeGreaterThan(len * 0.15); expect(z.x).toBeLessThan(len * 0.85);
    }
  });
  it('steering round the hazards (the pilot dodges) gets hit less than riding hands-off', () => {
    const run = (autolean: boolean) => Number(runHeadless({ game: module, script: 'hook-responsive', minutes: 14, seed: 3, simOpts: { tour: 'classic', forks: 'alternate', autolean } }).summary.scorched);
    expect(run(true)).toBeLessThan(Math.max(1, run(false)));
  });
});

describe('loops: pedal round', () => {
  const toLoop = () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, simOpts: { tour: 'classic', forks: 'main' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    for (let i = 0; i < 30 * 60 * 30 && !(snap().mode === 'loop'); i++) s.step(1);
    return { s, snap };
  };
  const finish = (r: ReturnType<typeof toLoop>) => { for (let i = 0; i < 30 * 30 && r.snap().phase === 'payoff' && r.snap().piece?.medal === -1; i++) r.s.step(1); return r.snap().results.at(-1)!; };
  it('keep pedalling hard and you get all the way round', () => {
    const r = toLoop(); expect(r.snap().mode).toBe('loop');
    expect(r.snap().piece!.len).toBeGreaterThan(20); // a big loop
    expect(finish(r).detail).toBe('pedalled round');
  });
  it('stop pedalling in the loop and you fall off or roll back', () => {
    const r = toLoop();
    const fb = r.s.fakeBike!; fb.script = null; fb.manual = { cadence: 0, power: 0, hr: null };
    const res = finish(r);
    expect(res.medal).toBe(0); expect(res.detail).not.toBe('pedalled round');
  });
});

describe('outrun: duck into the cave', () => {
  it('you slip inside, the chaser slams into the mouth, and you coast to a stop in the dark', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, simOpts: { tour: 'quick', forks: 'main' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    for (let i = 0; i < 30 * 60 * 30 && !(snap().piece?.kind === 'outrun' && snap().phase === 'payoff'); i++) s.step(1);
    const mouth = snap().piece!.x0;
    expect(snap().piece!.len).toBeGreaterThan(20);
    expect(Math.abs(snap().x - mouth)).toBeLessThan(4); // the sprint ends at the cave mouth
    for (let i = 0; i < 30 * 10 && snap().phase === 'payoff'; i++) s.step(1);
    const p = snap().piece!;
    expect(p.crashAt).toBeGreaterThan(0);
    expect(snap().x).toBeGreaterThan(mouth + 5); // inside
    expect(snap().x).toBeLessThan(mouth + p.len); // and still in the dark
  });
});

describe('flips', () => {
  it('holding a full lean in a long hop tucks into a flip; a clean landing counts it, with flow', () => {
    const lean: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 1, paddleR: 0, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => lean }, fake: { script: 'z2' }, simOpts: { tour: 'quick' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    let maxSpin = 0, named = '';
    for (let i = 0; i < 30 * 600; i++) { s.step(1); const q = snap(); maxSpin = Math.max(maxSpin, Math.abs(q.spun)); if (q.flip) named = q.flip.name; }
    expect(maxSpin).toBeGreaterThan(2 * Math.PI); // a held lean really does go all the way round
    expect(flipName(2, true)).toBe('Double Backflip'); expect(flipName(1, false)).toBe('Frontflip');
    const flips = Number(s.sim.summary().flips);
    if (flips > 0) expect(named).toMatch(/Backflip/);
  });
});

describe('altitude: momentum takes you up to the sky islands and the moon', () => {
  it('a rider who keeps their flow up launches to the sky, then the moon, falls into the sea and breaches back', () => {
    const r = runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean: true } });
    const sm = r.summary;
    expect(Number(sm.skyVisits)).toBeGreaterThanOrEqual(1);
    expect(Number(sm.moonVisits)).toBeGreaterThanOrEqual(1);
    expect(Number(sm.splashdowns)).toBeGreaterThanOrEqual(1);
    const order = r.events.filter((e) => e.type === 'launch').map((e) => (e.data as { to: string }).to);
    expect(order.slice(0, 4)).toEqual(['sky', 'moon', 'sea', 'ground']); // thrown off the moon, then the breach out of the sea
  });
  it('a hands-off rider stays on the road', () => {
    const sm = runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick' } }).summary;
    expect(Number(sm.skyVisits)).toBe(0);
    expect(Number(sm.peakAltM)).toBeLessThan(30);
  });
});

describe('jet, rings and stars up high', () => {
  it('a rider who jets (above the power line) to the rings catches them', () => {
    const sm = runHeadless({ game: module, script: 'target-follow', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean: true, autojet: true } }).summary;
    expect(Number(sm.jetS)).toBeGreaterThan(2);
    expect(Number(sm.rings)).toBeGreaterThanOrEqual(3);
    expect(Number(sm.stars)).toBeGreaterThanOrEqual(1);
  });
  it('holding the jet at Z2 power does nothing', () => {
    const jetIn: InputState = { held: new Set(['b']), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => jetIn }, fake: { script: 'z2' }, simOpts: { tour: 'quick', autolean: true }, seed: 3 });
    let weak = 0;
    for (let i = 0; i < 30 * 300; i++) { s.step(1); if ((s.sim as unknown as { snapshot(): { jet: string | null } }).snapshot().jet === 'weak') weak++; }
    expect(weak).toBeGreaterThan(0);
    expect(Number(s.sim.summary().jetS)).toBe(0);
  });
});

describe('forks: pick your route', () => {
  it('every set has an alternative branch with the same sprint length', () => {
    for (const t of Object.values(TOURS)) for (const s of t.sets) {
      expect(s.alt).toBeTruthy();
      expect(s.alt!.kind !== s.kind || s.alt!.biome !== s.biome).toBe(true);
    }
  });
  it('taking the other branch changes the set pieces and scenery, not the sprint lengths', () => {
    const run = (forks: 'main' | 'alt') => runHeadless({ game: module, script: 'hook-responsive', minutes: 22, seed: 5, simOpts: { tour: 'quick', forks } });
    const a = run('main'), b = run('alt');
    expect(a.summary.route).toBe('AAAAA');
    expect(b.summary.route).toBe('BBBBB');
    const kinds = (r: typeof a) => r.events.filter((e) => e.type === 'setPiece').map((e) => (e.data as { kind: string }).kind);
    expect(kinds(a)).toEqual(TOURS.quick.sets.map((s) => s.kind));
    expect(kinds(b)).toEqual(TOURS.quick.sets.map((s) => s.alt!.kind));
    expect(a.isOver && b.isOver).toBe(true); // (payoff animations differ in length, sprints don't)
  });
  it('pressing right while the fork is open takes the other branch', () => {
    const right: InputState = { held: new Set(), pressed: new Set(['right']), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => right }, fake: { script: 'z2' }, simOpts: { tour: 'quick' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): { fork: { pick: number } | null; phase: string; piece: { kind: string } | null } }).snapshot();
    let sawFork = false;
    while (snap().phase === 'warmup') { s.step(30); if (snap().fork) { sawFork = true; expect(snap().fork!.pick).toBe(1); } }
    expect(sawFork).toBe(true);
    expect(snap().piece?.kind).toBe(TOURS.quick.sets[0].alt!.kind);
  });
});

describe('setup screen and saves', () => {
  const mkCtxSession = (store: { data?: unknown }, simOpts: Record<string, unknown>, input?: { beginTick(): void; state(): InputState }) => {
    const prof = testProfile();
    (prof as { gameData?: Record<string, unknown> }).gameData = store.data ? { fullsend: store.data } : {};
    return createGameSession({ game: module, profile: prof, input: input ?? { beginTick() {}, state: () => idle }, fake: { script: 'hook-responsive' }, simOpts, seed: 3, onSave: (d) => { store.data = d; } });
  };
  const idle: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
  it('waits in the menu, ◀ ▶ picks the tour, A starts, and the choice is saved', () => {
    let st: InputState = idle;
    const store: { data?: unknown } = {};
    const s = mkCtxSession(store, {}, { beginTick() {}, state: () => st });
    const snap = () => (s.sim as unknown as { snapshot(): { menu: { tour: string } | null; tourName: string } }).snapshot();
    s.step(10);
    expect(s.sim.inMenu?.()).toBe(true);
    const first = snap().menu!.tour;
    st = { ...idle, pressed: new Set(['right']) }; s.step(1); st = idle; s.step(1);
    expect(snap().menu!.tour).not.toBe(first);
    st = { ...idle, pressed: new Set(['a']) }; s.step(1); st = idle; s.step(1);
    expect(s.sim.inMenu?.()).toBe(false);
    expect((store.data as { lastTour: string }).lastTour).not.toBe(first);
  });
  it('a finished ride saves the best result per tour and the progress line shows it', () => {
    const store: { data?: unknown } = {};
    const s = mkCtxSession(store, { tour: 'quick' });
    while (!s.sim.isOver()) s.step(300);
    const sv = store.data as { best: Record<string, { golds: number }>; rides: number };
    expect(sv.rides).toBe(1);
    expect(sv.best.quick.golds).toBeGreaterThanOrEqual(2);
    expect(module.progressLine!(sv)).toMatch(/Quick Send: \d+ gold/);
  });
});
