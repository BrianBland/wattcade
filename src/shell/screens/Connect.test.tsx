// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  select: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
  status: { trainer: { connected: false }, controller: { connected: false }, hr: { connected: false, busy: false, detail: '', error: undefined as string | undefined } },
}));
vi.mock('../services', () => ({
  addSecondController: vi.fn(), connectDevice: m.connect, disconnectDevice: m.disconnect,
  controllerCount: () => 0, controllerInfo: {}, getDeviceStatus: () => m.status, getFake: () => false,
  liveDevices: () => ({ raw: { power: 0, cadence: 0 } }), setFake: vi.fn(), subscribeDevices: () => () => {},
  savedHrWatches: () => [{ id: 'watch-1', name: 'Garmin', selected: false }], selectSavedHrWatch: m.select,
}));
vi.mock('../useMenuNav', () => ({ useMenuNav: () => [4, vi.fn()] }));
vi.mock('../../audio/sfx', () => ({ play: vi.fn() }));
import { Connect } from './Connect';
let host: HTMLDivElement;
afterEach(async () => { if (host) { await act(() => render(null, host)); host.remove(); } vi.clearAllMocks(); });
async function mount() {
  host = document.createElement('div'); document.body.append(host);
  await act(() => render(<Connect onDone={() => {}} />, host));
}
it('a saved-watch click invokes the switch once without bubbling to the device card', async () => {
  m.status.hr.busy = false; await mount();
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Use Garmin'))!;
  await act(() => button.click());
  expect(m.select).toHaveBeenCalledExactlyOnceWith('watch-1');
  expect(m.connect).not.toHaveBeenCalled(); expect(m.disconnect).not.toHaveBeenCalled();
});
it('explains that a saved-watch button is disabled while connecting', async () => {
  m.status.hr.busy = true; m.status.hr.detail = 'Garmin: connecting GATT'; await mount();
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Wait for connection:'))!;
  expect(button.disabled).toBe(true); expect(host.textContent).toContain('Garmin: connecting GATT');
});

it('shows retry feedback while disconnected and offers explicit picker selection', async () => {
  m.status.hr.busy = false; m.status.hr.detail = 'Saved watch retry #2 failed'; m.status.hr.error = 'rejected with 2';
  await mount();
  expect(host.textContent).toContain('Saved watch retry #2 failed');
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === 'Select watch again')!;
  await act(() => button.click());
  expect(m.connect).toHaveBeenCalledExactlyOnceWith('hr');
  expect(m.disconnect).not.toHaveBeenCalled();
});
