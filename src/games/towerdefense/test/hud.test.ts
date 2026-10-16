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
    const s = draw(), card = hud.root.querySelector<HTMLElement>('.td-call')!;
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain(`Wave ${s.brood.wave} incoming`);
    expect(card.textContent).toContain(`${s.brood.color} brood`);
    expect(card.textContent).toContain(`${Math.ceil(s.brood.countdownS)}s`);
    expect(hud.root.querySelector('.td-next')?.textContent).toBe(`Next: ${s.nextBrood!.color.toUpperCase()} BROOD → ${WEAPON_NAME[s.nextBrood!.weapon]}`);
    session.step(15 * 30);
    draw();
    expect(card.hidden).toBe(true);
    expect(hud.root.querySelector('.td-current')?.textContent).toContain(WEAPON_NAME[s.brood.weapon]);
    expect(hud.root.querySelectorAll('button')).toHaveLength(0);
  } finally {
    hud.root.remove(); session.sim.dispose?.();
  }
});
