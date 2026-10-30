import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { awardSession, defaultProfile } from '../../../progression';
const rec = (gameSummary = {}, done = true, active = 1200): SessionRecord => ({ gameId: 'watershed', durationS: 2700,
  samples: Array.from({ length: active }, (_, t) => ({ t, power: 130, cadence: 90 })),
  events: done ? [{ t: 2700, type: 'rideDone' }] : [], gameSummary, stats: { zoneSeconds: [], sprints: 0, kj: 15 } }) as unknown as SessionRecord;
const a = (id: string) => achievements.find(a => a.id === id)!;
it('production goals accumulate across rides without unlocking on the first ordinary ride', () => {
  let p = defaultProfile();
  for (let i = 0; i < 4; i++) { p = awardSession(p, rec({ salmonHome: 100, harvests: 40 }), achievements).profile;
    expect(p.achievements).not.toContain('ws_salmon'); expect(p.achievements).not.toContain('ws_breadbasket'); }
  p = awardSession(p, rec({ salmonHome: 100, harvests: 40 }), achievements).profile;
  expect(p.achievements).toEqual(expect.arrayContaining(['ws_salmon','ws_breadbasket']));
});
it('mastery requires three completed qualifying rides, with active time and both mill outputs', () => {
  let p = defaultProfile(); const g = { bandPct: 90, flour: 180, planks: 180 };
  for (const r of [rec(g, false), rec(g, true, 1199), rec({ bandPct: 89, flour: 179, planks: 180 })]) {
    expect(a('ws_maestro').count!.of(r, p)).toBe(0); expect(a('ws_miller').count!.of(r, p)).toBe(0);
  }
  expect(a('ws_miller').count!.of(rec({ ...g, planks: 179 }), p)).toBe(0);
  expect(a('ws_miller').count!.of({ ...rec(g), gameId: 'dungeon' }, p)).toBe(0);
  for (let i = 0; i < 2; i++) { p = awardSession(p, rec(g), achievements).profile; expect(p.achievements).not.toContain('ws_maestro'); }
  p = awardSession(p, rec(g), achievements).profile;
  expect(p.achievements).toEqual(expect.arrayContaining(['ws_maestro','ws_miller']));
});
it('geological events must complete before the ride finishes; sightings and duplicate completions are insufficient', () => {
  const check = (type: string, kinds: string[], done = true) => a('ws_act_of_nature').check!(defaultProfile(), {
    ...rec({}, done), events: [...kinds.map(kind => ({ t: 1, type, data: { kind } })), ...(done ? [{ t: 2, type: 'rideDone' }] : [])],
  }, []);
  expect(check('eventHit', ['earthquake','volcano'])).toBe(false);
  expect(check('eventDone', ['earthquake','volcano'], false)).toBe(false);
  expect(check('eventDone', ['earthquake','earthquake'])).toBe(false);
  expect(check('eventDone', ['earthquake','volcano'])).toBe(true);
});
it('Delta Builder describes the actual gate and existing earned rewards stay earned', () => {
  expect(a('ws_delta').desc).toContain('8,000');
  expect(a('ws_delta').check!(defaultProfile(), rec({ delta: 7999 }), [])).toBe(false);
  expect(a('ws_delta').check!(defaultProfile(), rec({ delta: 8000 }), [])).toBe(true);
  const p = { ...defaultProfile(), achievements: achievements.map(a => a.id) };
  expect(awardSession(p, rec(), achievements).profile.achievements).toEqual(p.achievements);
});

it('the sim records geological completion events, not only visual cues', async () => {
  const { createGameSession, testProfile, NullInput, TuningRegistry } = await import('../../../core');
  const { module } = await import('../index');
  const tuning = new TuningRegistry({ storage: null });
  tuning.scoped('watershed').num('planScale', 0.1, 0.1, 2, 0.05);
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'idle' }, seed: 11,
    tuningRegistry: tuning, simOpts: { autopilot: true, events: ['earthquake','landslide'] } });
  for (let i = 0; i < 5 * 60 * 30 && !s.sim.isOver(); i++) s.step(1);
  const r = s.finish();
  expect(r.events.filter(e => e.type === 'eventDone').map(e => e.data?.kind).sort()).toEqual(['earthquake','landslide']);
  expect(r.events.some(e => e.type === 'rideDone')).toBe(true);
}, 30_000);
