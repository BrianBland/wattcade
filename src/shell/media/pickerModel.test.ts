import { describe, expect, it } from 'vitest';
import { fmtTime, moveItem, nextMode, pickerNav, previewStart, type PickerFocus } from './pickerModel';

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
