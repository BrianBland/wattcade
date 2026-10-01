import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../../contracts';
import { createDungeonSim } from '../sim/sim';
import { generateWorld, TILE } from '../sim/world';
import { scenarios } from '../scenarios';
import { makeRng, makeStub, SCRIPTS } from './stub';

function run(scriptName: string, minutes: number, seed: number, autopilot = true) {
  const stub = makeStub(SCRIPTS[scriptName], seed);
  const sim = createDungeonSim(stub.ctx, { autopilot });
  const steps = Math.round((minutes * 60) / FIXED_DT);
  for (let i = 0; i < steps && !sim.isOver(); i++) { stub.tick(); sim.update(FIXED_DT); }
  return { stub, sim };
}

describe('world', () => {
  it('generates 8 connected rooms', () => {
    const w = generateWorld(makeRng(5));
    expect(w.rooms.length).toBe(8);
    expect(w.links.length).toBe(7);
    expect(w.tiles.includes(TILE.DOOR)).toBe(true);
    expect(w.tiles.includes(TILE.SWAMP)).toBe(true);
  });
});

describe('swamp resistance', () => {
  it('base grade is the 1% terrain effect off-swamp', () => {
    const stub = makeStub(SCRIPTS.z2, 3);
    const sim = createDungeonSim(stub.ctx);
    stub.tick(); sim.update(FIXED_DT);
    expect(stub.gradeSum()).toBeCloseTo(1);
  });
  it('autopilot sees swamp grade > terrain grade at some point', () => {
    const stub = makeStub(SCRIPTS.z2, 13);
    const sim = createDungeonSim(stub.ctx, { autopilot: true });
    let max = 0;
    for (let i = 0; i < 20 * 60 * 30 && max < 5; i++) { stub.tick(); sim.update(FIXED_DT); max = Math.max(max, stub.gradeSum()); }
    expect(max).toBeGreaterThanOrEqual(5); // terrain 1 + swamp 4
  });
});

describe('behaviour', () => {
  it('is deterministic', () => {
    expect(run('z2', 3, 4).sim.summary()).toEqual(run('z2', 3, 4).sim.summary());
  });
  it('sprint phase offsets both beat the boss', () => {
    const r = run('sprintsEarly', 20, 11);
    expect(r.sim.summary().bossDefeated).toBe(1);
  });
});

describe('scenarios through stub', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = run(sc.script, sc.minutes, sc.seed, true);
      const fails = sc.assert(r.sim.summary(), {} as any, { mixerCommands: [], isOver: r.sim.isOver(), events: r.stub.events });
      expect(fails, JSON.stringify(r.sim.summary())).toEqual([]);
    });
  }
});
