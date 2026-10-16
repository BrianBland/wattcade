// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import type { BikeState, GameHud, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { input } from '../services';
import { HudLayer } from './HudLayer';

it('opens the menu from the center hit target while shifters remain independent', () => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const system = vi.spyOn(input, 'system');
  const el = document.createElement('div');
  const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 80, activeSeconds: 754, gear: 8 } as BikeState;
  const hud: GameHud = { gears: true, controls: [{ button: 'shiftersL', label: 'Gear' }, { button: 'shiftersR', label: 'Gear' }] };
  const session = { ctx: { bike: () => bike }, sim: { hud: () => hud }, mixer: { command: { mode: 'erg', watts: 173 } } } as unknown as SessionLike;
  const profile = { ftp: 250, maxHr: 190, settings: { zoneSource: 'auto' } } as Profile;
  try {
    act(() => render(<HudLayer session={session} profile={profile} paused={false} legendOn />, el));
    act(() => { vi.advanceTimersByTime(100); });
    const hit = el.querySelector<HTMLButtonElement>('.hud-menu-hit')!;
    expect(hit.getAttribute('aria-label')).toBe('Open game menu');
    const compactShift = el.querySelector<HTMLButtonElement>('[aria-label="Gear up"]')!;
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(down, 'pointerId', { value: 51 });
    act(() => { compactShift.dispatchEvent(down); input.beginTick(.1); });
    expect(input.state().held.has('shiftUpL')).toBe(true);
    // ERG replaces gearing and cancels a held shift, rather than leaving stale controls.
    hud.gears = false;
    act(() => { vi.advanceTimersByTime(100); });
    act(() => input.beginTick(.1));
    expect(el.querySelector('[aria-label="Gear 8"]')).toBeNull();
    expect(el.querySelectorAll('.zw-gear-controls button')).toHaveLength(0);
    expect(el.querySelector('[aria-label="Trainer ERG 173 W"]')).not.toBeNull();
    expect(input.state().held.has('shiftUpL')).toBe(false);
    hud.gears = true;
    act(() => { vi.advanceTimersByTime(100); });
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Gear up"]')!.disabled).toBe(false);
    act(() => render(<HudLayer session={session} profile={profile} paused legendOn />, el));
    act(() => input.beginTick(.1));
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Gear up"]')!.disabled).toBe(true);
    expect(input.state().held.has('shiftUpL')).toBe(false);
    expect(el.querySelectorAll('.hood .shift')).toHaveLength(0);
    const shift = el.querySelector<HTMLButtonElement>('[aria-label="Gear up"]')!;
    act(() => shift.click());
    expect(system).not.toHaveBeenCalled();
    act(() => hit.click());
    expect(system).toHaveBeenCalledExactlyOnceWith('pause');
    const open = vi.fn();
    act(() => render(<HudLayer session={session} profile={profile} paused={false} legendOn menu={() => ({ label: 'Open arcade menu', onClick: open })} />, el));
    act(() => el.querySelector<HTMLButtonElement>('.hud-menu-hit')!.click());
    expect(open).toHaveBeenCalledOnce();
    expect(system).toHaveBeenCalledTimes(1);
  } finally {
    act(() => render(null, el));
    system.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});

it('uses one set of filled controls in either the legend or the HUD blocks, and cancels a hold on switching', () => {
  vi.useFakeTimers(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const el = document.createElement('div'), receive = vi.fn();
  const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 80, activeSeconds: 754, gear: 8 } as BikeState;
  const hud: GameHud = { touchControls: ['a', 'down', 'b', 'y', 'z'], controls: [
    { button: 'a', label: 'Construction' }, { button: 'down', label: 'Workshop' },
    { button: 'b', label: 'Overcharge', cooldown: { fill: .4, ready: false, tint: '#ffd23b' } },
    { button: 'y', label: 'Slow field' }, { button: 'z', label: 'Rail', cooldown: { fill: 1, ready: true },
      touch: { down: { type: 'railDown', epoch: 7 }, up: { type: 'railUp', epoch: 7 }, cancel: { type: 'railCancel', epoch: 7 } } },
  ] };
  const session = { ctx: { bike: () => bike }, sim: { hud: () => hud, receive } } as unknown as SessionLike;
  const profile = { ftp: 250, maxHr: 190, settings: { zoneSource: 'auto' } } as Profile;
  const show = (legendOn: boolean, paused = false) => act(() => render(<HudLayer session={session} profile={profile} paused={paused} legendOn={legendOn} />, el));
  try {
    show(true); act(() => { vi.advanceTimersByTime(100); });
    expect(el.querySelectorAll('.hood')).toHaveLength(2); expect(el.querySelector('.hud-actions')).toBeNull();
    expect(el.querySelector('[data-control="b"] .pk-fill')).not.toBeNull();
    show(false);
    expect(el.querySelector('.hood')).toBeNull(); expect(el.querySelectorAll('.hud-actions .block')).toHaveLength(5);
    expect(el.querySelector('[data-control="b"]')?.getAttribute('style')).toContain('--fill: 40%');
    const rail = el.querySelector('[data-control="z"]')!;
    const down = new Event('pointerdown', { bubbles: true, cancelable: true }); Object.defineProperty(down, 'pointerId', { value: 23 });
    act(() => { rail.dispatchEvent(down); });
    expect(receive).toHaveBeenLastCalledWith({ type: 'railDown', epoch: 7, pointer: 23 });
    show(true);
    expect(receive).toHaveBeenLastCalledWith({ type: 'railCancel', epoch: 7, pointer: 23 });
    expect(receive.mock.calls.some(([a]) => a.type === 'railUp')).toBe(false);
    show(false, true); expect([...el.querySelectorAll<HTMLButtonElement>('.hud-actions button')].every(b => b.disabled)).toBe(true);
  } finally { act(() => render(null, el)); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
