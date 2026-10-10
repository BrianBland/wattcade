import { describe, expect, it } from 'vitest';
import { fmtTime, moveItem, nextMode, pickerNav, previewStart, type PickerFocus, previewIntent, canPreview } from './pickerModel';

const size = { tabs: 3, list: 5, queue: 2 };
const f0: PickerFocus = { zone: 'list', tab: 0, list: 0, queue: 0 };

describe('picker focus', () => {
  it('moves through tabs, list and queue', () => {
    let f = pickerNav(f0, 'up', size);
    expect(f.zone).toBe('tabs');
    f = pickerNav(f, 'right', size); expect(f.tab).toBe(1);
    f = pickerNav(pickerNav(f, 'right', size), 'right', size); expect(f.zone).toBe('queue');
    f = pickerNav(f, 'left', size); expect(f.zone).toBe('list');
    f = pickerNav(pickerNav(pickerNav(f, 'down', size), 'down', size), 'down', size); expect(f.list).toBe(3);
    f = pickerNav({ ...f, list: 4 }, 'down', size); expect(f.list).toBe(4);
  });
  it('queue rows: mode, songs, start (clamped)', () => {
    let f: PickerFocus = { ...f0, zone: 'queue', queue: 0 };
    for (let i = 0; i < 10; i++) f = pickerNav(f, 'down', size);
    expect(f.queue).toBe(3); // 0 mode, 1-2 songs, 3 start
    f = pickerNav(f, 'up', size); expect(f.queue).toBe(2);
  });
  it('an empty list keeps focus off it', () => {
    const e = { tabs: 3, list: 0, queue: 0 };
    expect(pickerNav({ ...f0, zone: 'tabs' }, 'down', e).zone).toBe('tabs');
    expect(pickerNav({ ...f0, zone: 'queue' }, 'left', e).zone).toBe('tabs');
  });
});

describe('queue helpers', () => {
  it('moves items and cycles modes', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(nextMode('automix')).toBe('continuous');
    expect(nextMode('automix', -1)).toBe('crossfade');
  });
  it('previews from the first drop, else the loudest section', () => {
    expect(previewStart([{ t0: 0, kind: 'intro', energy: 0.2 }, { t0: 40, kind: 'drop', energy: 0.9 }], 200)).toBe(40);
    expect(previewStart([{ t0: 0, kind: 'intro', energy: 0.2 }, { t0: 60, kind: 'verse', energy: 0.5 }], 200)).toBe(60);
    expect(previewStart([], 120)).toBe(40);
  });
  it('formats times', () => { expect(fmtTime(65)).toBe('1:05'); expect(fmtTime(3725)).toBe('1:02:05'); });
});

describe('preview intent', () => {
  const rig = () => {
    const timers: Array<{ fn: () => void; ms: number; dead?: boolean }> = []; const log: string[] = [];
    const p = previewIntent({ start: (id) => log.push(`start ${id}`), stop: () => log.push('stop'),
      setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (h) => { (h as { dead: boolean }).dead = true; } });
    const fire = () => timers.filter((t) => !t.dead).splice(0).forEach((t) => { t.dead = true; t.fn(); });
    return { p, log, timers, fire };
  };
  it('debounces hover and stops on leave', () => {
    const { p, log, timers, fire } = rig();
    p.enter('a', 'hover'); expect(timers[0].ms).toBe(350); expect(log).toEqual([]);
    p.leave('a'); fire(); expect(log).toEqual([]);           // quick pass-over never plays
    p.enter('a', 'hover'); fire(); expect(log).toEqual(['start a']); expect(p.playing).toBe('a');
    p.enter('a', 'hover'); expect(timers.filter((t) => !t.dead)).toHaveLength(0); // re-enter is a no-op
    p.leave('b'); expect(p.playing).toBe('a');                // leaving another row is ignored
    p.leave('a'); expect(log).toEqual(['start a', 'stop']);
  });
  it('switches rows, uses per-trigger delays, and refuses unavailable audio', () => {
    const { p, log, timers, fire } = rig();
    p.enter('a', 'press'); expect(timers[0].ms).toBe(250); fire();
    p.enter('b', 'focus'); expect(log).toEqual(['start a', 'stop']); expect(timers[1].ms).toBe(600); fire();
    expect(p.playing).toBe('b');
    p.enter('c', 'hover', false); expect(log.at(-1)).toBe('stop'); expect(p.playing).toBeNull(); expect(p.pending).toBeNull();
    p.enter('d', 'hover'); p.reset(); fire(); expect(p.playing).toBeNull();
  });
  it('canPreview only for ready, local audio', () => {
    expect(canPreview({ status: 'ready' })).toBe(true);
    expect(canPreview({ status: 'ready', sourceUrl: 'https://x' })).toBe(false);
    expect(canPreview({ status: 'analyzing' })).toBe(false);
    expect(canPreview(undefined)).toBe(false);
  });
});
