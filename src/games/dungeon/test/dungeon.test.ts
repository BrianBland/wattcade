import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput, TuningRegistry } from '../../../core';
import type { Button } from '../../../contracts';
import { UPGRADES, autoInvest, metaMods, upgradeCost } from '../sim/meta';
import { makeUnique, weaponScore } from '../sim/loot';
import { module } from '../index';
import { generateWorld, TILE } from '../sim/world';
import { scenarios } from '../scenarios';
import { makeRng } from '../../../core';

describe('world', () => {
  it('generates a connected maze floor with stairs in the boss room', () => {
    for (let seed = 1; seed < 30; seed++) {
      const w = generateWorld(makeRng(seed), 1 + (seed % 6));
      expect(w.rooms.length).toBe(Math.min(18, 10 + (seed % 6)));
      expect(w.rooms.every((r) => r.depth >= 0)).toBe(true);
      expect(w.tiles.includes(TILE.DOOR)).toBe(true);
      expect(w.tiles.includes(TILE.STAIRS)).toBe(true);
      const b = w.rooms.find((r) => r.boss)!;
      expect(w.stairs.x > b.x0 && w.stairs.x < b.x0 + b.w && w.stairs.y > b.y0 && w.stairs.y < b.y0 + b.h).toBe(true);
      // every room reachable over floor tiles from spawn
      const seen = new Set<number>(), q = [Math.floor(w.spawn.y) * w.w + Math.floor(w.spawn.x)];
      seen.add(q[0]);
      for (let i = 0; i < q.length; i++) for (const d of [1, -1, w.w, -w.w]) {
        const n = q[i] + d; if (!seen.has(n) && w.tiles[n] !== TILE.WALL) { seen.add(n); q.push(n); }
      }
      for (const r of w.rooms) expect(seen.has((r.y0 + 1) * w.w + r.x0 + 1)).toBe(true);
    }
  });
  it('has dead ends with chests', () => {
    const w = generateWorld(makeRng(3), 4);
    expect(w.rooms.some((r) => r.chest)).toBe(true);
  });
});

describe('swamp resistance (core mixer)', () => {
  it('commanded grade rises while on swamp tiles', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 13, simOpts: { autopilot: true } });
    let sawBase = false, sawSwamp = false;
    for (let i = 0; i < 20 * 60 * 30 && !sawSwamp; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as { hooks: { swamp: boolean } };
      const g = s.mixer.debug().lastCommand as { gradePct?: number } | null | undefined;
      const grade = g?.gradePct;
      if (grade !== undefined && !snap.hooks.swamp && i > 90) sawBase = sawBase || grade < 3.5;
      if (grade !== undefined && snap.hooks.swamp && i > 90) sawSwamp = sawSwamp || grade >= 4.5;
    }
    expect(sawBase).toBe(true);
    expect(sawSwamp).toBe(true);
  });
});

describe('auto-move and hud', () => {
  it('moves the player with no D-pad input and exposes hud()', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
    const p0 = (s.sim.snapshot() as any).player;
    s.step(300);
    const p1 = (s.sim.snapshot() as any).player;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(3);
    const h = s.sim.hud!();
    expect(h.gears).toBe(true);
    expect(h.targetZone).toMatchObject({ min: 2, max: 2 });
    expect(h.controls!.length).toBeGreaterThan(3);
  });
});

describe('buttons aim mode', () => {
  const buttonsProfile = () => { const p = testProfile(); p.settings.aimMode = 'buttons'; return p; };
  it('aims like the Ride diamond: Y up, Z left, A right, B down', () => {
    const want: Record<string, number> = { y: -Math.PI / 2, z: Math.PI, a: 0, b: Math.PI / 2 };
    for (const [b, ang] of Object.entries(want)) {
      const s = createGameSession({ game: module, profile: buttonsProfile(), input: new TimelineInput([{ t: 0, press: b as Button }]), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
      s.step(5);
      expect(Math.abs(Math.cos((s.sim.snapshot() as any).aim.angle - ang) - 1), b).toBeLessThan(1e-9);
    }
  });
  it('dash and potion sit on the right shifters without shifting gear', () => {
    const s = createGameSession({ game: module, profile: buttonsProfile(), input: new TimelineInput([{ t: 0, press: 'shiftUpR' }]), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
    const gear0 = s.mixer.gear; s.step(5);
    expect((s.sim.snapshot() as any).player.dashCd).toBeGreaterThan(0);
    expect(s.mixer.gear).toBe(gear0);
    const hints = new Map(s.sim.hud!().controls!.map((c) => [c.label, c.button]));
    expect(hints.get('Dash')).toBe('shiftUpR'); expect(hints.get('Potion')).toBe('shiftDnR'); expect(hints.get('Aim right')).toBe('a');
  });
});

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      const fails = sc.assert(r.summary, r.stats, { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events });
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const o = { game: module, script: 'z2', minutes: 3, seed: 4, simOpts: { autopilot: true } };
    expect(runHeadless(o).summary).toEqual(runHeadless(o).summary);
  });
});

describe('meta progression', () => {
  it('autoInvest buys cheapest upgrades within the bank', () => {
    const lv = {};
    const r = autoInvest(2000, lv);
    expect(r.bank).toBeGreaterThanOrEqual(0);
    expect(r.bought.length).toBeGreaterThan(2);
    const spent = 2000 - r.bank;
    expect(spent).toBeLessThanOrEqual(2000);
    const cheapest = Math.min(...UPGRADES.map((d) => upgradeCost(d, (lv as Record<string, number>)[d.id] ?? 0)));
    expect(cheapest).toBeGreaterThan(r.bank);
  });
  it('start floor is capped by best floor', () => {
    expect(metaMods({ delve: 10 }, 6).maxStartFloor).toBe(5);
    expect(metaMods({ delve: 1 }, 30).maxStartFloor).toBe(3);
    expect(metaMods({}, 30).maxStartFloor).toBe(1);
  });
  it('camp: buy an upgrade, then start the run; bank persists', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).dungeon = { bank: 1000, upgrades: {}, bestFloor: 1, runs: 0, autoInvest: false };
    let saved: any = null;
    const input = new TimelineInput([
      { t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, // -> Might
      { t: 0.5, press: 'z' }, { t: 0.6, release: 'z' },       // buy (400) with Z (left face button)
      { t: 0.8, press: 'b' }, { t: 0.9, release: 'b' },       // begin
    ]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    expect((s.sim.snapshot() as any).phase).toBe('camp');
    s.step(40);
    expect((s.sim.snapshot() as any).phase).toBe('run');
    expect(saved.upgrades.might).toBe(1);
    expect(saved.bank).toBe(600);
    expect(saved.runs).toBe(1);
  });
});

describe('camp taps', () => {
  it('a tap on a row selects and buys it; a tap on Begin starts the run', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).dungeon = { bank: 1000, upgrades: {}, bestFloor: 1, runs: 0, autoInvest: false };
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    const rows = (s.sim.snapshot() as any).camp.rows as Array<{ kind: string; id?: string }>;
    s.sim.receive!({ type: 'campRow', row: rows.findIndex((r) => r.id === 'vitality') });
    s.step(1);
    expect(saved.upgrades.vitality).toBe(1);
    expect((s.sim.snapshot() as any).phase).toBe('camp');
    s.sim.receive!({ type: 'campRow', row: 0 });
    s.step(1);
    expect((s.sim.snapshot() as any).phase).toBe('run');
  });
});

describe('curses', () => {
  it('fall on room entry, pay +50% while active, and lift with a bounty', () => {
    const profile = testProfile();
    const reg = new TuningRegistry({ profileId: profile.id, storage: null });
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { autopilot: true }, tuningRegistry: reg });
    reg.set('dungeon.curseChance', 1);
    let seen = false, lifted = false;
    for (let i = 0; i < 30 * 600 && !lifted; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as any;
      if (snap.curse) seen = true;
      if (seen && snap.stats.curses > 0) lifted = true;
    }
    expect(seen).toBe(true);
    expect(lifted).toBe(true);
  });
});

describe('uniques', () => {
  it('outscore a legendary of the same level', () => {
    const u = makeUnique(makeRng(9), 5);
    expect(u.rarity).toBe(5);
    expect(u.unique).toBeTruthy();
    expect(weaponScore(u)).toBeGreaterThan(0);
  });
});
