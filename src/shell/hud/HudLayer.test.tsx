// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import type { BikeState, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { input } from '../services';
import { HudLayer } from './HudLayer';

it('opens the menu from the center hit target while shifters remain independent', () => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const system = vi.spyOn(input, 'system');
  const el = document.createElement('div');
  const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 80, activeSeconds: 754, gear: 8 } as BikeState;
  const session = { ctx: { bike: () => bike }, sim: { hud: () => ({ gears: true }) } } as unknown as SessionLike;
  const profile = { ftp: 250, maxHr: 190, settings: { zoneSource: 'auto' } } as Profile;
  try {
    act(() => render(<HudLayer session={session} profile={profile} paused={false} legendOn />, el));
    act(() => { vi.advanceTimersByTime(100); });
    const hit = el.querySelector<HTMLButtonElement>('.hud-menu-hit')!;
    expect(hit.getAttribute('aria-label')).toBe('Open game menu');
    expect(el.querySelectorAll('.hud-center button')).toHaveLength(1);
    expect(el.querySelectorAll('.pc-gear')).toHaveLength(2);
    const shift = el.querySelector<HTMLButtonElement>('[aria-label="shiftUpL"]')!;
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
