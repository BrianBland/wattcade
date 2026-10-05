import { describe, it, expect } from 'vitest';
import { CHANNELS, channelById, clearBad, flip, initialDial, markBad, parseSaved, rerunUrl, storageKey } from './channels';
import { BAR_H, easeRect, MARQUEE_H, MIN_H, MIN_W, screenRect, type Rect } from './layout';
import { FRESH, MAX_FAILS, onPlayEvent } from './playback';

describe('channels', () => {
  it('has the suggested lineup, numbered 1..12', () => {
    expect(CHANNELS.map((c) => `${c.number} ${c.name}`)).toEqual(['1 LIVE', '2 NEWEST', '3 TOP', '4 NEWS', '5 COMEDY', '6 MUSIC', '7 CARTOON', '8 SCI-FI', '9 DANCE', '10 ANIMATION', '11 HORROR', '12 ADS']);
    expect(new Set(CHANNELS.map((c) => c.id)).size).toBe(CHANNELS.length);
  });
  it('URLs are well-formed https Infinite Slop HLS playlists, with attribution', () => {
    for (const c of CHANNELS) {
      const u = new URL(c.url);
      expect(u.protocol).toBe('https:'); expect(u.hostname).toBe('infiniteslop.ai');
      expect(u.pathname === '/live/playlist.m3u8' || (u.pathname === '/api/channel' && !!u.searchParams.get('ch') && Number(u.searchParams.get('limit')) > 0)).toBe(true);
      expect(c.credit.text).toContain('Infinite Slop'); expect(new URL(c.credit.url).protocol).toBe('https:');
    }
    expect(rerunUrl('sci fi', 5)).toBe('https://infiniteslop.ai/api/channel?ch=sci%20fi&limit=5');
  });
  it('flips next/prev and wraps both ways', () => {
    const last = CHANNELS[CHANNELS.length - 1].id;
    expect(flip(initialDial(last), 1).id).toBe(CHANNELS[0].id);
    expect(flip(initialDial(CHANNELS[0].id), -1).id).toBe(last);
    expect(flip(initialDial('comedy'), 1).id).toBe('music');
  });
  it('skips unavailable channels, and stays put when none is left', () => {
    let d = markBad(initialDial('news'), 'comedy');
    expect(flip(d, 1).id).toBe('music');
    expect(flip({ ...d, id: 'music' }, -1).id).toBe('news');
    for (const c of CHANNELS) if (c.id !== 'news') d = markBad(d, c.id);
    expect(flip(d, 1).id).toBe('news');
    expect(clearBad(d).bad).toEqual([]);
    expect(markBad(d, 'comedy')).toBe(d);
  });
  it('restores the last channel, falling back for unknown ids', () => {
    expect(initialDial('horror').id).toBe('horror');
    expect(initialDial('nope').id).toBe('live');
    expect(initialDial(null).id).toBe('live');
    expect(channelById('x').id).toBe('live');
  });
  it('parses saved state defensively', () => {
    expect(parseSaved(JSON.stringify({ on: true, ch: 'top', sound: true }))).toEqual({ on: true, ch: 'top', sound: true });
    expect(parseSaved('garbage')).toEqual({ on: false, ch: 'live', sound: false });
    expect(parseSaved(null).on).toBe(false);
    expect(parseSaved('{"on":"yes","ch":5}')).toEqual({ on: false, ch: 'live', sound: false });
    expect(storageKey('p1')).toBe('wattcade.drivein.p1');
  });
});

const SIZES: Array<[string, number, number, number]> = [
  ['iPad Pro 13 landscape', 1366, 1024, 166], ['iPad Pro 11 landscape', 1210, 834, 150],
  ['iPad Pro 13 portrait', 1024, 1366, 130], ['iPad Pro 11 portrait', 834, 1210, 120],
];
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
describe('screenRect', () => {
  for (const [name, W, H, hud] of SIZES) {
    it(`${name}: 16:9, above the HUD, with room for marquee and bar, and big enough`, () => {
      const r = screenRect(W, H, hud)!;
      expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02);
      expect(r.y + r.h + BAR_H).toBeLessThanOrEqual(H - hud);
      expect(r.y).toBeGreaterThanOrEqual(MARQUEE_H);
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(W);
      expect(r.w).toBeGreaterThanOrEqual(MIN_W); expect(r.h).toBeGreaterThanOrEqual(MIN_H);
    });
    it(`${name}: never under an awake menu (a short one leaves room; a tall one hides the screen)`, () => {
      const short: Rect = { x: 0, y: 0, w: W, h: 110 };
      const r = screenRect(W, H, hud, { menuBox: short })!;
      expect(hit(r, short)).toBe(false);
      expect(r.y + r.h + BAR_H).toBeLessThanOrEqual(H - hud);
      expect(r.w).toBeGreaterThanOrEqual(MIN_W);
      expect(screenRect(W, H, hud, { menuBox: { x: 0, y: 0, w: W, h: 680 } })).toBeNull();
    });
  }
  it('asleep is larger than awake', () => {
    expect(screenRect(1366, 1024, 166)!.w).toBeGreaterThan(screenRect(1366, 1024, 166, { menuBox: { x: 0, y: 0, w: 1366, h: 110 } })!.w);
  });
  it('degrades without NaN on a tiny surface', () => {
    const r = screenRect(300, 200, 100)!;
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
  });
  it('easeRect glides toward the target, independent of frame rate', () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 50 }, b: Rect = { x: 100, y: 40, w: 300, h: 150 };
    let x = a, y = a;
    for (let i = 0; i < 60; i++) x = easeRect(x, b, 1 / 60);
    for (let i = 0; i < 120; i++) y = easeRect(y, b, 1 / 120);
    expect(Math.abs(x.x - y.x)).toBeLessThan(0.5);
    expect(easeRect(null, b, 0.016)).toBe(b);
    for (let i = 0; i < 200; i++) x = easeRect(x, b, 1 / 60);
    expect(x).toEqual(b);
  });
});

describe('playback watchdog', () => {
  it('playing clears failures; ended after playing reloads for a fresh playlist', () => {
    let r = onPlayEvent({ fails: 2, played: false }, 'playing');
    expect(r).toEqual({ st: { fails: 0, played: true }, action: 'none' });
    r = onPlayEvent(r.st, 'ended');
    expect(r.action).toBe('retry'); expect(r.st.fails).toBe(0);
  });
  it('retries, then skips after MAX_FAILS', () => {
    let st = FRESH;
    for (let i = 1; i < MAX_FAILS; i++) { const r = onPlayEvent(st, i % 2 ? 'error' : 'stalled'); expect(r.action).toBe('retry'); st = r.st; }
    expect(onPlayEvent(st, 'timeout').action).toBe('skip');
  });
  it('an ended that never played counts as a failure (no reload loop)', () => {
    let st = FRESH, last = 'none';
    for (let i = 0; i < 5 && last !== 'skip'; i++) { const r = onPlayEvent(st, 'ended'); st = r.st; last = r.action; }
    expect(last).toBe('skip');
  });
});

import { fillStatic } from './staticFx';
import { flipChannel, getDriveIn, handleChannelPress, loadDriveIn, setDriveInVisible, skipBadChannel, subscribeDriveIn, toggleDriveIn } from './store';
describe('static + store', () => {
  it('static fills opaque noise', () => {
    const d = new Uint8ClampedArray(16 * 9 * 4); let i = 0;
    fillStatic(d, 16, 9, 0.3, () => ((i++ * 0.37) % 1));
    expect(d.every((v, k) => (k % 4 === 3 ? v === 255 : v >= 30))).toBe(true);
    expect(new Set(d).size).toBeGreaterThan(10);
  });
  it('channel keys only count while the Drive-In is on and visible', () => {
    loadDriveIn(null); setDriveInVisible(true);
    expect(handleChannelPress(new Set(['y']))).toBe(false);          // off
    loadDriveIn(null); toggleDriveIn(); setDriveInVisible(false);
    expect(handleChannelPress(new Set(['y']))).toBe(false);          // on, but not on the lobby menu
    setDriveInVisible(true);
    expect(handleChannelPress(new Set(['a']))).toBe(false);
    expect(handleChannelPress(new Set(['y', 'z']))).toBe(false);
    expect(handleChannelPress(new Set(['y']))).toBe(true); expect(getDriveIn().dial.id).toBe('newest');
    expect(handleChannelPress(new Set(['z']))).toBe(true); expect(getDriveIn().dial.id).toBe('live');
    let n = 0; const off = subscribeDriveIn(() => n++); flipChannel(1); skipBadChannel(); off();
    expect(n).toBe(2); expect(getDriveIn().dial.bad).toEqual(['newest']); expect(getDriveIn().dial.id).toBe('top');
    toggleDriveIn(); expect(getDriveIn().dial.bad).toEqual([]);
  });
});
