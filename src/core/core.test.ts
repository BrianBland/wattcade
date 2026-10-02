import { describe, expect, it } from 'vitest';
import type { GameModule, InputState, Profile } from '../contracts';
import { FIXED_DT } from '../contracts';
import {
  BikeStateStore, FakeBike, FakeTrainer, NullInput, ResistanceMixer, TuningRegistry, createGameSession,
  hrZoneOf, powerZoneOf, runHeadless, testProfile, makeRng, GameLoop, SimClock, DataHub,
} from './index';

const prof = (over: Partial<Profile> = {}) => testProfile(over);
const sample = (power: number, cadence: number, hr?: number) => ({ power, cadence, hr });
const noInput = (pressed: string[] = []): InputState => ({
  held: new Set(), pressed: new Set(pressed as any), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script',
});

function runStore(store: BikeStateStore, p: Profile, seconds: number, s: ReturnType<typeof sample>) {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) { store.ingestTrainer(s); store.tick(FIXED_DT, p); }
}

describe('zones', () => {
  it('power zone boundaries', () => {
    expect([0.5, 0.65, 0.8, 1.0, 1.1, 1.3, 1.6].map(powerZoneOf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(powerZoneOf(0.549)).toBe(1); expect(powerZoneOf(0.56)).toBe(2); expect(powerZoneOf(1.5)).toBe(6);
  });
  it('hr zone boundaries', () => {
    expect([0.5, 0.65, 0.75, 0.85, 0.95].map(hrZoneOf)).toEqual([1, 2, 3, 4, 5]);
  });
  it('effort zone honours zoneSource', () => {
    const p = prof(); const st = new BikeStateStore();
    for (let i = 0; i < 300; i++) { st.ingestTrainer(sample(130, 90, 170)); st.tick(FIXED_DT, p); }
    expect(st.get().powerZone).toBe(2);
    expect(st.get().hrZone).toBe(5); // 170/185 = .92
    expect(st.get().effortZone).toBe(5); // auto -> HR fresh
    p.settings.zoneSource = 'power'; st.tick(FIXED_DT, p);
    expect(st.get().effortZone).toBe(2);
  });
  it('auto falls back to power when HR goes stale', () => {
    const p = prof(); const st = new BikeStateStore();
    runStore(st, p, 5, sample(130, 90, 170));
    expect(st.get().effortZone).toBe(5);
    for (let i = 0; i < 6 * 30; i++) { st.ingestTrainer(sample(130, 90)); st.tick(FIXED_DT, p); }
    expect(st.get().hr5s).toBeNull();
    expect(st.get().effortZone).toBe(2);
  });
});

describe('BikeStateStore', () => {
  it('integrates crank revs: 90 rpm x 60 s = 90 revs', () => {
    const st = new BikeStateStore(); runStore(st, prof(), 60, sample(150, 90));
    expect(st.get().crankRevs).toBeGreaterThan(89.5); expect(st.get().crankRevs).toBeLessThan(90.5);
    expect(st.get().kj).toBeCloseTo(9, 1); expect(st.get().activeSeconds).toBeCloseTo(60, 0);
  });
  it('detects sprints (>=1.2 FTP for >=2 s) and counts each once', () => {
    const p = prof(); const st = new BikeStateStore();
    runStore(st, p, 10, sample(120, 90));
    expect(st.get().sprintCount).toBe(0);
    runStore(st, p, 10, sample(300, 100));
    expect(st.get().sprinting).toBe(true); expect(st.get().sprintCount).toBe(1);
    runStore(st, p, 10, sample(100, 90));
    expect(st.get().sprinting).toBe(false);
    runStore(st, p, 10, sample(300, 100));
    expect(st.get().sprintCount).toBe(2);
  });
  it('zeroes stale trainer data', () => {
    const st = new BikeStateStore(); const p = prof();
    runStore(st, p, 1, sample(200, 90));
    for (let i = 0; i < 4 * 30; i++) st.tick(FIXED_DT, p);
    expect(st.get().raw.power).toBe(0);
  });
});

function mixer(p = prof()) {
  const sent: any[] = [];
  const reg = new TuningRegistry({ storage: null });
  const m = new ResistanceMixer({ profile: () => p, tuning: reg.scoped('core'), send: (c) => { sent.push(c); return Promise.resolve({ ok: true }); } });
  const tick = (s: number, inp = noInput()) => { for (let i = 0; i < Math.round(s / FIXED_DT); i++) m.tick(FIXED_DT, inp); };
  return { m, sent, tick, p };
}

describe('ResistanceMixer', () => {
  it('sums sim grades, applies difficulty to positive grade, clamps', () => {
    const { m, sent, tick, p } = mixer();
    m.set({ id: 'a', mode: 'sim', gradePct: 3 }); m.set({ id: 'b', mode: 'sim', gradePct: 2 });
    m.setDifficulty(1.2); tick(0.1);
    expect(sent.at(-1)).toEqual({ mode: 'sim', gradePct: 6 });
    m.set({ id: 'a', mode: 'sim', gradePct: 50 }); tick(1);
    expect(sent.at(-1).gradePct).toBe(p.settings.maxGradePct);
    m.clearAll(); m.set({ id: 'a', mode: 'sim', gradePct: -20 }); tick(1);
    expect(sent.at(-1).gradePct).toBe(-5);
  });
  it('highest-priority mode wins; erg takes max and clamps', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'g', mode: 'sim', gradePct: 4 });
    m.set({ id: 'e1', mode: 'erg', priority: 1, watts: 150 }); m.set({ id: 'e2', mode: 'erg', priority: 1, ftpFraction: 0.9 });
    tick(0.1);
    expect(sent.at(-1)).toEqual({ mode: 'erg', watts: 180 });
    m.set({ id: 'e3', mode: 'erg', priority: 1, watts: 5000 }); tick(1);
    expect(sent.at(-1)).toEqual({ mode: 'erg', watts: 300 });
    m.clear('e3'); m.clear('e2'); m.set({ id: 'e1', mode: 'erg', priority: 1, watts: 10 }); tick(1);
    expect(sent.at(-1)).toEqual({ mode: 'erg', watts: 60 });
  });
  it('resistance levels add and clamp', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'a', mode: 'resistance', priority: 2, levelPct: 70 }); m.set({ id: 'b', mode: 'resistance', levelPct: 50 }); tick(0.1);
    expect(sent.at(-1)).toEqual({ mode: 'resistance', levelPct: 100 });
  });
  it('rate limits: <0.2% change ignored, and at most one command per 750 ms', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'a', mode: 'sim', gradePct: 3 }); tick(0.1);
    expect(sent.length).toBe(1);
    m.set({ id: 'a', mode: 'sim', gradePct: 3.1 }); tick(2);
    expect(sent.length).toBe(1);
    m.set({ id: 'a', mode: 'sim', gradePct: 4 }); tick(0.05);
    expect(sent.length).toBe(2);
    m.set({ id: 'a', mode: 'sim', gradePct: 6 }); tick(0.3);
    expect(sent.length).toBe(2); // within 750 ms
    tick(0.6);
    expect(sent.length).toBe(3);
    // erg threshold 5 W
    m.set({ id: 'e', mode: 'erg', priority: 5, watts: 150 }); tick(1); expect(sent.length).toBe(4);
    m.set({ id: 'e', mode: 'erg', priority: 5, watts: 153 }); tick(1); expect(sent.length).toBe(4);
    m.set({ id: 'e', mode: 'erg', priority: 5, watts: 156 }); tick(1); expect(sent.length).toBe(5);
  });
  it('TTL expires in sim time', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'a', mode: 'sim', gradePct: 6, ttl: 2 }); tick(1);
    expect(sent.at(-1).gradePct).toBe(6);
    tick(1.5);
    expect(m.debug().activeEffects.length).toBe(0);
    expect(sent.at(-1).gradePct).toBe(0);
  });
  it('panic overrides immediately and until resumed', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'e', mode: 'erg', watts: 200 }); tick(0.1);
    m.panic(true);
    expect(sent.at(-1)).toEqual({ mode: 'sim', gradePct: 0 });
    const n = sent.length; tick(3); expect(sent.length).toBe(n);
    m.panic(false); tick(1); expect(sent.at(-1)).toEqual({ mode: 'erg', watts: 200 });
  });
  it('virtual gears add (gear-6)*step grade in sim mode only', () => {
    const { m, sent, tick } = mixer();
    m.set({ id: 'a', mode: 'sim', gradePct: 2 }); m.useVirtualGears(true);
    m.tick(FIXED_DT, noInput(['shiftUpR'])); m.tick(FIXED_DT, noInput(['shiftUpL']));
    expect(m.gear).toBe(8); tick(1);
    expect(sent.at(-1).gradePct).toBeCloseTo(2 + 2 * 0.8, 5);
    for (let i = 0; i < 20; i++) m.tick(FIXED_DT, noInput(['shiftDnL']));
    expect(m.gear).toBe(1);
    m.clearAll(); m.set({ id: 'e', mode: 'erg', watts: 150 }); tick(1);
    expect(sent.at(-1)).toEqual({ mode: 'erg', watts: 150 });
  });
});

describe('FakeTrainer', () => {
  it('ERG converges to target with ~2 s time constant', () => {
    const t = new FakeTrainer(); t.apply({ mode: 'erg', watts: 200 });
    let p = 0;
    for (let i = 0; i < 2 * 30; i++) p = t.step(FIXED_DT, 90, { massKg: 84, gear: 6 }).power!;
    expect(p).toBeGreaterThan(200 * 0.6); expect(p).toBeLessThan(200 * 0.66);
    for (let i = 0; i < 20 * 30; i++) p = t.step(FIXED_DT, 90, { massKg: 84, gear: 6 }).power!;
    expect(p).toBeCloseTo(200, 0);
  });
  it('ERG overrides script power; script power applies in sim mode; cadence 0 -> 0', () => {
    const t = new FakeTrainer(); const env = { massKg: 84, gear: 6 };
    t.apply({ mode: 'erg', watts: 100 });
    let p = 0;
    for (let i = 0; i < 30 * 30; i++) p = t.step(FIXED_DT, 90, env, 300).power!;
    expect(p).toBeCloseTo(100, 0);
    expect(t.step(FIXED_DT, 0, env, 300).power).toBe(0);
    t.apply({ mode: 'sim', gradePct: 0 });
    expect(t.step(FIXED_DT, 90, env, 300).power).toBe(300);
  });
  it('sim power grows with grade; resistance formula', () => {
    const t = new FakeTrainer();
    const flat = t.step(FIXED_DT, 90, { massKg: 84, gear: 6 }).power!;
    t.apply({ mode: 'sim', gradePct: 4 });
    expect(t.step(FIXED_DT, 90, { massKg: 84, gear: 6 }).power!).toBeGreaterThan(flat + 100);
    t.apply({ mode: 'resistance', levelPct: 40 });
    expect(t.step(FIXED_DT, 90, { massKg: 84, gear: 6 }).power).toBeCloseTo(180, 5);
  });
  it('FakeBike script drives power & HR lags', () => {
    const p = prof(); const fb = new FakeBike({ rng: makeRng(1), script: 'z2' });
    const st = new BikeStateStore(); const dh = new DataHub(st);
    dh.attachTrainer(fb.trainer); dh.attachHr(fb.hr, { fake: true });
    for (let i = 0; i < 5 * 30; i++) { fb.tick(FIXED_DT, { profile: p, gear: 6 }); st.tick(FIXED_DT, p); }
    expect(st.get().raw.power).toBeCloseTo(130, 3);
    expect(st.get().connected.fake).toBe(true);
    expect(st.get().raw.cadence).toBeGreaterThan(84);
    expect(st.get().hr5s!).toBeLessThan(80);
    for (let i = 0; i < 180 * 30; i++) { fb.tick(FIXED_DT, { profile: p, gear: 6 }); st.tick(FIXED_DT, p); }
    expect(st.get().hr5s!).toBeGreaterThan(60 + 125 * 0.65 * 0.75 - 4);
  });
});

describe('tuning registry', () => {
  it('namespaces, clamps, overrides live, resets, persists', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const reg = new TuningRegistry({ profileId: 'p1', storage });
    const n = reg.scoped('dungeon').num('revsPerShot', 5, 1, 20);
    expect(reg.list().map((e) => e.key)).toEqual(['dungeon.revsPerShot']);
    expect(reg.set('dungeon.revsPerShot', 99)).toBe(true); expect(n()).toBe(20);
    expect(reg.set('nope', 1)).toBe(false);
    const reg2 = new TuningRegistry({ profileId: 'p1', storage });
    expect(reg2.scoped('dungeon').num('revsPerShot', 5, 1, 20)()).toBe(20);
    reg.reset('dungeon'); expect(n()).toBe(5);
    expect(new TuningRegistry({ profileId: 'p1', storage }).scoped('dungeon').num('revsPerShot', 5, 1, 20)()).toBe(5);
    const c = reg.scoped('x').choice('m', 'a', ['a', 'b'] as const); reg.set('x.m', 'b'); expect(c()).toBe('b');
    expect(reg.set('x.m', 'zzz')).toBe(false);
  });
});

describe('loop', () => {
  it('steps by realDt x timeScale, caps at 3000', () => {
    const clock = new SimClock(); let n = 0;
    const loop = new GameLoop(clock, () => { n++; });
    loop.frame(1); expect(n).toBe(30);
    clock.timeScale = 100; n = 0; loop.frame(10); expect(n).toBe(3000);
    loop.pause(); n = 0; loop.frame(1); expect(n).toBe(0);
  });
});

// A tiny game: counts revs and requests a grade.
const toyGame: GameModule = {
  id: 'toy', title: 'Toy', blurb: '', tags: [],
  createSim(ctx, opts) {
    const per = ctx.tuning.num('revsPerShot', 5, 1, 20);
    let shots = 0, last = 0, r = 0;
    ctx.resistance.set({ id: 'hill', mode: 'sim', gradePct: 3 });
    return {
      update() {
        const revs = ctx.bike().crankRevs;
        while (revs - last >= per()) { last += per(); shots++; r += ctx.rng(); ctx.emit({ type: 'shot' }); }
      },
      snapshot: () => ({ hooks: { storm: ctx.clock.now() > 60 && ctx.clock.now() < 120 } }),
      isOver: () => false,
      summary: () => ({ shots, r: +r.toFixed(6), autopilot: String((opts as any)?.autopilot ?? false) }),
    };
  },
  loadRenderer: () => Promise.reject(new Error('n/a')),
};

describe('createGameSession / runHeadless', () => {
  it('runs headless, namespaced tuning, events, commands', () => {
    const r = runHeadless({ game: toyGame, script: 'z2', minutes: 2, seed: 3, simOpts: { autopilot: true } });
    expect(r.summary.autopilot).toBe('true');
    expect(Number(r.summary.shots)).toBeGreaterThan(30); // 90rpm*120s/5 ~ 36 (less warmup)
    expect(r.events.length).toBe(Number(r.summary.shots));
    expect(r.mixerCommands[0]).toEqual({ mode: 'sim', gradePct: 3 });
    expect(r.simMinutes).toBeCloseTo(2, 2);
    expect(r.stats.avgPower).toBeGreaterThan(100);
    const r2 = runHeadless({ game: toyGame, script: 'z2', minutes: 2, seed: 3, tuning: { 'toy.revsPerShot': 10 } });
    expect(Number(r2.summary.shots)).toBeLessThan(Number(r.summary.shots));
  });
  it('is deterministic for the same seed and differs by seed', () => {
    const a = runHeadless({ game: toyGame, script: 'mash', minutes: 3, seed: 5 });
    const b = runHeadless({ game: toyGame, script: 'mash', minutes: 3, seed: 5 });
    const c = runHeadless({ game: toyGame, script: 'mash', minutes: 3, seed: 6 });
    expect(a.summary).toEqual(b.summary); expect(a.stats).toEqual(b.stats);
    expect(a.mixerCommands).toEqual(b.mixerCommands);
    expect(c.summary).not.toEqual(a.summary);
  });
  it('storm-ready script reacts to snapshot hooks', () => {
    const r = runHeadless({ game: toyGame, script: 'storm-ready', minutes: 3, seed: 1 });
    expect(r.stats.maxPower).toBeGreaterThan(0.9 * 200);
    const calm = runHeadless({ game: toyGame, script: 'z2', minutes: 3, seed: 1 });
    expect(calm.stats.maxPower).toBeLessThan(0.7 * 200);
  });
  it('sprints script yields sprint count; session record & pause', () => {
    const s = createGameSession({ game: toyGame, profile: prof(), input: new NullInput(), seed: 1, fake: { script: 'sprints' } });
    s.step(30 * 60 * 5);
    s.pause(); expect(s.mixer.debug().panic).toBe(true);
    const n = s.commands.length; s.frame(10); expect(s.commands.length).toBe(n);
    s.resume();
    const rec = s.finish();
    expect(rec.stats.sprints).toBe(2);
    expect(rec.samples.length).toBeGreaterThanOrEqual(299);
    expect(rec.stats.zoneSeconds.length).toBe(5);
    expect(s.debugValues()['core.mode']).toBeDefined();
  });
  it('fake:false with provided DataHub uses no fake and locks timeScale at 1x when real devices connected', () => {
    const dh = new DataHub();
    const s = createGameSession({ game: toyGame, profile: prof(), input: new NullInput(), dataHub: dh, fake: false });
    expect(s.fakeBike).toBeUndefined();
    s.clock.timeScale = 50; s.frame(1);
    expect(s.clock.now()).toBeCloseTo(50, 0); // no real devices -> scale honoured
    dh.store.setConnected({ trainer: true }); const t0 = s.clock.now(); s.frame(1);
    expect(s.clock.now() - t0).toBeCloseTo(1, 1);
  });
});

describe('BikeStateStore HR sources', () => {
  it('ignores 0 bpm relayed by the trainer and prefers the dedicated HR device', () => {
    const p = prof(); const st = new BikeStateStore();
    for (let i = 0; i < 30 * 6; i++) {
      st.ingestTrainer({ power: 150, cadence: 90, hr: 0 }); // KICKR with no strap paired
      if (i % 30 === 0) st.ingestHr({ hr: 140 });           // watch at 1 Hz
      st.tick(FIXED_DT, p);
    }
    const s = st.tick(FIXED_DT, p);
    expect(s.raw.hr).toBe(140);
    expect(s.hr5s).toBeCloseTo(140, 5);
  });
  it('falls back to trainer-relayed HR when no dedicated device is fresh', () => {
    const p = prof(); const st = new BikeStateStore();
    st.ingestHr({ hr: 0 });
    for (let i = 0; i < 60; i++) { st.ingestTrainer({ power: 150, cadence: 90, hr: 120 }); st.tick(FIXED_DT, p); }
    expect(st.tick(FIXED_DT, p).raw.hr).toBe(120);
  });
});
