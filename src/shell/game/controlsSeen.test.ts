import { describe, expect, it } from 'vitest';
import type { Profile } from '../../contracts';
import { controlsSignature, markControlsSeen, needsControls, playControls } from './controlsSeen';

const play = [{ button: 'a' as const, label: 'Nova' }, { button: 'left' as const, label: 'Flank ◀' }];
const rider = { settings: {} } as Pick<Profile, 'settings'>;

describe('controls card rule', () => {
  it('shows on the first play, then not again for the same controls and input', () => {
    const sig = controlsSignature(play, 'controller');
    expect(needsControls(rider, 'starfighter', sig)).toBe(true);
    const seen = markControlsSeen(rider, 'starfighter', sig);
    expect(needsControls(seen, 'starfighter', sig)).toBe(false);
    expect(needsControls(seen, 'cadenza', sig)).toBe(true);
  });
  it('shows again when the controls or the input change', () => {
    const seen = markControlsSeen(rider, 'starfighter', controlsSignature(play, 'controller'));
    expect(needsControls(seen, 'starfighter', controlsSignature(play, 'touch'))).toBe(true);
    expect(needsControls(seen, 'starfighter', controlsSignature([...play, { button: 'z', label: 'Elite flank' }], 'controller'))).toBe(true);
  });
  it('ignores order and live state such as cooldowns', () => {
    const live = [{ ...play[1], active: false }, { ...play[0], cooldown: { fill: 0.3, ready: false } }];
    expect(controlsSignature(live, 'touch')).toBe(controlsSignature(play, 'touch'));
  });
  it('teaches the gameplay mapping while a pre-game menu is open', () => {
    expect(playControls({ controls: [{ button: 'dpad', label: 'Choose' }], playControls: play })).toBe(play);
    expect(playControls({ controls: play })).toBe(play);
    expect(playControls({})).toEqual([]);
  });
  it('tolerates profiles without settings', () => {
    expect(needsControls({} as Pick<Profile, 'settings'>, 'x', 'sig')).toBe(true);
    expect(markControlsSeen({} as Pick<Profile, 'settings'>, 'x', 'sig').settings.controlsSeen).toEqual({ x: 'sig' });
  });
});
