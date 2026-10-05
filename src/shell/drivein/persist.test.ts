// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getDriveIn, flipChannel, loadDriveIn, toggleDriveIn, setDriveInSound } from './store';
import { storageKey } from './channels';

describe('Drive-In persistence', () => {
  it('restores on/off, last channel and sound per rider', () => {
    localStorage.clear();
    loadDriveIn('a'); toggleDriveIn(); flipChannel(1); flipChannel(1); setDriveInSound(true);
    expect(JSON.parse(localStorage.getItem(storageKey('a'))!)).toEqual({ on: true, ch: 'top', sound: true });
    loadDriveIn('b');
    expect(getDriveIn()).toMatchObject({ on: false, sound: false });
    expect(getDriveIn().dial.id).toBe('live');
    loadDriveIn('a');
    expect(getDriveIn()).toMatchObject({ on: true, sound: true });
    expect(getDriveIn().dial.id).toBe('top');
    loadDriveIn(null);
    expect(getDriveIn().on).toBe(false);
  });
});
