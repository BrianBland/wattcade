// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import type { CadenzaSnapshot } from '../sim/sim';
import { Hud } from '../render/hud';
import { rideTimeline } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });
it('puts coaching and the countdown in the main text, with the actual target underneath', () => {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'target-follow' }, simOpts: { difficulty: 'pro' }, media: { timeline: rideTimeline([[0, 50, 'verse'], [50, 100, 'drop'], [100, 150, 'break']]) } });
  const hud = new Hud(document.body);
  s.step(48 * 30);
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 48);
  expect(document.querySelector('.ws-callout b')!.textContent).toBe('2');
  expect(document.querySelector('.ws-zone b')!.textContent).toBe('Z2–5');
  s.step(2 * 30);
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 50);
  expect(document.querySelector('.ws-zone span')!.textContent).toBe('0:15 left');
  s.step(30);
  const snap = s.sim.snapshot() as CadenzaSnapshot;
  snap.effort.instruction = 'Harder'; // sustained underpower wins over the usual sprint instruction
  hud.update(snap, '#00f0ff', 51);
  expect(document.querySelector('.ws-callout b')!.textContent).toBe('Harder');
  expect(document.querySelector('.ws-zone')!.textContent).not.toContain('DROP');
  expect(document.querySelector('.ws-drop')!.textContent).toBe('');
  hud.dispose();
});

it('exposes Longer Breaks as a touch menu action', () => {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput() });
  const hud = new Hud(document.body);
  hud.setSend((a) => s.sim.receive?.(a));
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 0);
  const row = document.querySelector('[data-i="4"]')!;
  expect(row.textContent).toContain('Longer breaks');
  row.dispatchEvent(new Event('pointerdown', { bubbles: true })); s.step(1);
  expect((s.sim.snapshot() as CadenzaSnapshot).menu?.longerBreaks).toBe(true);
  hud.dispose();
});
