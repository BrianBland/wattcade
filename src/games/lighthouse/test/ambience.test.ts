import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ambientDucked, play, setAmbient, soundEnabled, stopAmbient } from '../../../audio/sfx';
import { IslandAmbience } from '../render/ambience';

vi.mock('../../../audio/sfx', () => ({
  ambientDucked: vi.fn(() => false), soundEnabled: vi.fn(() => true),
  play: vi.fn(), setAmbient: vi.fn(), stopAmbient: vi.fn(),
}));
const calm = { t: 1, chop: 0, fog: 0, storm: 0, windy: 0, shower: 0 };
const shots = (name: string) => vi.mocked(play).mock.calls.filter(([s]) => s === name);

beforeEach(() => { vi.clearAllMocks(); vi.mocked(ambientDucked).mockReturnValue(false); vi.mocked(soundEnabled).mockReturnValue(true); });

describe('island ambience', () => {
  it('keeps the intro quiet, fades a paused sea and resumes with no queued thunder', () => {
    const a = new IslandAmbience(() => 0.5);
    expect(a.update({ ...calm, t: 0 }, 0)).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(a.update(calm, 1)).toBe(true);
    a.lightning(1, true);
    expect(a.update(calm, 1.7)).toBe(false);
    expect(vi.mocked(setAmbient).mock.calls.slice(-3).every(([, vol]) => vol === 0)).toBe(true);
    a.update({ ...calm, t: 2 }, 2);
    expect(shots('thunder')).toHaveLength(0);
    expect(shots('thunderRoll')).toHaveLength(0);
  });

  it.each(['mute', 'duck'] as const)('silences scenery and discards pending strikes while %s is on', (mode) => {
    const a = new IslandAmbience(() => 0.5);
    a.update(calm, 0); a.lightning(1, false); vi.mocked(play).mockClear();
    if (mode === 'mute') vi.mocked(soundEnabled).mockReturnValue(false);
    else vi.mocked(ambientDucked).mockReturnValue(true);
    expect(a.update({ ...calm, t: 10 }, 1)).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(vi.mocked(setAmbient).mock.calls.slice(-3).every(([, vol]) => vol === 0)).toBe(true);
    vi.mocked(soundEnabled).mockReturnValue(true); vi.mocked(ambientDucked).mockReturnValue(false);
    a.update({ ...calm, t: 10.1 }, 1.1);
    expect(play).not.toHaveBeenCalled();
    a.update({ ...calm, t: 12 }, 1.2);
    expect(shots('shoreBreak')).toHaveLength(1);
    expect(shots('thunderRoll')).toHaveLength(0);
  });

  it('delays thunder behind a flash, with a crack only for close surge strikes', () => {
    const a = new IslandAmbience(() => 0.5);
    a.update(calm, 0); a.lightning(1, false);
    a.update({ ...calm, t: 1.5 }, 0.5);
    expect(shots('thunderRoll')).toHaveLength(0);
    a.update({ ...calm, t: 2.2 }, 1);
    expect(shots('thunderRoll')).toHaveLength(1);
    expect(shots('thunder')).toHaveLength(0);
    a.lightning(3, true);
    a.update({ ...calm, t: 3.8 }, 2);
    expect(shots('thunderRoll')).toHaveLength(2);
    expect(shots('thunder')).toHaveLength(1);
  });

  it('never replays overdue thunder or a backlog of waves after a suspended tab', () => {
    const a = new IslandAmbience(() => 0.5);
    a.update(calm, 0); a.lightning(1, true); vi.mocked(play).mockClear();
    a.update({ ...calm, t: 100 }, 100);
    expect(shots('shoreBreak')).toHaveLength(1);
    expect(shots('thunderRoll')).toHaveLength(0);
    a.update({ ...calm, t: 100.1 }, 100.1);
    expect(shots('shoreBreak')).toHaveLength(1);
  });

  it('makes breakers stronger and adds rain and gusts in rough weather', () => {
    new IslandAmbience(() => 0.5).update(calm, 0);
    const calmVol = shots('shoreBreak')[0][1]!.vol!;
    vi.mocked(play).mockClear(); vi.mocked(setAmbient).mockClear();
    new IslandAmbience(() => 0.5).update({ ...calm, chop: 1, storm: 1, windy: 1 }, 0);
    expect(shots('shoreBreak')[0][1]!.vol).toBeGreaterThan(calmVol);
    expect(shots('windGust')).toHaveLength(1);
    expect(vi.mocked(setAmbient).mock.calls.find(([id]) => id === 'rain')![1]).toBeGreaterThan(0);
  });

  it('schedules the same number of breakers at 30 and 120 fps', () => {
    const count = (fps: number) => {
      vi.mocked(play).mockClear();
      const a = new IslandAmbience(() => 0.5);
      for (let i = 0; i <= fps * 60; i++) a.update({ ...calm, t: 1 + i / fps }, i / fps);
      return shots('shoreBreak').length;
    };
    expect(count(30)).toBe(count(120));
  });

  it('stops the beds and clears pending thunder when leaving the game', () => {
    const a = new IslandAmbience(() => 0.5);
    a.update(calm, 0); a.lightning(1, true); a.dispose();
    expect(stopAmbient).toHaveBeenCalledOnce();
    a.update({ ...calm, t: 2 }, 1);
    expect(shots('thunderRoll')).toHaveLength(0);
  });
});
