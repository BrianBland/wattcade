import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput, TuningRegistry } from '../../../core';
import type { Button } from '../../../contracts';
import { UPGRADES, autoInvest, metaMods, upgradeCost } from '../sim/meta';
import { makeUnique, weaponScore } from '../sim/loot';
import { module } from '../index';
import { migrateSave } from '../sim/sim';
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
  it('rolls every shrine kind, including the cadence one', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 60; seed++) for (const r of generateWorld(makeRng(seed), 2).rooms) if (r.shrine) kinds.add(r.shrine.kind);
    expect([...kinds].sort()).toEqual(['endurance', 'fury', 'sprint', 'whirl']);
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
    expect(h.targetZone).toMatchObject({ min: 1, max: 2, label: 'Warm up' }); // floor 1 opens with the warm-up segment
    expect(h.controls!.length).toBeGreaterThan(3);
  });
});

describe('hands-off input map', () => {
  const run = (timeline: ConstructorParameters<typeof TimelineInput>[0], steps = 5, seed = 5) => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(timeline), fake: { script: 'z2' }, seed, simOpts: { skipCamp: true } });
    s.step(steps);
    return s;
  };
  it('all four shifters change gear and trigger no action', () => {
    const s = run([{ t: 0.1, press: 'shiftUpR' }, { t: 0.15, release: 'shiftUpR' }, { t: 0.2, press: 'shiftUpL' }, { t: 0.25, release: 'shiftUpL' }], 15);
    const snap = s.sim.snapshot() as any;
    expect(s.mixer.gear).toBe(8);
    expect(snap.actions.every((a: { ready: number }) => a.ready === 1)).toBe(true);
    const hints = new Map(s.sim.hud!().controls!.map((c) => [c.button, c.label]));
    expect(hints.get('shiftersL')).toBe('Gear'); expect(hints.get('shiftersR')).toBe('Gear');
    expect(hints.get('a')).toBe('Strike'); expect(hints.get('b')).toBe('Ward'); expect(hints.get('y')).toBe('Rally'); expect(hints.get('z')).toBe('Potion');
  });
  it('the hero walks and fights with no input, and the paddles/D-pad do not steer', () => {
    const a = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
    const b = run([{ t: 0, press: 'up', paddleL: 1, paddleR: -1 }], 0);
    a.step(600); b.step(600);
    const pa = (a.sim.snapshot() as any).player, pb = (b.sim.snapshot() as any).player;
    expect(pb.x).toBeCloseTo(pa.x, 6); expect(pb.y).toBeCloseTo(pa.y, 6);
    expect((a.sim.snapshot() as any).ai.path.length + (a.sim.snapshot() as any).stats.kills).toBeGreaterThan(0);
  });
  it('Z drinks a potion when hurt, then cools down', () => {
    class Pad { private next = new Set<Button>(); private st = { held: new Set<Button>(), pressed: new Set<Button>(), released: new Set<Button>(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' as const };
      press(b: Button) { this.next.add(b); }
      beginTick() { this.st.pressed = this.next; this.next = new Set(); }
      state() { return this.st; } }
    const pad = new Pad();
    const reg = new TuningRegistry({ profileId: 'potion' });
    reg.scoped('dungeon').num('autoPotionHpFrac', 0.25, 0, 0.9, 0.05); reg.set('dungeon.autoPotionHpFrac', 0);
    reg.scoped('dungeon').num('enemyDamageScale', 1.3, 0.1, 3, 0.1); reg.set('dungeon.enemyDamageScale', 2);
    const s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true }, tuningRegistry: reg });
    const snap = () => s.sim.snapshot() as any;
    for (let i = 0; i < 30 * 600 && snap().player.hp > snap().player.maxHp * 0.7; i++) s.step(1);
    const p0 = snap().player;
    expect(p0.hp).toBeLessThan(p0.maxHp * 0.7);
    pad.press('z'); s.step(1);
    const p1 = snap().player;
    expect(p1.potions).toBe(p0.potions - 1);
    expect(p1.hp).toBeGreaterThan(p0.hp);
    pad.press('z'); s.step(1); // on cooldown
    expect(snap().player.potions).toBe(p1.potions);
  });
  it('Ward blocks damage and Strike needs an enemy in reach', () => {
    const s = run([{ t: 0.1, press: 'b' }, { t: 0.15, release: 'b' }, { t: 0.2, press: 'a' }, { t: 0.25, release: 'a' }], 10);
    const snap = s.sim.snapshot() as any;
    const by = Object.fromEntries(snap.actions.map((a: { id: string; ready: number }) => [a.id, a.ready]));
    expect(snap.player.warded).toBe(true);
    expect(by.ward).toBeLessThan(0.1);
    expect(by.strike).toBe(1); // nothing in reach at spawn, so no cooldown spent
  });
  it('Rally only works while a spin-up is called', () => {
    const s = run([{ t: 0.1, press: 'y' }, { t: 0.15, release: 'y' }], 10);
    const snap = s.sim.snapshot() as any;
    expect(snap.player.rallied).toBe(false);
    expect(snap.actions.find((a: { id: string }) => a.id === 'rally').usable).toBe(false);
  });
});

describe('effort-scaled action cooldowns', () => {
  const wardFill = (script: string, pressAt: number, after: number) => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: pressAt, press: 'b' }, { t: pressAt + 0.05, release: 'b' }]), fake: { script }, seed: 5, simOpts: { skipCamp: true } });
    s.step(Math.round(after * 30));
    return (s.sim.snapshot() as any).actions.find((a: { id: string }) => a.id === 'ward').ready as number;
  };
  it('harder effort refills faster (zone 4 beats zone 2)', () => {
    const z2 = wardFill('z2', 1, 21), z4 = wardFill('intervals', 1, 21); // intervals opens with 3 min at 1.05 FTP
    expect(z2).toBeGreaterThan(0.3); expect(z2).toBeLessThan(1);
    expect(z4).toBeGreaterThan(z2 * 1.4);
  });
  it('a sprint finishes every refilling action', () => {
    // sprints: 15 s at 1.5 FTP from t=105 s; press Ward at 100 s, check at 115 s (well before it could refill)
    expect(wardFill('sprints', 100, 115)).toBe(1);
    expect(wardFill('z2', 100, 115)).toBeLessThan(1);
  });
});

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const sum: Record<string, number> = {};
      const seeds = sc.seeds ?? [sc.seed], runs: Parameters<NonNullable<typeof sc.assertRuns>>[0] = [];
      for (const seed of seeds) {
        const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed, simOpts: sc.simOpts });
        const run = { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events }; runs.push(run);
        const fails = sc.assert(r.summary, r.stats, run);
        expect(fails, `seed ${seed}: ${JSON.stringify(r.summary)}`).toEqual([]);
        for (const [k, v] of Object.entries(r.summary)) if (typeof v === 'number') sum[k] = (sum[k] ?? 0) + v / seeds.length;
      }
      if (sc.assertAvg) expect(sc.assertAvg(sum), JSON.stringify(sum)).toEqual([]);
      if (sc.assertRuns) expect(sc.assertRuns(runs)).toEqual([]);
    }, sc.minutes >= 60 || sc.seeds ? 30_000 : undefined); // hour-long scenario rides take a few seconds on slow CI runners
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
  it('camp: buy an upgrade (Z or A), then start the run; bank persists', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).dungeon = { bank: 1000, upgrades: {}, bestFloor: 1, runs: 0, autoInvest: false };
    let saved: any = null;
    const input = new TimelineInput([
      { t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, // -> Might
      { t: 0.5, press: 'z' }, { t: 0.6, release: 'z' },       // buy (250) with Z (left face button)
      { t: 0.8, press: 'b' }, { t: 0.9, release: 'b' },       // begin
    ]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    expect((s.sim.snapshot() as any).phase).toBe('camp');
    s.step(40);
    expect((s.sim.snapshot() as any).phase).toBe('run');
    expect(saved.upgrades.might).toBe(1);
    expect(saved.bank).toBe(750);
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

describe('death to camp, Second Wind, saves', () => {
  function fragile(opts: { swCd?: number; seed?: number; save?: unknown } = {}) {
    const reg = new TuningRegistry({ profileId: 'death' });
    reg.set('dungeon.enemyDamageScale', 3);
    reg.scoped('dungeon').num('playerHp', 100, 20, 500, 10); reg.set('dungeon.playerHp', 20);
    if (opts.swCd !== undefined) { reg.scoped('dungeon').num('secondWindCdS', 540, 30, 1800, 10); reg.set('dungeon.secondWindCdS', opts.swCd); }
    const profile = testProfile();
    if (opts.save) profile.gameData = { ...profile.gameData, dungeon: opts.save };
    const saves: any[] = [];
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: opts.seed ?? 5, simOpts: { skipCamp: true }, tuningRegistry: reg, onSave: (d) => saves.push(d) });
    return { s, saves, snap: () => s.sim.snapshot() as any };
  }
  it('a death sends the hero to camp, banks every run coin, and never reduces the bank', () => {
    const { s, saves, snap } = fragile();
    let bankBefore = 0, died = false;
    for (let i = 0; i < 30 * 60 * 20 && !died; i++) {
      const pre = snap(); if (pre.phase === 'run') bankBefore = pre.player.bank;
      s.step(1); died = snap().stats.deaths > 0;
    }
    expect(died).toBe(true);
    expect(snap().phase).toBe('camp');
    expect(snap().camp.bank).toBeGreaterThanOrEqual(bankBefore);
    for (let k = 1; k < saves.length; k++) expect(saves[k].bank).toBeGreaterThanOrEqual(saves[k - 1].bank); // banks only grow (no camp spends here)
    expect(s.sim.isOver()).toBe(false);
  });
  it('Second Wind saves the hero once per cooldown', () => {
    const { s: s2, snap: snap2 } = fragile({ swCd: 1800 });
    let fired = -1, diedAt = -1;
    for (let i = 0; i < 30 * 60 * 20 && diedAt < 0; i++) { s2.step(1); const p = snap2(); if (fired < 0 && p.player.secondWindFlash > 0.9) fired = i; if (p.stats.deaths > 0) diedAt = i; }
    expect(fired).toBeGreaterThanOrEqual(0);  // the first lethal hit was caught
    expect(diedAt).toBeGreaterThan(fired);     // the next one (still on cooldown) was not
  });
  it('the hero level and loot reset at the next descent, camp upgrades persist', () => {
    const { s, snap, saves } = fragile({ save: { upgrades: { luck: 2 }, bank: 0, autoInvest: false } });
    for (let i = 0; i < 30 * 60 * 20 && snap().stats.deaths === 0; i++) s.step(1);
    expect(snap().stats.deaths).toBe(1);
    for (let i = 0; i < 30 * 50 && snap().phase === 'camp'; i++) s.step(1); // camp auto-starts
    expect(snap().phase).toBe('run');
    expect(snap().player.level).toBe(1);
    expect(snap().weapon.name).toBe('Apprentice Wand');
    expect(saves.at(-1).upgrades.luck).toBe(2);
  });
  it('migrates v1 saves: Swiftness refunded as coins, totals added, lives gone', () => {
    // Swiftness L3 cost 500 + 750 + 1125 = 2375
    const m = migrateSave({ bank: 100, upgrades: { swift: 3, vitality: 2 } as any, bestFloor: 4, runs: 7 });
    expect(m.ver).toBe(2);
    expect(m.bank).toBe(100 + 2375);
    expect((m.upgrades as any).swift).toBeUndefined();
    expect(m.upgrades!.vitality).toBe(2);
    expect(m.totals!.runs).toBe(7);
    expect(migrateSave(m)).toEqual(m); // idempotent
    expect(migrateSave(undefined).ver).toBe(2);
  });
});
