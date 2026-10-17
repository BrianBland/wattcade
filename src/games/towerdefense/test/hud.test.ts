// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { TdHud } from '../render/panels';
import { layout } from '../render/layout';
import type { TdSnapshot } from '../sim/types';
import { WEAPON_NAME } from '../sim/defs';

it('announces the incoming brood through recovery, then leaves combat controls to the shell', () => {
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
    expect(strip.textContent).toContain(`W${s.brood.wave}`);
    expect(strip.textContent).toContain(`${s.brood.color} brood`);
    expect(strip.textContent).toContain(`${Math.ceil(s.brood.countdownS)}s`);
    expect(hud.root.querySelector('.td-call')).toBeNull();
    expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(true);
    hud.render({ ...s, set: { ...s.set, role: 'easy' }, brood: { ...s.brood, countdownS: 1, rampS: 15 } }, layout(820, 1180, 160, true), 820);
    expect(strip.textContent).toContain('Easy · Recovery');
    expect(strip.textContent).not.toContain('Ramping');
    session.sim.receive!({ type: 'pad', pad: 1, epoch: s.inputEpoch });
    session.step(1);
    expect(draw().workshop).toBeTruthy();
    expect(strip.hidden).toBe(false);
    expect(strip.querySelector('.td-count')).not.toBeNull();
    expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(true);
    session.step(45 * 30);
    const combat = draw();
    expect(strip.querySelector('.td-count')).toBeNull();
    expect(strip.textContent).toContain(WEAPON_NAME[combat.brood.weapon]);
    expect(hud.root.querySelector('.td-next')?.textContent).toBe(`Next: ${combat.nextBrood!.color.toUpperCase()} BROOD → ${WEAPON_NAME[combat.nextBrood!.weapon]}`);
    expect(hud.root.querySelectorAll('button')).toHaveLength(0);
  } finally {
    hud.root.remove(); session.sim.dispose?.();
  }
});

function hudFixture() {
  const session = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7, simOpts: { skipGarage: true } });
  const initial = session.sim.snapshot() as TdSnapshot;
  session.sim.dispose?.();
  const snapshot: TdSnapshot = { ...initial, phase: 'run', garage: null, lull: 0, set: { set: 2, pos: 2, role: 'work' },
    brood: { ...initial.brood, countdownS: 0 }, boss: null, effort: null, banner: null, workshop: null, constructionDone: false };
  const hud = new TdHud();
  const draw = (s: TdSnapshot, W = 1180, H = 820) => hud.render(s, layout(W, H, 160, true), W);
  return { snapshot, hud, draw, card: hud.root.querySelector<HTMLElement>('.td-objective')! };
}

it('shows set progress and the live crew order in the persistent landscape card', () => {
  const { snapshot: s, hud, draw, card } = hudFixture();
  draw({ ...s, autoCrew: true, suggestion: { wave: 2, kind: 'upgrade', pad: 1, tower: 'tesla', level: 1, targetLevel: 2, cost: 80, label: 'Upgrade Tesla to Lv 2' } });
  expect(card.hidden).toBe(false);
  expect(card.textContent).toContain('Set 2 · Work 2/3');
  expect(card.textContent).toContain(s.brood.cue);
  expect(card.textContent).toContain('Auto-crew on');
  expect(card.textContent).toContain('Queued: Upgrade Tesla to Lv 2 · 80 scrap');
  expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(true);
  draw({ ...s, autoCrew: false });
  expect(card.textContent).toContain('Auto-crew off');
  expect(card.textContent).not.toContain('Queued:');
  draw({ ...s, autoCrew: true, constructionDone: true });
  expect(card.textContent).toContain('Order complete');
});

it('shows effort targets, held progress and remaining time in one place, with compact fallback', () => {
  const { snapshot: s, hud, draw, card } = hudFixture();
  const effort: NonNullable<TdSnapshot['effort']> = { kind: 'grind', wave: 2, state: 'active', countdownS: 0, heldS: 5, needS: 20, leftS: 28, minRpm: 60, maxRpm: 75, minFtp: .85, maxFtp: 2, targetFtp: .9 };
  draw({ ...s, effort });
  expect(card.textContent).toContain('60–75 rpm · ≥85% FTP');
  expect(card.textContent).toContain('15s more · 28s left');
  expect(card.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('25');
  draw({ ...s, effort: { ...effort, state: 'announced', countdownS: 6 } });
  expect(card.textContent).toContain('grind in 6s');
  draw({ ...s, effort: { ...effort, state: 'won', heldS: 25 } });
  expect(card.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('100');
  draw({ ...s, effort }, 844, 390);
  expect(card.hidden).toBe(true);
  expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(false);
  draw({ ...s, effort }, 820, 1180);
  expect(card.hidden).toBe(true);
  expect(hud.root.querySelector<HTMLElement>('.td-event')!.hidden).toBe(false);
});

it('prioritizes boss switches and sprint windows, then recovery over stale effort state', () => {
  const { snapshot: s, draw, card } = hudFixture();
  const boss: NonNullable<TdSnapshot['boss']> = { id: 1, phase: 1, phaseCount: 3, color: 'purple', weapon: 'rail', next: null, countdownS: 0, telegraph: true, exposed: false, windowLeftS: 4, sprintBoost: false };
  draw({ ...s, boss });
  expect(card.textContent).toContain('Boss phase 1/3');
  expect(card.textContent).toContain('Hold ▲ for the ERG push');
  draw({ ...s, boss: { ...boss, exposed: true, telegraph: false } });
  expect(card.textContent).toContain('Exposed');
  draw({ ...s, boss: { ...boss, next: 'red', countdownS: 7 } });
  expect(card.textContent).toContain('Fireball next');
  expect(card.textContent).toContain('Switch in 7s');
  draw({ ...s, boss, brood: { ...s.brood, countdownS: 15 } });
  expect(card.textContent).toContain('Recover');
  expect(card.textContent).not.toContain('ERG push');
  draw({ ...s, boss, set: { set: 2, pos: 5, role: 'easy' } });
  expect(card.textContent).toContain('Recovery wave');
  expect(card.textContent).toContain('no called efforts');
  draw({ ...s, phase: 'garage' });
  expect(card.hidden).toBe(true);
  draw({ ...s, workshop: { pad: 1, row: 0, rows: [], idleLeft: 10, revision: 1 } });
  expect(card.hidden).toBe(true);
});
