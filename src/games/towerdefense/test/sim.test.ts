import { describe, it, expect } from 'vitest';
import { createGameSession, makeRng, runHeadless, testProfile, TimelineInput } from '../../../core';
import type { InputState, Profile } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { progressLine } from '../card';
import { BASE_PAD, BASE_X, BASE_Y, ELEMENTS, ELEMENT_WEAPON, FIELD_H, FIELD_W, KIND_FROM, KINDS, PADS, ROAD_LENGTH, TOWERS, flightAt, flightLength, padOrder, roadAt, towerBuildCost, type Element } from '../sim/defs';
import { nextBrood, troughHealFor, planWave, waveCounts, waveRole, type WaveOpts } from '../sim/waves';
import { UNLOCKS, VETERAN_STARS, isUnlocked, maxTowerLevel, nextUnlock, starTotal } from '../sim/unlocks';
import { CAMPAIGN } from '../sim/campaign';
import { readSave } from '../sim/sim';
import type { TdSnapshot } from '../sim/types';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as TdSnapshot;
const s_noErg = (s: ReturnType<typeof createGameSession>) => expect(s.mixer.debug().activeEffects.some((e) => e.mode === 'erg')).toBe(false);

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    }, 30_000);
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
  it('bosses take turns: a boss wave never repeats the last boss colour, even over colour cover', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const rng = makeRng(seed), seq: Element[] = [], bosses: Element[] = [];
      for (let w = 1; w <= 60; w++) {
        const boss = waveRole(w) === 'boss';
        const c = nextBrood(seq, rng, { ...BROOD, maxRun: boss ? 1 : BROOD.maxRun, avoid: boss ? bosses.at(-1) : undefined });
        seq.push(c); if (boss) bosses.push(c);
      }
      for (let i = 1; i < bosses.length; i++) expect(bosses[i], `seed ${seed} boss ${i}`).not.toBe(bosses[i - 1]);
      for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false); // the run limit holds
    }
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

describe('trough heal', () => {
  it('a clean trough heals in full; leaks scale it down to nothing', () => {
    expect(troughHealFor(0, 30, 15)).toBe(30);
    expect(troughHealFor(7.5, 30, 15)).toBe(15);
    expect(troughHealFor(15, 30, 15)).toBe(0);
    expect(troughHealFor(40, 30, 15)).toBe(0);
    expect(troughHealFor(1, 30, 0)).toBe(0); // 0 = any leak cancels it
    expect(troughHealFor(0, 30, 0)).toBe(30);
  });
  it('the dynamo stalls after stallGraceS under 15 rpm; leaks then hit x2.2', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { stars: 99, skipGarage: true } });
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
    const r = runHeadless({ game: module, script: 'idle', minutes: 8, seed: 1, simOpts: { stars: 99, autopilot: true, baseHp: 1000 } });
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

describe('levels meta', () => {
  it('old Garage saves migrate to veterans and the card waits for v4 progress', () => {
    const s = readSave({ bestWave: 9, bank: 300, upgrades: { plating: 2 } });
    expect(s).toMatchObject({ v: 4, endlessBest: 0, veteran: true, runs: 0 });
    expect(s).not.toHaveProperty('bank'); expect(s).not.toHaveProperty('upgrades');
    expect(readSave({ v: 3, bestWave: 4 }).veteran).toBe(false); // never bought anything
    expect(progressLine({ bestWave: 9 })).toBeNull();
    expect(progressLine({ v: 4, campaign: { x: 3 }, endlessBest: 0 })).toBe('1 levels · 3★');
    expect(progressLine(undefined)).toBeNull();
  });
  it('stars gate the unlocks: the Mortar, tower levels and Hard', () => {
    expect(maxTowerLevel(0)).toBe(3); expect(maxTowerLevel(8)).toBe(4); expect(maxTowerLevel(30)).toBe(5);
    expect(isUnlocked('mortar', 3)).toBe(false); expect(isUnlocked('mortar', 4)).toBe(true);
    expect(nextUnlock(5)?.id).toBe('tier4'); expect(nextUnlock(99)).toBeNull();
    expect(starTotal({ [CAMPAIGN[0].id]: 3, [CAMPAIGN[1].id]: 5, bogus: 3 })).toBe(6);
    expect(UNLOCKS.map((u) => u.stars)).toEqual([...UNLOCKS.map((u) => u.stars)].sort((x, y) => x - y));
  });
  it('a deep level pays catch-up scrap for the Endless waves it skips', () => {
    const ride = (index: number) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3,
        simOpts: { stars: 99, skipGarage: true, play: { campaign: index } } });
      for (let i = 0; i < 30 * 60 * 6 && snap(s).wave < 2; i++) s.step(1);
      return { earned: Number(s.sim.summary!().scrapEarned) };
    };
    const shallow = ride(0), deep = ride(CAMPAIGN.findIndex((c) => c.depth >= 5 && c.minutes === 15));
    expect(deep.earned).toBeGreaterThan(shallow.earned + 100);
  });
  it('a veteran rider starts with the first 12★ of unlocks; Endless records its best wave', () => {
    const profile: Profile = testProfile({ gameData: { towerdefense: { v: 3, runs: 4, bank: 50, bestWave: 12, upgrades: {} } } });
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    s.step(1);
    const gv = snap(s).garage!;
    expect(gv.stars).toBe(VETERAN_STARS);
    expect(gv.rows.find((r) => r.kind === 'unlocks')!.desc).toContain('Hard');
    s.sim.receive!({ type: 'garageRow', row: gv.rows.findIndex((r) => r.kind === 'start') }); // Endless
    s.step(30);
    expect(snap(s).phase).toBe('run'); expect(snap(s).wave).toBe(1);
    s.step(30 * 60 * 6);
    expect(snap(s).wave).toBeGreaterThanOrEqual(3);
    expect(saved.endlessBest).toBe(snap(s).wave - 1);
    expect(saved.veteran).toBe(true); expect(saved.runs).toBe(5);
  });
  it('the first visit opens on the ride select; the intro card shows the play controls that follow it', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3 });
    expect(s.sim.inMenu!()).toBe(true);
    expect(s.sim.hud!().playControls!.find(c => c.button === 'shiftersR')?.label).toBe('Tier I'); // before the first update (game intro)
    expect(s.sim.hud!().playControls!.filter(c => ['y', 'b', 'z'].includes(c.button)).map((c) => c.shortLabel)).toEqual(['Gatling', 'Fireball', 'Railgun']);
    s.step(1);
    expect(snap(s).phase).toBe('garage');
  });
});

describe('brood waves', () => {
  const weaponEffect = (s: ReturnType<typeof createGameSession>) => s.mixer.debug().activeEffects.find((e) => e.id === 'weapon')!;
  it('only a fresh run starts quietly: a short countdown, no spawns, then the flow', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { stars: 99, skipGarage: true } });
    s.step(30);
    const b = snap(s).brood;
    expect(b.wave).toBe(1);
    expect(b.countdownS).toBeGreaterThan(13); expect(b.countdownS).toBeLessThan(15); // firstLullS
    expect(b.lullS).toBe(15);
    expect(snap(s).weapon).toBe('gatling'); // a rider keeps their pick; the colour mounts nothing
    expect(snap(s).enemies).toHaveLength(0);
    // the quiet start already shows what's coming: the drone stream and the first spawns, out at the far edge
    const quiet = snap(s).radar!;
    expect(quiet.horizonS).toBe(90);
    expect(quiet.blips.length).toBeGreaterThan(0);
    expect(Math.min(...quiet.blips.map((b) => b.etaS))).toBeGreaterThan(14);
    s.step(30 * 15);
    expect(snap(s).brood.countdownS).toBe(0);
    let seen = 0; // the turret can drop a lone drone within a second of its spawn, so watch every frame
    for (let i = 0; i < 30 * 10; i++) { s.step(1); seen = Math.max(seen, snap(s).enemies.length); }
    expect(seen).toBeGreaterThan(0);
    const evs = s.finish().events.map((e) => e.type);
    expect(evs.indexOf('broodAnnounced')).toBeLessThan(evs.indexOf('waveStart'));
  });
  it('radar blips enter at the far edge and slide in: groups are planned a full window ahead', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { autopilot: true } });
    const seen = new Set<string>(), entries: number[] = [];
    for (let i = 0; i < 6 * 60 * 2; i++) {
      s.step(15);
      const r = snap(s).radar;
      if (!r) continue;
      for (const b of r.blips) {
        if (b.boss) continue;
        const id = `${b.lane}:${b.color}:${b.key}`;
        if (!seen.has(id)) { seen.add(id); entries.push(b.etaS); }
        expect(b.etaS).toBeLessThanOrEqual(r.horizonS);
        expect(b.hp).toBeGreaterThan(0);
      }
    }
    // Carrier broods and Stalker colour shifts start blips mid-scope; nearly everything else enters at the edge
    const late = entries.filter((e) => e > 75).length / entries.length;
    expect(entries.length).toBeGreaterThan(50);
    expect(late).toBeGreaterThan(0.85);
  });
  it('segments roll straight into each other on time, with the field still busy; a trough heals at its end', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3, simOpts: { autopilot: true, baseHp: 1000 } });
    for (const [key, value] of Object.entries({ segmentS: 30, troughS: 20, spawnTailS: 2 })) s.tuning.set(`towerdefense.${key}`, value);
    const stages: string[] = [];
    let busy = 0;
    for (let i = 0; i < 30 * 60 * 6; i++) {
      const before = snap(s);
      s.step(1);
      const v = snap(s);
      if (v.wave !== before.wave && before.phase === 'run') {
        if (v.lull > 0) throw new Error(`a lull after segment ${before.wave}`);
        if (before.enemies.length > 0) busy++;
      }
      const st = v.flow?.stage;
      if (st && stages.at(-1) !== st) stages.push(st);
    }
    expect(busy).toBeGreaterThan(0); // nothing waits for the field to clear
    expect(stages.slice(0, 5)).toEqual(['build', 'boss', 'trough', 'build', 'boss']);
    const heals = s.finish().events.filter((e) => e.type === 'waveCleared' && Number(e.data?.heal) > 0);
    expect(heals.length).toBeGreaterThan(0);
  });
  it('the game is the gearbox: resistance mode all run, the shifters step the tier and the level eases after it', () => {
    const h = rigged('z2');
    h.session.step(30 * 2);
    expect(weaponEffect(h.session).mode).toBe('resistance');
    expect(snap(h.session).tier).toBe(1);
    const lv1 = weaponEffect(h.session).levelPct!;
    h.pressed.clear(); h.pressed.add('shiftUpR'); h.fresh(); h.session.step(1);
    h.pressed.clear(); h.pressed.add('shiftUpL'); h.fresh(); h.session.step(1);
    expect(snap(h.session).tier).toBe(3);
    expect(weaponEffect(h.session).levelPct!).toBeLessThan(lv1 * 1.5); // eases in, not a wall
    h.session.step(30 * 5);
    expect(weaponEffect(h.session).levelPct!).toBeCloseTo(lv1 * 0.75 / 0.45, 0);
    for (let i = 0; i < 4; i++) { h.pressed.clear(); h.pressed.add('shiftUpR'); h.fresh(); h.session.step(1); }
    expect(snap(h.session).tier).toBe(5);
    h.pressed.clear(); h.pressed.add('shiftDnL'); h.fresh(); h.session.step(1);
    expect(snap(h.session).tier).toBe(4);
    expect(h.session.mixer.debug().gear).toBe(6); // the shifters never move a trainer gear in a run
    s_noErg(h.session);
  });
  it('weapon buttons and weapon taps no longer switch weapons', () => {
    const input = new TimelineInput([{ t: 1, press: 'a' }, { t: 1.1, release: 'a' }, { t: 2, press: 'b' }, { t: 2.1, release: 'b' }, { t: 3, press: 'y' }, { t: 3.1, release: 'y' }]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { stars: 99, skipGarage: true } });
    s.step(10);
    const w = snap(s).weapon;
    s.sim.receive!({ type: 'weapon', w: w === 'rail' ? 'gatling' : 'rail' });
    s.step(30 * 5);
    expect(snap(s).weapon).toBe(w);
  });
});

describe('workshop', () => {
  it('A opens it on the cursor\'s empty pad, a row tap builds, close closes', () => {
    const input = new TimelineInput([{ t: 0.5, press: 'a' }, { t: 0.6, release: 'a' }]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { stars: 99, skipGarage: true } });
    s.step(20);
    const ws = snap(s).workshop!;
    expect(ws).not.toBeNull();
    expect(ws.pad).toBeLessThan(PADS.length);
    expect(ws.rows.filter(r => r.kind === 'build').map((r) => r.tower)).toEqual(['tesla', 'flamer', 'lens', 'mortar']);
    expect(s.sim.hud!().controls!.some((c) => c.label === 'Build / upgrade / Exit')).toBe(true);
    // pick the tesla row by tap, then build it
    const scrap0 = snap(s).scrap;
    s.sim.receive!({ type: 'row', row: 0 }); s.step(1);
    expect(snap(s).towers).toHaveLength(1);
    expect(snap(s).towers[0].kind).toBe('tesla');
    expect(snap(s).scrap).toBeLessThanOrEqual(scrap0 - towerBuildCost('tesla') + 2);
    // the built pad now offers an upgrade and a refund
    expect(snap(s).workshop!.rows.map((r) => r.kind)).toEqual(['upgrade', 'sell']);
    s.sim.receive!({ type: 'close' }); s.step(1);
    expect(snap(s).workshop).toBeNull();
  });
  it('towers only fire on pedal power', () => {
    const run = (script: string) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script }, seed: 4, simOpts: { stars: 99, skipGarage: true } });
      s.tuning.set('towerdefense.baseHp', 1000); // keep the tower present to isolate power gating
      // a weak turret leaves the aliens to the tower: at full strength it kills the early stream before it arrives
      s.tuning.set('towerdefense.gatlingDamage', 0.5); s.tuning.set('towerdefense.railDamageMult', 0); s.tuning.set('towerdefense.flameDpsPerWatt', 0.02);
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

function rigged(script = 'intervals') {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  let skip = false;
  const input = { beginTick() { if (skip) skip = false; else { pressed.clear(); released.clear(); } }, state: () => st };
  const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script }, seed: 3, simOpts: { stars: 99, skipGarage: true } });
  return { fresh: () => { skip = true; }, session, held, pressed, released, charges: () => snap(session).railCharges };
}

describe('rail', () => {
  it('fires slow pulses by itself, no button: full pulses at heavies, quick snaps at light aliens', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'intervals' }, seed: 3, simOpts: { stars: 99, skipGarage: true, tier: 4 } });
    s.step(30 * 20);
    s.sim.receive!({ type: 'weapon', weapon: 'rail', epoch: snap(s).inputEpoch });
    s.step(1);
    expect(snap(s).weapon).toBe('rail');
    s.step(30 * 90);
    const evs = s.finish().events.filter(e => e.type === 'railFired');
    expect(evs.length).toBeGreaterThan(3);
    expect(evs.every(e => e.data?.tier === 4)).toBe(true);
    expect(snap(s).railMaxCharges).toBe(1);
  });
});
