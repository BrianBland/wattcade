import { describe, expect, it } from 'vitest';
import type { Button, InputState } from '../../../contracts';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { migrateEconomy } from '../sim/economy';
import type { SeasideSave, SeasideSnapshot } from '../sim/types';
import { STORY } from '../sim/story';
class Controls extends NullInput {
  pressed = new Set<Button>(); paddleR = 0;
  override state(): Readonly<InputState> { return { ...super.state(), pressed: this.pressed, paddleR: this.paddleR }; }
}
const fixture = (sceneId = 'shop1', economy: unknown = null, script = 'z2', raw?: unknown) => {
  const input = new Controls(), saves: SeasideSave[] = [], events: Array<{ type: string; data?: Record<string, unknown> }> = [];
  const s = createGameSession({ game: module, profile: testProfile({ gameData: { seaside: raw ?? { economy: migrateEconomy(economy), checkpoint: { sceneId, progress: 0 } } } }),
    input, fake: { script }, seed: 1, simOpts: { skipMenu: true }, onSave: (d) => saves.push(d as SeasideSave), onEmit: (e) => events.push(e) });
  const snap = () => s.sim.snapshot() as SeasideSnapshot;
  const send = (action: string, index?: number) => { s.sim.receive?.({ type: 'shop', action, index }); s.step(1); };
  const key = (b: Button) => { input.pressed.add(b); s.step(1); input.pressed.clear(); };
  return { s, snap, saves, input, send, key, events };
};
const until = (f: ReturnType<typeof fixture>, predicate: () => boolean, seconds: number) => {
  for (let i = 0; i < seconds && !predicate(); i++) f.s.step(30);
  expect(predicate()).toBe(true);
};
describe('shop story integration', () => {
  it('supports controller browse / buy / back and keeps purchases through resume and the chapter boundary', () => {
    const f = fixture('shop1', { cash: 20000 });
    f.key('right'); expect(f.snap().shop?.index).toBe(1);
    f.key('a'); expect(f.snap().economy.extras).toEqual(['lures']);
    expect(f.saves.at(-1)?.checkpoint?.sceneId).toBe('shop1');
    const resumed = fixture('shop1', null, 'z2', f.saves.at(-1));
    expect(resumed.snap().economy.extras).toEqual(['lures']);
    resumed.key('b'); expect(resumed.snap().sceneId).toBe('toPier'); expect(resumed.snap().economy.rod).toBe('surf');
    until(resumed, () => resumed.snap().sceneId === 'eyesOpen', 1600);
    expect(resumed.snap().economy).toMatchObject({ rod: 'deep', extras: ['lures'], rods: ['pier', 'surf', 'deep'] });
    expect(fixture('shop1', null, 'z2', resumed.saves.at(-1)).snap().economy).toEqual(resumed.snap().economy);
  });
  it('paddle edges and touch actions select / purchase once', () => {
    const f = fixture('shop1', { cash: 5000 });
    f.input.paddleR = 1; f.s.step(30); expect(f.snap().shop?.index).toBe(1);
    f.send('buy'); expect(f.snap().economy.cash).toBe(4400);
    f.send('buy'); expect(f.snap().economy.cash).toBe(4400);
    f.send('leave'); expect(f.snap().sceneId).toBe('toPier'); expect(f.snap().economy.rod).toBe('surf');
  });
  it.each(['idle', 'z2', 'sprints', 'target-follow'])('%s with no money reaches the Big One carrying the Deep', (script) => {
    const f = fixture('pier', { extras: ['bucketHat'] }, script);
    until(f, () => f.snap().sceneId === 'bigOne', 1600);
    expect(f.snap().economy).toMatchObject({ rod: 'deep', extras: [], cash: 0 });
    expect(f.events.find((e) => e.type === 'bigOneReady')?.data).toEqual({ rod: 'deep', ready: true });
  });
  it('an idle bonus turnout ends after exactly three minutes, is offered once, and never blocks credit', () => {
    const f = fixture('shop1', null, 'idle'); f.send('bonus');
    expect(f.snap().shop?.bonusRemaining).toBeCloseTo(180); expect(f.snap().fishing?.location).toBe('turnout');
    f.s.step(30 * 179); expect(f.snap().shop?.bonusRemaining).toBeCloseTo(1);
    f.s.step(30); expect(f.snap().shop?.bonusRemaining).toBeNull();
    expect(f.snap().shop?.bonusAvailable).toBe(false); expect(f.snap().economy.bonusUsed).toEqual(['shop1']);
    const restored = fixture('shop1', null, 'idle', f.saves.at(-1));
    restored.send('bonus'); expect(restored.snap().shop?.bonusRemaining).toBeNull();
    restored.send('leave'); expect(restored.snap().economy.rod).toBe('surf');
  });
  it('bonus catches use the real fishing mechanic and are weighed when returning to the counter', () => {
    const f = fixture(); f.send('bonus'); f.s.step(30 * 180);
    expect(f.snap().economy.cash).toBeGreaterThan(0); expect(f.snap().economy.creel).toEqual([]);
    expect(f.snap().shop?.receipt.lines.some((l) => l.label.includes('kg'))).toBe(true);
  });
  it('saves a landed catch with a checkpoint after its bite, so reload cannot bank that bite again', () => {
    const f = fixture('turnout1'); until(f, () => f.snap().economy.creel.length > 0, 240);
    const saved = f.saves.at(-1)!;
    expect(saved.economy?.creel).toHaveLength(1);
    const r = fixture('turnout1', null, 'z2', saved);
    expect(r.snap().fishing?.slot).toBe(1);
    until(r, () => r.snap().sceneId === 'shop1', 1000);
    expect(r.snap().shop?.receipt.lines.filter((l) => l.label.includes('kg'))).toHaveLength(2);
    const soldSave = r.saves.at(-1)!;
    expect(fixture('shop1', null, 'z2', soldSave).snap().economy.cash).toBe(r.snap().economy.cash);
  });
  it.each(['bigOne', 'eyesOpen', 'cavern'])('repairs old / chapter-select equipment at %s', (scene) => {
    const f = fixture(scene); expect(f.snap().economy.rod).toBe('deep');
  });
  it('never comments on Lou in the rider’s monologue', () => {
    expect(STORY.flatMap((s) => s.monologue).some((l) => /\blou\b/i.test(l.text))).toBe(false);
  });
});
