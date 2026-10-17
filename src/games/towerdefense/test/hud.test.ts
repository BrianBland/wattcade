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
