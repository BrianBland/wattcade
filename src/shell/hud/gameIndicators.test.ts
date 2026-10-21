import { expect, it } from 'vitest';
import { createGameSession, testProfile } from '../../core';
import { InputHub } from '../../input';
import { getGame } from '../../games/registry';
import { synthTimeline } from '../../media/synth/queue';
import { actionIndicators } from './ActionIndicators';

for (const [gameId, buttons] of [
  ['warmup', []], ['towerdefense', ['b','y','z']], ['dungeon', ['a','b','y','z']],
  ['cadenza', []], ['watershed', ['a']], ['starfighter', ['a']], ['hamster', []], ['lighthouse', []],
] as const) it(`${gameId} publishes only its real cooldown/trigger statuses`, () => {
  const session = createGameSession({ game: getGame(gameId)!, profile: testProfile(), input: new InputHub(), fake: { script: 'z2' }, seed: 3,
    media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, simOpts: { autopilot: true, skipGarage: true, actionBot: true } });
  try {
    session.step(150);
    const hud = session.sim.hud!();
    expect(actionIndicators(hud.controls ?? []).map(h => h.id)).toEqual(buttons);
    const state = session.sim.snapshot() as any;
    if (gameId === 'starfighter') expect(actionIndicators(hud.controls!)[0].fill).toBeCloseTo(state.charge / 100);
    if (gameId === 'watershed') expect(actionIndicators(hud.controls!)[0].fill).toBeCloseTo(1 - state.boost.cd / state.boost.total);
  } finally { session.sim.dispose?.(); }
});

it('Watershed updates the same shared indicator while its boost is active and recharging', () => {
  const input = new InputHub(), session = createGameSession({ game: getGame('watershed')!, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { menu: false } });
  try {
    session.step(1); expect(actionIndicators(session.sim.hud!().controls!)[0].status).toBe('Ready');
    input.holdTouch(1, 'a'); session.step(1); input.releaseTouch(1);
    const item = actionIndicators(session.sim.hud!().controls!)[0];
    expect(item.status).toBe('Active'); expect(item.ready).toBe(false); expect(item.fill).toBeLessThan(1);
    session.step(5 * 30);
    expect(actionIndicators(session.sim.hud!().controls!)[0].status).toBe('Charging');
  } finally { session.sim.dispose?.(); }
});
