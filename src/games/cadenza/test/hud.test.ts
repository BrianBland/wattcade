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
  expect(document.querySelector('.ws-callout span')!.textContent).toBe('Sprint incoming');
  expect(document.querySelector('.ws-zone b')!.textContent).toBe('Z2–3'); // the band asked for, not the countdown's open ceiling
  s.step(2 * 30);
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 50);
  expect(document.querySelector('.ws-zone span')!.textContent).toBe('0:15 left');
  s.step(30);
  const snap = s.sim.snapshot() as CadenzaSnapshot;
  snap.effort.instruction = 'Harder'; // sustained underpower wins over the usual sprint instruction
  snap.effort.coaching = 'harder';
  hud.update(snap, '#00f0ff', 51);
  expect(document.querySelector('.ws-callout b')!.textContent).toBe('Harder');
  expect(document.querySelector('.ws-zone')!.textContent).not.toContain('DROP');
  expect(document.querySelector('.ws-callout span')!.textContent).toMatch(/^Z5 · \d+\+ W$/);
  hud.dispose();
});

it('fades routine instructions, keeps sustained coaching visible, and clears it when back on target', () => {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'target-follow' }, simOpts: { difficulty: 'pro' }, media: { timeline: rideTimeline([[0, 90, 'verse'], [90, 150, 'break']]) } });
  s.step(30 * 20);
  const snap = s.sim.snapshot() as CadenzaSnapshot, hud = new Hud(document.body);
  const visible = () => document.querySelector('.ws-callout')!.classList.contains('on');
  hud.update(snap, '#00f0ff', 0); expect(visible()).toBe(true);
  hud.update(snap, '#00f0ff', 3.1); expect(visible()).toBe(false);
  snap.effort.coaching = 'harder'; snap.effort.instruction = 'Harder';
  hud.update(snap, '#00f0ff', 4); expect(visible()).toBe(true);
  hud.update(snap, '#00f0ff', 15); expect(visible()).toBe(true);
  snap.effort.coaching = 'easier'; snap.effort.instruction = 'Ease Off';
  hud.update(snap, '#00f0ff', 16); expect(document.querySelector('.ws-callout b')!.textContent).toBe('Ease Off');
  snap.effort.coaching = null; snap.effort.instruction = 'Hold Steady';
  hud.update(snap, '#00f0ff', 17); expect(visible()).toBe(false);
  s.step(30 * 70);
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 18);
  expect(visible()).toBe(true); expect(document.querySelector('.ws-callout b')!.textContent).toBe('Break');
  expect(document.querySelector('.ws-callout span')!.textContent).toBe('Easy pedaling · Z1–2');
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 22.1); expect(visible()).toBe(false);
  expect(document.querySelector('.ws-zone b')!.textContent).toContain('Z1');
  hud.dispose();
});

it('starts the ride from the touch menu', () => {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput() });
  const hud = new Hud(document.body);
  hud.setSend((a) => s.sim.receive?.(a));
  hud.update(s.sim.snapshot() as CadenzaSnapshot, '#00f0ff', 0);
  const row = document.querySelector('[data-i="4"]')!;
  expect(row.textContent).toContain('Ride');
  row.dispatchEvent(new Event('pointerdown', { bubbles: true })); s.step(1);
  expect((s.sim.snapshot() as CadenzaSnapshot).menu).toBeNull();
  hud.dispose();
});
