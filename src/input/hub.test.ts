import { describe, it, expect } from 'vitest';
import { InputHub, ScriptedInput } from './index';
import type { Button, SystemAction } from '../contracts';

const raw = (buttons: Button[], paddleL = 0, paddleR = 0) => ({ buttons: new Set(buttons), paddleL, paddleR });
const key = (type: string, code: string) => Object.assign(new Event(type, { cancelable: true }), { code, repeat: false });

describe('InputHub edges', () => {
  it('catches a press+release between ticks', () => {
    const h = new InputHub();
    h.beginTick(1 / 30);
    h.setControllerState(raw(['a']));
    h.setControllerState(raw([]));
    h.beginTick(1 / 30);
    const s = h.state();
    expect(s.pressed.has('a')).toBe(true); expect(s.released.has('a')).toBe(true); expect(s.held.has('a')).toBe(false);
    h.beginTick(1 / 30);
    expect(h.state().pressed.size).toBe(0);
  });
  it('held persists, edges once', () => {
    const h = new InputHub();
    h.setControllerState(raw(['b']));
    h.beginTick(0.03); expect(h.state().pressed.has('b')).toBe(true);
    h.beginTick(0.03); expect(h.state().pressed.size).toBe(0); expect(h.state().held.has('b')).toBe(true);
    h.setControllerState(raw([]));
    h.beginTick(0.03); expect(h.state().released.has('b')).toBe(true);
    expect(h.state().source).toBe('ride');
  });
});

describe('paddles', () => {
  it('deadzone, rescale, idle timer', () => {
    const h = new InputHub({ deadzone: 20, paddleExpo: 1 });
    h.setControllerState(raw([], 10, 10));
    h.beginTick(0.5);
    expect(h.state().paddleL).toBe(0); expect(h.state().paddleIdleS).toBe(0.5);
    h.setControllerState(raw([], 60, 100));
    h.beginTick(0.5);
    expect(h.state().paddleL).toBeCloseTo(-0.5); expect(h.state().paddleR).toBe(1); expect(h.state().paddleIdleS).toBe(0);
    h.setControllerState(raw([], 0, 0));
    h.beginTick(0.25); h.beginTick(0.25);
    expect(h.state().paddleIdleS).toBeCloseTo(0.5);
  });
  it('applySettings', () => {
    const h = new InputHub({ paddleExpo: 1 });
    h.applySettings({ paddleDeadzone: 50 } as any);
    h.setControllerState(raw([], 40, 0)); h.beginTick(0.1); expect(h.state().paddleL).toBe(0);
    h.setControllerState(raw([], 75, 0)); h.beginTick(0.1); expect(h.state().paddleL).toBeCloseTo(-0.5);
  });
});

describe('system combos & debug', () => {
  const mk = () => { let t = 0; const h = new InputHub({ now: () => t }); const got: SystemAction[] = []; h.onSystem((a) => got.push(a)); return { h, got, adv: (ms: number) => { t += ms; } }; };
  it('powerUp tap together -> pause, hidden from games', () => {
    const { h, got, adv } = mk();
    h.setControllerState(raw(['powerUpL'])); adv(50);
    h.setControllerState(raw(['powerUpL', 'powerUpR'])); adv(300);
    h.beginTick(0.03); expect(h.state().held.has('powerUpL')).toBe(false); expect(h.state().held.has('powerUpR')).toBe(false);
    h.setControllerState(raw([])); 
    expect(got).toEqual(['pause']);
    h.beginTick(0.03); expect(h.state().released.has('powerUpR')).toBe(false);
    h.beginTick(0.03);
  });
  it('powerUp held >= 1s -> toggleDebug only', () => {
    const { h, got, adv } = mk();
    h.setControllerState(raw(['powerUpL', 'powerUpR']));
    adv(900); h.beginTick(0.03); expect(got).toEqual([]);
    adv(200); h.beginTick(0.03); expect(got).toEqual(['toggleDebug']);
    adv(2000); h.beginTick(0.03); h.setControllerState(raw([]));
    expect(got).toEqual(['toggleDebug']);
  });
  it('single powerUp reaches games; shifters unaffected', () => {
    const { h, got } = mk();
    h.setControllerState(raw(['powerUpL', 'shiftDnR']));
    h.beginTick(0.03); expect(h.state().pressed.has('powerUpL')).toBe(true); expect(h.state().pressed.has('shiftDnR')).toBe(true);
    h.setControllerState(raw([])); expect(got).toEqual([]);
  });
  it('debugOpen: left shifters difficulty, right shifters timeScale, hidden', () => {
    const h = new InputHub(); const got: Array<[string, number]> = [];
    h.onDebugAdjust((k, d) => got.push([k, d]));
    h.debugOpen = true;
    h.setControllerState(raw(['shiftUpL', 'shiftDnR', 'a']));
    h.beginTick(0.03);
    expect(got).toEqual([['difficulty', 0.05], ['timeScale', -1]]);
    expect([...h.state().held]).toEqual(['a']);
    h.debugOpen = false; h.setControllerState(raw([])); h.setControllerState(raw(['shiftUpL']));
    h.beginTick(0.03); expect(h.state().pressed.has('shiftUpL')).toBe(true); expect(got.length).toBe(2);
  });
});

describe('keyboard / gamepad / script', () => {
  it('keyboard attach', () => {
    const h = new InputHub(); const t = new EventTarget(); const got: SystemAction[] = [];
    h.onSystem((a) => got.push(a));
    const off = h.attachKeyboard(t);
    t.dispatchEvent(key('keydown', 'ArrowUp')); t.dispatchEvent(key('keydown', 'KeyN')); t.dispatchEvent(key('keydown', 'Escape'));
    h.beginTick(0.03);
    expect(h.state().held.has('up')).toBe(true); expect(h.state().paddleL).toBe(-1); expect(h.state().source).toBe('keyboard');
    expect(got).toEqual(['pause']);
    t.dispatchEvent(key('keyup', 'ArrowUp')); t.dispatchEvent(key('keyup', 'KeyN'));
    h.beginTick(0.03); expect(h.state().held.size).toBe(0); expect(h.state().paddleL).toBe(0);
    off(); t.dispatchEvent(key('keydown', 'ArrowUp')); h.beginTick(0.03); expect(h.state().held.size).toBe(0);
  });
  it('gamepad polled in beginTick', () => {
    const h = new InputHub(); const got: SystemAction[] = [];
    let pressed = [1, 8]; // 1 = right face button = A
    h.attachGamepad(() => [{ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes: [0, 0, 0, 0] }]);
    h.beginTick(0.03);
    expect(h.state().held.has('a')).toBe(true); expect(h.state().held.has('b')).toBe(false); expect(h.state().source).toBe('gamepad'); expect(h.state().held.has('powerUpL')).toBe(true);
    pressed = []; h.beginTick(0.03); expect(h.state().released.has('a')).toBe(true);
  });
  it('script timeline', () => {
    const h = new InputHub();
    h.setScript(new ScriptedInput([{ t: 0.1, press: 'a' }, { t: 0.2, release: 'a', paddleL: 0.5 }, { t: 0.2, paddleR: -100 }]));
    let pressedAt = -1; let t = 0;
    for (let i = 0; i < 10; i++) { h.beginTick(1 / 30); t += 1 / 30; if (h.state().pressed.has('a') && pressedAt < 0) pressedAt = t; }
    expect(pressedAt).toBeCloseTo(0.1, 1); expect(h.state().held.has('a')).toBe(false);
    expect(h.state().paddleL).toBe(0.5); expect(h.state().paddleR).toBe(-1); expect(h.state().source).toBe('script');
    h.setScript(null);
  });
  it('is usable in node without window', () => {
    expect(typeof (globalThis as any).window).toBe('undefined');
    new InputHub().beginTick(0.03);
  });
});

describe('button debounce', () => {
  it('collapses a chattering release+re-press into one press', () => {
    let t = 0; const h = new InputHub({ now: () => t, debounceMs: 90 });
    h.setControllerState(raw(['a'])); h.beginTick(0.03);
    expect(h.state().pressed.has('a')).toBe(true);
    t = 20; h.setControllerState(raw([]));
    t = 40; h.setControllerState(raw(['a']));
    h.beginTick(0.03);
    expect(h.state().pressed.has('a')).toBe(false);
    t = 500; h.setControllerState(raw([])); t = 700; h.setControllerState(raw(['a'])); h.beginTick(0.03);
    expect(h.state().pressed.has('a')).toBe(true);
  });
  it('is off by default', () => {
    const h = new InputHub();
    h.setControllerState(raw(['a'])); h.setControllerState(raw([])); h.setControllerState(raw(['a']));
    h.beginTick(0.03); expect(h.state().pressed.has('a')).toBe(true);
  });
});
