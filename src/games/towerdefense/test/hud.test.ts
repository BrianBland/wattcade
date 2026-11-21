// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { TdHud, guideHtml, layoutRadar, radarHtml, tierHtml } from '../render/panels';
import { layout } from '../render/layout';
import type { TdSnapshot } from '../sim/types';
import { WEAPON_NAME } from '../sim/defs';

it('counts down the quiet start, then shows the mounted weapon and the radar; combat leaves the controls to the shell', () => {
  const session = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7, simOpts: { skipGarage: true } });
  const hud = new TdHud();
  document.body.append(hud.root);
  const draw = () => {
    const s = session.sim.snapshot() as TdSnapshot;
    hud.render(s, layout(820, 1180, 160, true), 820);
    return s;
  };
  try {
    session.step(3 * 30);
    const s = draw(), strip = hud.root.querySelector<HTMLElement>('.td-current')!;
    expect(strip.hidden).toBe(false);
    expect(strip.textContent).toContain(`${Math.ceil(s.brood.countdownS)}s`);
    expect(strip.textContent).toContain('get ready');
    expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(true);
    session.sim.receive!({ type: 'pad', pad: 1, epoch: s.inputEpoch });
    session.step(1);
    expect(draw().workshop).toBeTruthy();
    expect(strip.hidden).toBe(false);
    expect(strip.querySelector('.td-count')).not.toBeNull();
    session.sim.receive!({ type: 'close' });
    session.step(45 * 30);
    const combat = draw();
    expect(combat.lull).toBe(0);
    expect(strip.querySelector('.td-count')).toBeNull();
    expect(strip.querySelector('.td-brood b')?.textContent).toBe(WEAPON_NAME[combat.weapon]);
    // portrait: the radar replaces the old next-brood line, one blip per incoming group
    const radar = hud.root.querySelector('.td-next .td-radar.h')!;
    expect(radar).not.toBeNull();
    expect(combat.radar!.blips.length).toBeGreaterThan(0);
    expect(radar.querySelectorAll('.td-blip')).toHaveLength(combat.radar!.blips.length);
    expect(hud.root.querySelector('.td-status')?.textContent).toMatch(/ROUND 1|WARM-UP/);
    // the only buttons over combat are the tier steppers (− / +), for touch riders without shifters
    expect([...hud.root.querySelectorAll<HTMLElement>('button')].map((b) => b.dataset.command)).toEqual(['tier', 'tier']);
  } finally {
    hud.root.remove(); session.sim.dispose?.();
  }
});

function hudFixture() {
  const session = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7, simOpts: { skipGarage: true } });
  const initial = session.sim.snapshot() as TdSnapshot;
  session.sim.dispose?.();
  const radar: NonNullable<TdSnapshot['radar']> = { horizonS: 90, roads: 2, air: true, scale: 400, lead: 'red', boss: null, blips: [
    { etaS: 81, hp: 400, color: 'red', lane: 0, n: 3, key: 20 }, { etaS: 45, hp: 100, color: 'blue', lane: 1, n: 5, key: 12 },
    { etaS: 30, hp: 40, color: 'blue', lane: -1, n: 2, key: 10 }, { etaS: 9, hp: 900, color: 'purple', lane: 0, n: 1, key: 4 }] };
  const snapshot: TdSnapshot = { ...initial, phase: 'run', garage: null, lull: 0, set: { set: 2, pos: 2, of: 3, role: 'work', warmup: false },
    flow: { stage: 'build', set: 2, sets: 4, leftS: 64 }, radar, suggestedTier: 3,
    brood: { ...initial.brood, countdownS: 0 }, boss: null, banner: null, workshop: null };
  const hud = new TdHud();
  const draw = (s: TdSnapshot, W = 1180, H = 820) => hud.render(s, layout(W, H, 160, true), W);
  return { snapshot, hud, draw, card: hud.root.querySelector<HTMLElement>('.td-objective')! };
}

it('the landscape card shows the round, the wave, what leads and an upright radar', () => {
  const { snapshot: s, hud, draw, card } = hudFixture();
  draw({ ...s, scrap: 180 });
  expect(card.hidden).toBe(false);
  expect(hud.root.querySelector('.td-status')?.textContent).toContain('ROUND 2/4');
  expect(card.textContent).toContain('Rising wave');
  expect(card.textContent).toContain('Red leads');
  expect(card.textContent).toContain('64s · then a heavier wave');
  expect(card.textContent).not.toMatch(/trough|peak|build any time/i);
  const radar = card.querySelector('.td-radar.v')!;
  expect(radar.querySelectorAll('.td-blip')).toHaveLength(4);
  expect(radar.querySelectorAll('.td-blip.air')).toHaveLength(1);
  expect([...radar.querySelectorAll('.td-radar-lanes small')].map((n) => n.textContent)).toEqual(['Road 1', 'Road 2']);
  expect(hud.root.querySelector('.td-next .td-radar')).toBeNull(); // not twice
  expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(true);
  draw({ ...s, flow: { ...s.flow!, stage: 'trough' }, suggestedTier: 2 });
  expect(card.textContent).toContain('Light wave');
  expect(card.textContent).toContain('No leaks heals the base');
  draw({ ...s, lull: 12 });
  expect(card.textContent).toContain('Get ready');
  expect(card.textContent).toContain('Starts in 12s');
  draw({ ...s }, 844, 390); // phone landscape: no card, the radar sits in the strip
  expect(card.hidden).toBe(true);
  expect(hud.root.querySelector('.td-next .td-radar.h')).not.toBeNull();
});

it('the radar places blips by arrival and road, sizes them against the recent peak and rings a coming boss', () => {
  const { snapshot: s, draw, hud } = hudFixture();
  const boss = { etaS: 72, hp: 5000, color: 'purple' as const, lane: 0, n: 1, key: 30, boss: true };
  draw({ ...s, radar: { ...s.radar!, boss: { inS: 45, color: 'purple' }, blips: [...s.radar!.blips, boss] } }, 820, 1180);
  const radar = hud.root.querySelector('.td-radar')!;
  expect(radar.textContent).toContain('Boss in 45s');
  const ring = radar.querySelector<HTMLElement>('.td-blip.boss')!;
  expect(ring.style.getPropertyValue('--p')).toBe('0.800');
  const blips = [...radar.querySelectorAll<HTMLElement>('.td-blip:not(.boss)')];
  const v = (i: number, k: string) => Number(blips[i].style.getPropertyValue(k));
  expect(v(0, '--p')).toBeCloseTo(0.9, 3); // 81 of 90 s out
  expect(v(3, '--p')).toBeCloseTo(0.1, 3);
  expect(v(0, '--k')).toBeCloseTo(1, 3); // at the peak
  expect(v(2, '--k')).toBeCloseTo(0.3 + 0.7 * Math.sqrt(0.1), 3); // 40 of 400
  expect(v(3, '--k')).toBeCloseTo(1, 3); // capped
  // one column per road, each blip near its column's centre; Gliders share a road column (key 10 -> road 1)
  expect(Math.abs(v(0, '--x') - 1 / 4)).toBeLessThan(1 / 4);
  expect(Math.abs(v(1, '--x') - 3 / 4)).toBeLessThan(1 / 4);
  expect(Math.abs(v(2, '--x') - 1 / 4)).toBeLessThan(1 / 4);
  expect(blips[1].classList.contains('blue')).toBe(true);
});

it('prioritizes boss phases and sprint windows in a boss peak', () => {
  const { snapshot: s0, draw, card, hud } = hudFixture();
  const s: TdSnapshot = { ...s0, flow: { ...s0.flow!, stage: 'boss' } };
  const boss: NonNullable<TdSnapshot['boss']> = { id: 1, name: 'Bulwark Tyrant', phase: 1, phaseCount: 3, color: 'purple', weapon: 'rail', pending: false, countdownS: 0, telegraph: true, exposed: false, windowLeftS: 4, sprintBoost: false, charge: null, shield: 0, hp: 0.8, escapeS: 150 };
  draw({ ...s, boss });
  expect(card.textContent).toContain('Bulwark Tyrant · phase 1/3');
  expect(card.textContent).toContain('Shift to V');
  draw({ ...s, boss: { ...boss, exposed: true, telegraph: false } });
  expect(card.textContent).toContain('Exposed');
  draw({ ...s, boss: { ...boss, pending: true, countdownS: 7 } });
  expect(card.textContent).toContain('Phase 2 next');
  expect(card.textContent).toContain('Starts in 7s');
  draw({ ...s, boss: { ...boss, telegraph: false, shield: 0.5 } });
  expect(card.textContent).toContain('Shield plates up');
  draw({ ...s, boss: { ...boss, name: 'Ram Tyrant', color: 'red', weapon: 'flame', telegraph: false, charge: 'warn' } });
  expect(card.textContent).toContain('Ram charge incoming');
  draw({ ...s, boss: { ...boss, telegraph: false } });
  expect(card.textContent).toContain('Boss wave');
  expect(card.textContent).not.toMatch(/called effort|ERG push/i);
  // the boss bar runs along the top of the field: name, phase notches, HP, plates and a gold flash when Exposed
  draw({ ...s, boss: { ...boss, telegraph: false, shield: 0.5 } });
  const hb = hud.root.querySelector<HTMLElement>('.td-bossbar')!;
  expect(hb.hidden).toBe(false);
  expect(hb.classList.contains('purple')).toBe(true);
  expect(hb.textContent).toContain('Bulwark Tyrant');
  expect(hb.textContent).toContain('Phase 1/3 · breaks through in 2:30');
  expect(hb.querySelector<HTMLElement>('.td-bb-track > i')!.style.getPropertyValue('--k')).toBe('0.8000');
  expect(hb.querySelectorAll('.td-bb-track > s')).toHaveLength(2);
  expect(hb.querySelector('.td-bb-track > u')).not.toBeNull();
  draw({ ...s, boss: { ...boss, telegraph: false, exposed: true, windowLeftS: 3, escapeS: 40 } });
  expect(hb.classList.contains('exposed')).toBe(true);
  expect(hb.textContent).toContain('Exposed · 3s · tier V · breaks through in 40s');
  draw({ ...s, boss: { ...boss, id: 0 } });
  expect(hb.hidden).toBe(true); // not on the field yet
  draw({ ...s, phase: 'garage' });
  expect(card.hidden).toBe(true);
  draw({ ...s, workshop: { pad: 1, row: 0, rows: [], idleLeft: 10, revision: 1 } });
  expect(card.hidden).toBe(true);
});

it('the power ladder lights the selected tier, outlines the called one, places the needle and cues the key toward the call', () => {
  const { snapshot } = hudFixture();
  const power = { ftpW: 200, nowFtp: 0.5, cadence: 80, refRpm: 85, cap: 1.2, rated: [0.45, 0.6, 0.75, 0.9, 1.05] };
  const el = document.createElement('div');
  el.innerHTML = tierHtml({ ...snapshot, tier: 2, suggestedTier: 4, tierFtp: 0.6, swapLeft: 0, power });
  expect([...el.querySelectorAll('.td-ladder > span')].map((n) => n.textContent)).toEqual(['I', 'II', 'III', 'IV', 'V']);
  expect(el.querySelector('.td-ladder .on')?.textContent).toBe('II');
  expect(el.querySelector('.td-ladder .call')?.textContent).toBe('IV');
  expect(el.querySelector('[data-step="1"]')!.classList.contains('cue')).toBe(true);
  expect(el.querySelector('[data-step="-1"]')!.classList.contains('cue')).toBe(false);
  expect(el.querySelector('.td-tier')!.classList.contains('under')).toBe(true);
  expect(el.querySelector('.td-verdict')?.textContent).toBe('Push +20 W');
  expect(el.querySelector('.td-tier-foot > span')?.textContent).toBe('100 W');
  // the needle sits inside the lit block when the rider makes the tier's watts
  el.innerHTML = tierHtml({ ...snapshot, tier: 4, suggestedTier: 4, tierFtp: 0.9, swapLeft: 0, power: { ...power, nowFtp: 0.95 } });
  const left = (q: string) => parseFloat((el.querySelector<HTMLElement>(q)!.style.left));
  const block = el.querySelector<HTMLElement>('.td-ladder .on')!;
  expect(left('.td-needle')).toBeGreaterThan(parseFloat(block.style.left));
  expect(el.querySelectorAll('.cue')).toHaveLength(0);
  expect(el.querySelector('.td-verdict')?.textContent).toBe('Full power');
  el.innerHTML = tierHtml({ ...snapshot, tier: 2, suggestedTier: 2, tierFtp: 0.6, swapLeft: 0, power: { ...power, nowFtp: 0.8 } });
  expect(el.querySelector('.td-verdict')?.textContent).toBe('Shift up');
});

it('lays radar blips out without overlaps when the column has room, keeping arrival times; Stalkers cycle colour', () => {
  const { snapshot } = hudFixture();
  // a peak: 14 groups crowding one road over 90 s, several arriving together
  const blips = Array.from({ length: 14 }, (_, i) => ({ etaS: 20 + (i % 7) * 10 + (i % 3), hp: 150 + 60 * (i % 4), color: (['blue', 'red', 'purple'] as const)[i % 3], lane: 0, n: 3, key: i }));
  const r = { ...snapshot.radar!, roads: 1, scale: 330, blips };
  const size = { w: 220, h: 110 }, placed = layoutRadar(r, 'v', size);
  expect(placed).toHaveLength(14);
  for (const q of placed) expect(q.p).toBeCloseTo(q.blip.etaS / 90, 5); // time never moves
  const rad = (k: number) => k * 36 * 0.32;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const d = Math.hypot((a.p - b.p) * size.h, (a.x - b.x) * size.w);
    expect(d, `${i}/${j}`).toBeGreaterThanOrEqual(rad(a.k) + rad(b.k));
  }
  // with two roads every blip stays inside its own column
  const two = layoutRadar({ ...r, roads: 2, blips: blips.map((b) => ({ ...b, lane: b.key % 2 })) }, 'v', size);
  for (const q of two) expect(q.blip.lane === 0 ? q.x <= 0.5 : q.x >= 0.5).toBe(true);
  const el = document.createElement('div');
  el.innerHTML = radarHtml({ ...snapshot, radar: { ...r, blips: [{ etaS: 40, hp: 90, color: 'prism', lane: 0, n: 1, key: 3 }] } }, 'v');
  expect(el.querySelector('.td-blip')!.classList.contains('prism')).toBe(true);
});

it('under the ladder: the tier target, what the next tier adds, and the Railgun charge', () => {
  const { snapshot } = hudFixture();
  const base: TdSnapshot = { ...snapshot, weapon: 'gatling', tier: 3, tierCount: 5, tierFtp: 0.75, swapLeft: 0,
    power: { ftpW: 200, nowFtp: 0.6, cadence: 80, refRpm: 85, cap: 1.2, rated: [0.45, 0.6, 0.75, 0.9, 1.05] } };
  const el = document.createElement('div');
  el.innerHTML = guideHtml(base);
  expect(el.querySelector('.td-gain')!.textContent).toBe('150+ W · 85 rpm · IV: +27% damage · splash');
  el.innerHTML = guideHtml({ ...base, weapon: 'rail', railProgress: 0.62 });
  expect(el.querySelector('.td-charge')!.textContent).toBe('Charging 62%');
  el.innerHTML = guideHtml({ ...base, weapon: 'rail', railProgress: 1 });
  expect(el.querySelector('.td-charge')!.classList.contains('ready')).toBe(true);
});
