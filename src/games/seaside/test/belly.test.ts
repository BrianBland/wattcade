import { describe, expect, it } from 'vitest';
import type { Button, InputState } from '../../../contracts';
import { createGameSession, NullInput, testProfile, type InputSource } from '../../../core';
import { module } from '../index';
import { BELLY_LAYERS, drillView, lidOpen, PARTS, planZ3S, wakeFloor } from '../sim/belly';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';

const scene = (id: string) => STORY.find((s) => s.id === id)!;

/** Presses A for one tick every `everyS` seconds. */
class Tapper implements InputSource {
  private t = 0; private next = 0;
  private s: { -readonly [K in keyof InputState]: InputState[K] } = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
  constructor(private everyS: number) {}
  beginTick(dt: number) {
    this.t += dt;
    const p = new Set<Button>();
    if (this.t >= this.next) { p.add('a'); this.next = this.t + this.everyS; }
    this.s.pressed = p;
  }
  state() { return this.s; }
}

const at = (sceneId: string, progress = 0, script = 'z2', input: InputSource = new NullInput()) => {
  const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
  const s = createGameSession({
    game: module, profile: testProfile(), input, fake: { script }, seed: 1,
    simOpts: { skipMenu: true, save: { checkpoint: { sceneId, progress } } }, onEmit: (e) => events.push(e as never),
  });
  return { s, events, snap: () => s.sim.snapshot() as SeasideSnapshot };
};
const until = (s: { step(n: number): void }, done: () => boolean, maxS: number) => { for (let i = 0; i < maxS && !done(); i++) s.step(30); };

describe('Eyes open (#190)', () => {
  it('opens in two slow blinks, then stays open', () => {
    const lids = Array.from({ length: 401 }, (_, i) => lidOpen(i / 400));
    let opens = 0;
    for (let i = 1; i < lids.length; i++) if (lids[i - 1] < 0.05 && lids[i] >= 0.05) opens++;
    expect(opens).toBe(3); // two blinks and the final opening
    expect(lids[0]).toBe(0);
    expect(lids[400]).toBe(1);
    expect(Math.max(...lids.slice(0, 120))).toBeLessThan(0.5); // the first is only a slit
  });

  it('pedalling wakes you; a stopped rider still wakes by the end of the scene', () => {
    const r = at('eyesOpen');
    r.s.step(30 * 30);
    expect(r.snap().wake).toBeGreaterThan(0.4);
    const idle = at('eyesOpen', 0, 'idle');
    idle.s.step(30 * 30);
    expect(idle.snap().wake).toBe(0);
    expect(wakeFloor(1)).toBe(1);
  });
});

describe('Spare parts (#190)', () => {
  it('lays the bit, gearbox and chain along the chamber, in reach one at a time', () => {
    expect(PARTS.map((p) => p.id)).toEqual(['bit', 'gearbox', 'chain']);
    for (let i = 1; i < PARTS.length; i++) expect(PARTS[i].at - PARTS[i - 1].at).toBeGreaterThan(0.14);
    expect(PARTS[PARTS.length - 1].at).toBeLessThan(0.75); // room for the bars to unfold
  });

  it('grabs with A in reach, and scoops up anything ridden past (generous)', () => {
    const tap = at('spareParts', 0, 'z2', new Tapper(1));
    until(tap.s, () => tap.snap().sceneId !== 'spareParts', 400);
    const parts = tap.events.filter((e) => e.type === 'part');
    expect(parts.map((e) => e.data?.id)).toEqual(['bit', 'gearbox', 'chain']);
    expect(parts.every((e) => e.data?.auto === false)).toBe(true);
    expect(tap.events.some((e) => e.type === 'drillReady')).toBe(true);
    expect(tap.s.sim.summary()['Parts grabbed']).toBe('3/3');

    const none = at('spareParts');
    let hud = false;
    until(none.s, () => { hud ||= !!none.s.sim.hud?.().controls?.some((c) => c.button === 'a'); return none.snap().sceneId !== 'spareParts'; }, 400);
    expect(hud).toBe(true); // the A prompt shows while a part is in reach
    const auto = none.events.filter((e) => e.type === 'part');
    expect(auto.length).toBe(3);
    expect(auto.every((e) => e.data?.auto === true)).toBe(true);
    expect(none.events.some((e) => e.type === 'drillReady')).toBe(true);
  });
});

describe('The drill (#190)', () => {
  const d = scene('drill1');

  it('bores flesh, cartilage, then bone in the three Z3 blocks, with chip-clearing rests between', () => {
    const phases: string[] = [];
    let depth = 0;
    for (let t = 0; t <= d.planS; t += 1) {
      const v = drillView(d, t), tag = `${v.phase}:${BELLY_LAYERS[v.layer].id}`;
      if (phases[phases.length - 1] !== tag) phases.push(tag);
      expect(v.depth).toBeGreaterThanOrEqual(depth - 1e-9);
      depth = v.depth;
    }
    expect(phases).toEqual(['start:flesh', 'bore:flesh', 'rest:flesh', 'bore:cartilage', 'rest:cartilage', 'bore:bone', 'crack:bone']);
    expect(depth).toBeCloseTo(BELLY_LAYERS.reduce((a, l) => a + l.m, 0), 6);
    // each layer has its own ERG level; the rests are 30 s
    const bores = d.effort.filter(([, v]) => v >= 0.75);
    expect(new Set(bores.map(([, v]) => v)).size).toBe(3);
    expect(d.effort.filter(([s, v]) => v < 0.75 && s === 30).length).toBe(3);
    expect(planZ3S(d)).toBe(450);
  });

  it('holds its cadence band in the HUD, and progress is effort-gated: stopping only slows it', () => {
    const r = at('drill1');
    r.s.step(30);
    expect(r.s.sim.hud?.().targetCadence).toMatchObject({ min: 60, max: 75 });
    const idle = at('drill1', 0, 'idle');
    idle.s.step(30 * 120);
    const p = idle.snap().scene.progress;
    expect(idle.snap().sceneId).toBe('drill1');
    expect(p).toBeGreaterThan(0.01); // creeps, never stuck or failed
    r.s.step(30 * 119);
    expect(r.snap().scene.progress).toBeGreaterThan(p * 5);
  });

  it('runs on plan when the rider holds the ERG target (rests included)', () => {
    const r = at('drill1');
    const t0 = r.s.ctx.clock.now();
    until(r.s, () => r.snap().sceneId !== 'drill1', 30 * 60);
    const min = (r.s.ctx.clock.now() - t0) / 60;
    expect(Math.abs(min - d.planS / 60)).toBeLessThan(0.3);
    expect(Math.abs(Number(r.s.sim.summary()['Z3 minutes']) - planZ3S(d) / 60)).toBeLessThan(0.5);
  });
});
