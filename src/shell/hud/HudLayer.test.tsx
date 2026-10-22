// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BikeState, GameHud, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import * as services from '../services';
import { HudLayer } from './HudLayer';

let el: HTMLDivElement;
const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 85, activeSeconds: 754, gear: 8 } as BikeState;
const profile = { ftp: 250, maxHr: 190, settings: { zoneSource: 'auto' } } as Profile;
const make = (hud: GameHud, receive = vi.fn()) => ({ ctx: { bike: () => bike }, sim: { hud: () => hud, receive }, mixer: { command: { mode: 'erg', watts: 173 } } }) as unknown as SessionLike;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(services, 'hasConnectedController').mockReturnValue(false);
  el = document.createElement('div'); document.body.append(el);
});
afterEach(() => { act(() => render(null, el)); el.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('keeps touch gear controls independent of the menu and cancels them when ERG replaces gearing', () => {
  const system = vi.spyOn(services.input, 'system'), hud: GameHud = { gears: true, controls: [{ button: 'shiftersL', label: 'Gear' }] };
  const session = make(hud);
  act(() => render(<HudLayer session={session} profile={profile} paused={false} layout="touch" />, el));
  const shift = el.querySelector<HTMLButtonElement>('[aria-label="Gear up"]')!;
  const down = new Event('pointerdown', { bubbles: true, cancelable: true }); Object.defineProperty(down, 'pointerId', { value: 51 });
  act(() => { shift.dispatchEvent(down); services.input.beginTick(.1); });
  expect(services.input.state().held.has('shiftUpL')).toBe(true);
  hud.gears = false;
  act(() => { vi.advanceTimersByTime(100); });
  act(() => { services.input.beginTick(.1); });
  expect(el.querySelector('[aria-label="Gear up"]')).toBeNull();
  expect(services.input.state().held.has('shiftUpL')).toBe(false);
  expect(el.querySelector('[aria-label="Trainer ERG 173 W"]')).not.toBeNull();
  act(() => el.querySelector<HTMLButtonElement>('.hud-menu-hit')!.click());
  expect(system).toHaveBeenCalledExactlyOnceWith('pause');
});

it('uses connection presence while idle, and cancels a touch hold on attach before restoring touch on disconnect', () => {
  const connected = vi.mocked(services.hasConnectedController), receive = vi.fn();
  const hud: GameHud = { gears: true, touchControls: ['a', 'z'], controls: [
    { button: 'left', label: 'Target closer' }, { button: 'a', label: 'Build' },
    { button: 'z', label: 'Rail (hold = all)', indicator: { label: 'Rail 1/3' }, cooldown: { fill: .4, ready: true },
      touch: { down: { type: 'railDown', epoch: 7 }, up: { type: 'railUp', epoch: 7 }, cancel: { type: 'railCancel', epoch: 7 } } },
  ] };
  const session = make(hud, receive);
  act(() => render(<HudLayer session={session} profile={profile} paused={false} layout="auto" />, el));
  const down = new Event('pointerdown', { bubbles: true, cancelable: true }); Object.defineProperty(down, 'pointerId', { value: 23 });
  act(() => { el.querySelector('[data-control="z"]')!.dispatchEvent(down); });
  expect(receive).toHaveBeenLastCalledWith({ type: 'railDown', epoch: 7, pointer: 23 });
  connected.mockReturnValue(true);
  act(() => { vi.advanceTimersByTime(100); });
  expect(receive).toHaveBeenLastCalledWith({ type: 'railCancel', epoch: 7, pointer: 23 });
  expect(receive.mock.calls.some(([a]) => a.type === 'railUp')).toBe(false);
  expect(el.querySelector('.floating-controls')).toBeNull();
  expect(el.querySelector('[data-control]')).toBeNull();
  expect(el.querySelector('.action-indicators')?.textContent).toContain('Rail 1/3Ready');
  expect(el.querySelector('.action-indicators button')).toBeNull();
  act(() => { vi.advanceTimersByTime(1000); }); // keyboard/script remains the input source; idle presence wins
  expect(el.querySelector('.floating-controls')).toBeNull();
  connected.mockReturnValue(false);
  act(() => { vi.advanceTimersByTime(100); });
  expect(el.querySelectorAll('.floating-controls button')).toHaveLength(2);
  expect(el.querySelector('.action-indicators')).toBeNull();
  connected.mockReturnValue(true);
  act(() => render(<HudLayer session={session} profile={profile} paused={false} layout="touch" />, el));
  expect(el.querySelectorAll('.floating-controls button')).toHaveLength(2);
});

it('leaves no action strip for routine controls and distinguishes charge from usability', () => {
  const hud: GameHud = { controls: [{ button: 'left', label: 'Move' }, { button: 'a', label: 'Select' }] }, session = make(hud);
  const show = (paused = false) => act(() => render(<HudLayer session={session} profile={profile} paused={paused} layout="controller" />, el));
  show(); expect(el.querySelector('.action-indicators')).toBeNull();
  hud.controls!.push({ button: 'b', label: 'Ward', cooldown: { fill: .4, ready: false } }, { button: 'y', label: 'Rally', active: false, cooldown: { fill: 1, ready: true } });
  act(() => { vi.advanceTimersByTime(100); });
  expect(el.querySelector('.action-indicators')?.textContent).toBe('WardChargingRallyUnavailable');
  expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
  show(true); expect(el.querySelector('.action-indicators')).toBeNull();
});

it('keeps the complete guide and fake help on demand, with history outside measured occlusions', () => {
  const hud: GameHud = { controls: [{button:'a',label:'Build'},{button:'down',label:'Workshop'},{button:'left',label:'Closer'},{button:'right',label:'Further'},{button:'b',label:'Overcharge'},{button:'y',label:'Slow field'},{button:'z',label:'Rail'},{button:'paddles',label:'Target'},{button:'shiftUpL',label:'Custom shift'}] };
  const session = make(hud);
  act(() => render(<HudLayer session={session} profile={profile} paused={false} layout="controller" fake />, el));
  expect(el.querySelector('.hud .fake-bike-help,.hud .zw-history')).toBeNull();
  act(() => el.querySelector<HTMLButtonElement>('[aria-label="Controller guide"]')!.click());
  expect(el.querySelectorAll('.legend-binding')).toHaveLength(9);
  expect(el.querySelector('.fake-bike-help')?.textContent).toContain('W / S');
  expect(el.querySelector('.hud-guide')?.closest('[data-hud-occlusion]')).toBeNull();
  act(() => el.querySelector<HTMLButtonElement>('[aria-label="Recent effort history"]')!.click());
  expect(el.querySelector('.hud-peek .zw-chart')).not.toBeNull();
  const controls = vi.fn();
  act(() => render(<HudLayer session={session} profile={profile} paused={false} layout="controller" onControls={controls} />, el));
  act(() => el.querySelector<HTMLButtonElement>('[aria-label="Controller guide"]')!.click());
  expect(controls).toHaveBeenCalledOnce(); expect(el.querySelector('.hud-guide')).toBeNull();
});


it('keeps an explicit empty touch set out of the measured floating envelope', () => {
  const hud: GameHud = { gears: true, touchControls: [], controls: [{ button: 'dpad', label: 'Move' }, { button: 'a', label: 'Select' }] };
  act(() => render(<HudLayer session={make(hud)} profile={profile} paused={false} layout="touch" />, el));
  expect(el.querySelector('.floating-controls')).toBeNull();
  expect(el.querySelectorAll('[data-hud-occlusion]')).toHaveLength(1);
});

it('keeps phone gears and secondary tools on demand and cancels a held gear when dismissed', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const hud: GameHud = { gears: true, targetZone: { min: 4, max: 5, source: 'power', label: 'Climb' }, touchControls: [], controls: [{ button: 'shiftersL', label: 'Gear' }] };
  act(() => render(<HudLayer session={make(hud)} profile={profile} paused={false} layout="touch" />, el));
  expect(el.querySelector('.compact-instruments')).not.toBeNull();
  expect(el.querySelector('.zw-nums>div:first-child .zw-unit')?.textContent).toBe('W');
  expect(el.querySelector('.zw-label')?.textContent).toContain('Climb');
  expect(el.querySelector('.zw-label')?.textContent).toContain('+ W');
  const toggle = el.querySelector<HTMLButtonElement>('button[aria-label="Ride tools"]')!;
  expect(el.querySelector('.hud-tools-list')?.hasAttribute('hidden')).toBe(true);
  expect(el.querySelector('[aria-label="Gear up"]')).toBeNull();
  act(() => toggle.click());
  const shift = el.querySelector('[aria-label="Gear up"]')!;
  const down = new Event('pointerdown', { bubbles: true, cancelable: true }); Object.defineProperty(down, 'pointerId', { value: 72 });
  act(() => { shift.dispatchEvent(down); services.input.beginTick(.1); });
  expect(services.input.state().held.has('shiftUpL')).toBe(true);
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  act(() => services.input.beginTick(.1));
  expect(services.input.state().held.has('shiftUpL')).toBe(false);
  expect(el.querySelector('[aria-label="Gear up"]')).toBeNull();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  act(() => toggle.click());
  act(() => el.querySelector<HTMLButtonElement>('[aria-label="Recent effort history"]')!.click());
  expect(el.querySelector('.hud-peek .zw-chart')).not.toBeNull();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(el.querySelectorAll('[data-hud-occlusion]')).toHaveLength(1);
  act(() => el.querySelector<HTMLButtonElement>('[aria-label="Close HUD panel"]')!.click());
  expect(document.activeElement).toBe(toggle);
});

it('keeps the overworld reminder only while a controller is present and measures it separately', () => {
  const connected = vi.mocked(services.hasConnectedController);
  const hud: GameHud = { persistentLegend: true, touchControls: [], controls: [{ button: 'dpad', label: 'Move' }, { button: 'a', label: 'Select' }, { button: 'b', label: 'Back' }] };
  act(() => render(<HudLayer session={make(hud)} profile={profile} paused={false} layout="auto" />, el));
  expect(el.querySelector('.controller-navigation')).toBeNull();
  connected.mockReturnValue(true); act(() => { vi.advanceTimersByTime(100); });
  expect(el.querySelector('.controller-navigation')?.textContent).toContain('ASelect');
  expect(el.querySelector('.controller-navigation')?.textContent).toContain('BBack');
  expect(el.querySelector('.controller-navigation button')).toBeNull();
  expect(el.querySelectorAll('[data-hud-occlusion]')).toHaveLength(2);
  // The game selector supplies more specific contextual hints while it is visible.
  act(() => render(<HudLayer session={make(hud)} profile={profile} paused={false} layout="auto" showNavigationLegend={false} />, el));
  expect(el.querySelector('.controller-navigation')).toBeNull();
  expect(el.querySelectorAll('[data-hud-occlusion]')).toHaveLength(1);
  act(() => render(<HudLayer session={make(hud)} profile={profile} paused={false} layout="auto" showNavigationLegend />, el));
  expect(el.querySelector('.controller-navigation')).not.toBeNull();
  connected.mockReturnValue(false); act(() => { vi.advanceTimersByTime(100); });
  expect(el.querySelector('.controller-navigation')).toBeNull();
  expect(el.querySelector('.floating-controls')).toBeNull();
});
