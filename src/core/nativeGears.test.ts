import { expect, it } from 'vitest';
import type { Button, InputState, TrainerCommand } from '../contracts';
import { ResistanceMixer } from './mixer';
import { TuningRegistry } from './tuning';
import { testProfile } from './testProfile';

function input(pressed: Button[] = []): InputState { return { pressed: new Set(pressed), held: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'keyboard' }; }
function setup(native = true) {
  const sent: TrainerCommand[] = []; let enabled = native, revision = 0;
  const m = new ResistanceMixer({ profile: () => testProfile(), tuning: new TuningRegistry({ storage: null }).scoped('core'),
    nativeShifting: () => enabled, trainerRevision: () => revision,
    send: async c => { sent.push(c); return { ok: true }; } });
  m.useVirtualGears(true); m.set({ id: 'hill', mode: 'sim', gradePct: 2 });
  return { m, sent, native: (v: boolean) => { enabled = v; }, reconnect: () => { revision++; } };
}
it('shifts all 24 native gears promptly without altering the game hill', () => {
  const { m, sent } = setup();
  expect(m.gear).toBe(12);
  m.tick(1 / 30, input());
  m.tick(1 / 30, input(['shiftUpR']));
  expect(sent).toEqual([{ mode: 'sim', gradePct: 2, virtualGear: 12 }, { mode: 'sim', gradePct: 2, virtualGear: 13 }]);
  for (let i = 0; i < 30; i++) m.tick(1 / 30, input(['shiftUpL']));
  expect(m.gear).toBe(24); expect(m.compute()).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 24 });
  for (let i = 0; i < 30; i++) m.tick(1 / 30, input(['shiftDnR']));
  expect(m.gear).toBe(1); expect(m.compute()).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 1 });
});
it('preserves left-only mappings and ERG watts and restores the chosen gear in sim', () => {
  const { m } = setup(); m.useVirtualGears(true, 'L');
  m.tick(1 / 30, input(['shiftUpR'])); expect(m.gear).toBe(12);
  m.set({ id: 'workout', mode: 'erg', watts: 150, priority: 5 });
  m.tick(1 / 30, input(['shiftUpL'])); expect(m.compute()).toEqual({ mode: 'erg', watts: 150 });
  m.clear('workout'); expect(m.compute()).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 13 });
  m.useVirtualGears(false); expect(m.compute()).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 12 });
});
it('uses the easiest native gear for panic, then restores the selected gear', () => {
  const { m, sent } = setup(); m.tick(1 / 30, input(['shiftUpL']));
  m.panic(true); expect(sent.at(-1)).toEqual({ mode: 'sim', gradePct: 0, virtualGear: 1 });
  m.panic(false); m.tick(1 / 30, input()); expect(sent.at(-1)).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 13 });
});
it('resends the selected gear after reconnect and falls back when the trainer changes', () => {
  const { m, sent, reconnect, native } = setup(); m.tick(1 / 30, input(['shiftUpL']));
  reconnect(); m.tick(1 / 30, input());
  expect(sent).toHaveLength(2); expect(sent.at(-1)).toEqual({ mode: 'sim', gradePct: 2, virtualGear: 13 });
  native(false); m.tick(1 / 30, input(['shiftUpL']));
  expect(m.gear).toBe(7); expect(m.compute()).toEqual({ mode: 'sim', gradePct: 2.8 });
});
