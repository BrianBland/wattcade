import { describe, it, expect } from 'vitest';
import { createGameSession, makeRng, runHeadless, testProfile, TimelineInput } from '../../../core';
import type { InputState, Profile } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { progressLine } from '../card';
import { BASE_PAD, BASE_X, BASE_Y, ELEMENTS, ELEMENT_WEAPON, FIELD_H, FIELD_W, KIND_FROM, KINDS, PADS, ROAD_LENGTH, TOWERS, flightAt, flightLength, padOrder, roadAt, towerBuildCost, type Element } from '../sim/defs';
import { clearHealFor, nextBrood, planWave, waveCounts, waveRole, type WaveOpts } from '../sim/waves';
import { UPGRADES, autoInvest, metaMods, upgradeCost } from '../sim/meta';
import { readSave } from '../sim/sim';
import type { TdSnapshot } from '../sim/types';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as TdSnapshot;

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
});

describe('field geometry', () => {
  it('the road runs from the spawn edge to the base; Gliders fly straight from the spawn edge', () => {
    const a = roadAt(0), b = roadAt(ROAD_LENGTH);
    expect(a.y).toBeLessThanOrEqual(0);
    expect(Math.hypot(b.x - BASE_X, b.y - BASE_Y)).toBeLessThan(1e-6);
    expect(ROAD_LENGTH).toBeGreaterThan(220);
    for (let r = 0; r < 3; r++) {
      expect(flightAt(r, 0).y).toBeLessThan(0);
      const end = flightAt(r, flightLength(r));
      expect(Math.hypot(end.x - BASE_X, end.y - BASE_Y)).toBeLessThan(1e-6);
      expect(flightLength(r)).toBeLessThan(ROAD_LENGTH / 2);
    }
  });
  it('twelve pads inside the field, well apart, in road order by their stretch', () => {
    expect(PADS).toHaveLength(12);
    for (const p of PADS) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(FIELD_W); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(FIELD_H); expect(p.name).toBeTruthy(); }
    for (const a of PADS) for (const b of PADS) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(9);
    expect(PADS.find((p) => p.id === 1)!.s).toBeLessThan(PADS.find((p) => p.id === 6)!.s); // spawn ridge before turret flank
  });
  it('orders pads and the base the way each orientation shows them', () => {
    const at = (id: number) => id === BASE_PAD ? { x: BASE_X, y: BASE_Y } : PADS[id];
    for (const turned of [false, true]) {
      const order = padOrder(turned);
      expect([...order].sort((a, b) => a - b)).toEqual([...PADS.map((p) => p.id), BASE_PAD]);
      // screen position: portrait reads rows (down, then right); landscape reads columns (right, then down)
      const scr = (id: number) => turned ? { main: FIELD_H - at(id).y, cross: at(id).x } : { main: at(id).y, cross: at(id).x };
      for (let i = 1; i < order.length; i++) {
        const a = scr(order[i - 1]), b = scr(order[i]);
        // either further along the same row/column, or the next row/column starts further down/right
        expect(b.cross > a.cross || b.main > a.main, `${turned ? 'landscape' : 'portrait'} ${order[i - 1]} → ${order[i]}`).toBe(true);
      }
    }
    expect(padOrder(false).slice(0, 3)).toEqual([0, 7, 1]); // top row, left to right
    expect(padOrder(false).slice(-3)).toEqual([6, BASE_PAD, 11]); // the bottom row runs through the turret
    expect(padOrder(true).slice(0, 2)).toEqual([6, BASE_PAD]); // landscape starts at the turret end, left
  });
});

const WO: WaveOpts = { spawnWindowS: 20, countScale: 1, brood: 'red', broodShare: 0.8, swarmPack: 5 };
const BROOD = { maxRun: 2, coverWaves: 4 };
function broodSeq(seed: number, n: number): Element[] {
  const rng = makeRng(seed), out: Element[] = [];
  for (let i = 0; i < n; i++) out.push(nextBrood(out, rng, BROOD));
  return out;
}

describe('brood planner', () => {
  it('never runs a colour 3 times and has all three in every 4 waves', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const seq = broodSeq(seed, 300);
      for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
      for (let i = 3; i < seq.length; i++) expect(new Set(seq.slice(i - 3, i + 1)).size).toBe(3);
    }
  });
  it('is a mix, deterministic per seed', () => {
    expect(broodSeq(7, 50)).toEqual(broodSeq(7, 50));
    expect(broodSeq(7, 50)).not.toEqual(broodSeq(8, 50));
    const seq = broodSeq(3, 600);
    for (const c of ELEMENTS) expect(seq.filter((x) => x === c).length).toBeGreaterThan(150);
  });
  it('honours other tunings (runs of 1, cover off)', () => {
    const rng = makeRng(2), seq: Element[] = [];
    for (let i = 0; i < 200; i++) seq.push(nextBrood(seq, rng, { maxRun: 1, coverWaves: 0 }));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  it('about 80% of a wave\'s slots are the brood colour; blue slots are swarm packs', () => {
    for (const brood of ELEMENTS) for (let w = 1; w <= 40; w++) {
      const p = planWave(w, makeRng(w * 7), { ...WO, brood });
      expect(p.brood).toBe(brood);
      const slots = waveCounts(w).heavies, main = Math.max(1, Math.round(slots * 0.8));
      const heavies = p.spawns.filter((s) => KINDS[s.kind].heavy && s.kind !== 'prism' && s.kind !== 'boss');
      const c = waveCounts(w), dartPacks = Math.ceil(c.dart / 4) * 4;
      const swarm = p.spawns.length - heavies.length - dartPacks - c.prism - c.boss;
      expect(heavies.length + swarm / 5).toBe(Math.max(main, slots)); // every slot is one heavy or one pack of 5
      if (brood === 'blue') { expect(heavies.length).toBe(Math.max(main, slots) - main); expect(swarm).toBeGreaterThanOrEqual(main * 5); }
      else expect(heavies.filter((s) => KINDS[s.kind].color === brood).length).toBe(main);
    }
  });
});

describe('clear heal', () => {
  const o = { heal: 14, speedBonus: 12, waveMinS: 25, waveMaxS: 60, leakZero: 15 };
  it('a clean clear heals more the faster it is', () => {
    expect(clearHealFor(25, 0, o)).toBe(26);
    expect(clearHealFor(42.5, 0, o)).toBe(20);
    expect(clearHealFor(59, 0, o)).toBe(14);
  });
  it('leaks scale the heal down to nothing', () => {
    expect(clearHealFor(25, 1, o)).toBe(24);
    expect(clearHealFor(25, 7.5, o)).toBe(13);
    expect(clearHealFor(25, 15, o)).toBe(0);
    expect(clearHealFor(25, 40, o)).toBe(0);
    expect(clearHealFor(25, 1, { ...o, leakZero: 0 })).toBe(0); // 0 = any leak cancels it
    expect(clearHealFor(25, 0, { ...o, leakZero: 0 })).toBe(26);
  });
  it('the dynamo stalls after stallGraceS under 15 rpm; leaks then hit x2.2', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(30 * 10);
    expect(snap(s).stalled).toBe(false);
    s.fakeBike!.useScript(null); s.fakeBike!.manual.cadence = 0; s.fakeBike!.manual.power = 0;
    let n = 0;
    while (snap(s).stalled === false && n++ < 30 * 20) s.step(1);
    expect(n / 30).toBeGreaterThan(3); // cadence3s decays first, then the 3 s grace
    expect(n / 30).toBeLessThan(10);
    s.step(30 * 150); // the lull, then the walk down the road
    const hits = s.finish().events.filter((e) => e.type === 'baseHit').map((e) => Number(e.data?.dmg));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((d) => d === 2.2 || d >= 8.8)).toBe(true); // drones/darts 1 -> 2.2, heavies x2.2
  });
  it('a rider who stops pedalling gets no heal from leaked waves', () => {
    // a reinforced base outlasts the long first wave, which then times out with its leaks
    const r = runHeadless({ game: module, script: 'idle', minutes: 8, seed: 1, simOpts: { autopilot: true, baseHp: 1000 } });
    const cleared = r.events.filter((e) => e.type === 'waveCleared');
    expect(cleared.length).toBeGreaterThan(0);
    for (const e of cleared) { expect(Number(e.data?.leakDmg)).toBeGreaterThan(0); expect(e.data?.heal).toBe(0); }
  });
});

describe('waves', () => {
  it('kinds only appear from their first wave; sets are three work waves, a boss, then an easy wave', () => {
    expect([1, 2, 3, 4, 5, 6, 9, 10].map(waveRole)).toEqual(['work', 'work', 'work', 'boss', 'easy', 'work', 'boss', 'easy']);
    for (let w = 1; w <= 30; w++) {
      const p = planWave(w, makeRng(w), WO);
      // a brood's first kind (brute, bastion) may lead any wave; the rest wait for their wave
      for (const s of p.spawns) if (!['brute', 'armor'].includes(s.kind)) expect(w).toBeGreaterThanOrEqual(KIND_FROM[s.kind]);
      expect(p.boss).toBe(waveRole(w) === 'boss');
      expect(p.spawns.filter((s) => s.kind === 'boss').length).toBe(waveRole(w) === 'boss' ? 1 : 0);
      // the forecast counts every spawn once; only Gliders fly
      const c = p.counts;
      expect(c.blue + c.red + c.purple + c.gold + c.prism).toBe(p.spawns.length);
      expect(c.air).toBe(p.spawns.filter((s) => s.route >= 0).length);
      for (const s of p.spawns) expect(s.route >= 0).toBe(s.kind === 'dart');
      for (let i = 1; i < p.spawns.length; i++) expect(p.spawns[i].at).toBeGreaterThanOrEqual(p.spawns[i - 1].at);
    }
    // the easy wave is a light one
    expect(planWave(5, makeRng(5), WO).spawns.length).toBeLessThan(planWave(3, makeRng(3), WO).spawns.length);
  });
  it('is deterministic per rng and grows with the wave', () => {
    const a = planWave(9, makeRng(4), WO), b = planWave(9, makeRng(4), WO);
    expect(a).toEqual(b);
    expect(waveCounts(20).heavies).toBeGreaterThan(waveCounts(4).heavies);
  });
});

describe('garage meta', () => {
  it('auto-invest buys the cheapest upgrades and mods apply', () => {
    const l = {};
    const r = autoInvest(1000, l);
    expect(r.bought.length).toBeGreaterThan(3);
    expect(r.bank).toBeLessThan(Math.min(...UPGRADES.map((d) => upgradeCost(d, 0))) * 2);
    const m = metaMods({ plating: 2, capacity: 1, foundry: 2, headstart: 3 }, 20);
    expect(m.hpMult).toBeCloseTo(1.2); expect(m.railExtra).toBe(1); expect(m.towerCostMult).toBeCloseTo(0.9);
    expect(m.maxStartWave).toBe(7);
    expect(metaMods({ headstart: 9 }, 6).maxStartWave).toBe(4); // capped at best - 2
  });
  it('reads old saves and shows progress', () => {
    const s = readSave({ bestWave: 9 });
    expect(s).toMatchObject({ v: 3, bestWave: 9, bank: 0, runs: 0 });
    expect(progressLine({ bestWave: 9 })).toBe('Best: wave 9');
    expect(progressLine({ bestWave: 12, bank: 340 })).toBe('Best: wave 12 · 340 parts');
    expect(progressLine(undefined)).toBeNull();
  });
  it('a returning rider shops in the garage, then starts the run', () => {
    const profile: Profile = testProfile({ gameData: { towerdefense: { v: 2, runs: 1, bank: 500, bestWave: 5, upgrades: {} } } });
    let saved: any = null;
    const input = new TimelineInput([
      { t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, // -> Hull Plating (120)
      { t: 0.5, press: 'a' }, { t: 0.6, release: 'a' },       // buy
      { t: 0.8, press: 'b' }, { t: 0.9, release: 'b' },       // start now
    ]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    s.step(3);
    expect(snap(s).phase).toBe('garage');
    expect(s.sim.hud!().controls!.some((c) => c.label === 'Buy / start')).toBe(true);
    s.step(30);
    expect(saved.upgrades.plating).toBe(1);
    expect(saved.bank).toBe(380);
    expect(snap(s).phase).toBe('run');
    expect(snap(s).baseMaxHp).toBeCloseTo(110);
    expect(saved.runs).toBe(2);
  });
  it('best wave counts from a Forward Base start', () => {
    const profile: Profile = testProfile({ gameData: { towerdefense: { v: 2, runs: 4, bank: 0, bestWave: 12, upgrades: { headstart: 3 } } } });
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new TimelineInput([{ t: 0.2, press: 'b' }]), fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    s.step(30);
    expect(snap(s).wave).toBe(7); // 1 + 2 x 3
    s.step(30 * 60 * 8);
    expect(snap(s).wave).toBeGreaterThanOrEqual(9);
    expect(s.sim.isOver()).toBe(false);
    expect(saved.bestWave).toBe(Math.max(12, snap(s).wave - 1));
  });
  it('first run skips the garage; intro shows play controls', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3 });
    expect(s.sim.hud!().controls!.find(c => c.button === 'z')?.label).toMatch(/^Rail 0\/3 \(hold = all\)$/); // before the first update (game intro)
    s.step(1);
    expect(snap(s).phase).toBe('run');
  });
});

describe('brood waves', () => {
  const weaponEffect = (s: ReturnType<typeof createGameSession>) => s.mixer.debug().activeEffects.find((e) => e.id === 'weapon')!;
  it('each wave opens with a lull: card + countdown in the snapshot, no spawns, then the wave', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(30);
    const b = snap(s).brood;
    expect(b.wave).toBe(1);
    expect(b.countdownS).toBeGreaterThan(43); expect(b.countdownS).toBeLessThan(45);
    expect(b.weapon).toBe(ELEMENT_WEAPON[b.color]);
    expect(snap(s).weapon).toBe(b.weapon);
    expect(b.cue.length).toBeGreaterThan(4);
    expect(snap(s).nextBrood?.wave).toBe(2);
    expect(snap(s).enemies).toHaveLength(0);
    s.step(30 * 45);
    expect(snap(s).brood.countdownS).toBe(0);
    let seen = 0; // the turret can drop a lone drone within a second of its spawn, so watch every frame
    for (let i = 0; i < 30 * 10; i++) { s.step(1); seen = Math.max(seen, snap(s).enemies.length); }
    expect(seen).toBeGreaterThan(0);
    const evs = s.finish().events.map((e) => e.type);
    expect(evs.indexOf('broodAnnounced')).toBeLessThan(evs.indexOf('waveStart'));
  });
  it('the next weapon\'s trainer setting eases in over the last rampS of the lull', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(30 * 2);
    const b = snap(s).brood;
    const val = () => { const e = weaponEffect(s); return e.gradePct ?? e.levelPct ?? e.ftpFraction ?? NaN; };
    const mode = { gatling: 'sim', flame: 'resistance', rail: 'erg' }[b.weapon];
    const [lullV, fullV] = { gatling: [0, 1], flame: [10, 35], rail: [0.5, 0.95] }[b.weapon];
    expect(weaponEffect(s).mode).toBe(mode);
    expect(val()).toBeCloseTo(lullV); // recovery, early in the lull
    s.step(30 * 38); // 3 s into the 8 s ramp at the end of the 45 s lull
    expect(val()).toBeGreaterThan(lullV); expect(val()).toBeLessThan(fullV);
    s.step(30 * 5);
    expect(val()).toBeCloseTo(fullV);
    expect(weaponEffect(s).mode).toBe(mode);
  });
  it('weapon buttons and weapon taps no longer switch weapons', () => {
    const input = new TimelineInput([{ t: 1, press: 'a' }, { t: 1.1, release: 'a' }, { t: 2, press: 'b' }, { t: 2.1, release: 'b' }, { t: 3, press: 'y' }, { t: 3.1, release: 'y' }]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(10);
    const w = snap(s).weapon;
    s.sim.receive!({ type: 'weapon', w: w === 'rail' ? 'gatling' : 'rail' });
    s.step(30 * 5);
    expect(snap(s).weapon).toBe(w);
  });
});

describe('effort targets', () => {
  function ride(kind: 'spin' | 'grind' | 'hold', cadence: number, power: number) {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 5, simOpts: { autopilot: true } });
    let n = 0;
    while (!(snap(s).effort?.kind === kind && snap(s).effort?.state === 'active') && n++ < 30 * 60 * 45) s.step(1);
    const call = snap(s).effort!;
    expect(call.kind).toBe(kind); expect(call.state).toBe('active');
    const hud = s.sim.hud!();
    s.fakeBike!.useScript(null); s.fakeBike!.manual.cadence = cadence; s.fakeBike!.manual.power = power;
    while (snap(s).effort?.state === 'active') s.step(1);
    return { s, hud, call, result: snap(s).effort!, sum: s.sim.summary() };
  }
  it('Spin-up follows Gatling and rewards an achievable cadence target with Overclock', () => {
    const { s, hud, call, result, sum } = ride('spin', 100, 130);
    expect(hud.targetCadence).toEqual({ min: call.minRpm, label: 'Spin up the Gatling' });
    expect(call.minRpm).toBeGreaterThanOrEqual(80); expect(call.minRpm).toBeLessThan(95);
    expect(result.state).toBe('won'); expect(sum.spinsWon).toBeGreaterThanOrEqual(1);
    expect(snap(s).overclock).toBeGreaterThan(0);
  });
  it('Spin-up is missed at 80 rpm', () => {
    expect(ride('spin', 80, 130).result.state).toBe('failed');
  });
  it('Grind is a power-judged low-cadence call in a Flamer wave', () => {
    const { hud, call, result } = ride('grind', 70, 130);
    expect(hud.targetZone).toMatchObject({ min: 2, max: 5, source: 'power' });
    expect(hud.targetCadence).toMatchObject({ min: 45, max: call.maxRpm });
    expect(result.state).toBe('won');
    expect(ride('grind', 100, 130).result.state).toBe('failed');
  });
  it('Hold supplies a Zone 2 ERG target and rewards staying in its band', () => {
    const { hud, result, call } = ride('hold', 90, 130);
    expect(hud.targetZone?.source).toBe('power');
    expect(call.targetFtp).toBeGreaterThanOrEqual(0.56); expect(call.targetFtp).toBeLessThanOrEqual(0.75);
    expect(result.state).toBe('won');
  });
});

describe('workshop', () => {
  it('▼ opens it on an empty pad, A builds, B closes', () => {
    const input = new TimelineInput([
      { t: 0.5, press: 'down' }, { t: 0.6, release: 'down' },
      { t: 0.8, press: 'up' }, { t: 0.9, release: 'up' },
    ]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(20);
    const ws = snap(s).workshop!;
    expect(ws).not.toBeNull();
    expect(ws.pad).toBeLessThan(PADS.length);
    expect(ws.rows.filter(r => r.kind === 'build').map((r) => r.tower)).toEqual(['tesla', 'flamer', 'lens']);
    expect(s.sim.hud!().controls!.some((c) => c.label === 'Build / upgrade')).toBe(true);
    // pick the tesla row by tap, then build it
    const scrap0 = snap(s).scrap;
    s.sim.receive!({ type: 'row', row: 0 }); s.step(1);
    expect(snap(s).towers).toHaveLength(1);
    expect(snap(s).towers[0].kind).toBe('tesla');
    expect(snap(s).scrap).toBeLessThanOrEqual(scrap0 - towerBuildCost('tesla') + 2);
    // the built pad now offers an upgrade and a refund
    expect(snap(s).workshop!.rows.map((r) => r.kind)).toEqual(['upgrade', 'sell', 'crew']);
    s.sim.receive!({ type: 'close' }); s.step(1);
    expect(snap(s).workshop).toBeNull();
  });
  it('towers only fire on pedal power', () => {
    const run = (script: string) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script }, seed: 4, simOpts: { skipGarage: true, autoCrew: false } });
      s.tuning.set('towerdefense.baseHp', 1000); // keep the tower present to isolate power gating
      // a weak turret leaves the aliens to the tower: at full strength it kills the early stream before it arrives
      s.tuning.set('towerdefense.gatlingDamage', 0.5); s.tuning.set('towerdefense.railLaserDps', 0); s.tuning.set('towerdefense.flameDpsPerWatt', 0.02);
      s.sim.receive!({ type: 'pad', pad: 3 }); s.step(1); s.sim.receive!({ type: 'row', row: 0 }); s.step(30 * 180);
      return { towers: snap(s).towers.length, kills: Number(s.sim.summary().towerKills), fired: snap(s).towers[0]?.firedAt > 0 };
    };
    expect(run('idle')).toEqual({ towers: 1, kills: 0, fired: false });
    expect(run('z2').fired).toBe(true); // early waves the turret takes most kills; the tower still fires
  });
  it('tower stats are sane', () => {
    for (const t of Object.values(TOWERS)) { expect(t.range).toBeGreaterThanOrEqual(12); expect(t.cost).toBeGreaterThan(0); }
    expect(TOWERS.flamer.air).toBe(false); expect(TOWERS.tesla.air && TOWERS.lens.air).toBe(true);
  });
});

function rigged() {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  let skip = false;
  const input = { beginTick() { if (skip) skip = false; else { pressed.clear(); released.clear(); } }, state: () => st };
  const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'intervals' }, seed: 3, simOpts: { skipGarage: true } });
  return { fresh: () => { skip = true; }, session, held, pressed, released, charges: () => snap(session).railCharges };
}

describe('rail', () => {
  it('caps charges at 3 and hold-Z dumps with railFired{charges:3}', () => {
    const h = rigged();
    h.session.step(30 * 120);
    expect(h.charges()).toBe(3);
    h.pressed.add('z'); h.held.add('z'); h.fresh();
    h.session.step(30);
    const ev = h.session.finish().events.find(e => e.type === 'railFired');
    expect(ev?.data?.charges).toBe(3);
  });
  it('tap Z fires one charge', () => {
    const h = rigged();
    h.session.step(30 * 120);
    h.pressed.add('z'); h.held.add('z'); h.fresh(); h.session.step(1);
    h.held.delete('z'); h.released.add('z'); h.fresh(); h.session.step(1);
    const evs = h.session.finish().events.filter(e => e.type === 'railFired');
    expect(evs.map(e => e.data?.charges)).toEqual([1]);
  });
});
