import { describe, expect, it } from 'vitest';
import { PenroseAudio } from '../render/sound';
import type { SimEvent, ThemeId } from '../sim/types';

const THEMES: ThemeId[] = ['dusk', 'garden', 'town', 'prism', 'night', 'brass', 'cube'];
const EVENT_KINDS: SimEvent['kind'][] = [
  'engage', 'disengage', 'latch', 'perspJoin', 'gapHidden', 'key', 'gateOpen',
  'doorMatch', 'portal', 'checkpoint', 'fall', 'win', 'chapterWin',
  'clutchWarn', 'clutchSlip', 'springTip', 'bannerStep', 'seamToggle', 'crankTick',
];

describe('PenroseAudio', () => {
  it('safely handles every theme and event kind in headless Node and disposes cleanly', () => {
    const audio = new PenroseAudio();
    for (const th of THEMES) {
      audio.setThemeAmbient(th);
      for (let i = 0; i < EVENT_KINDS.length; i++) {
        expect(() => audio.handleEvent({ id: i + 1, kind: EVENT_KINDS[i], pitch: 1.0 }, th)).not.toThrow();
      }
    }
    expect(() => audio.dispose()).not.toThrow();
  });
});
