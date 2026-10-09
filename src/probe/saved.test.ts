// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.resetModules(); });
it('reports saved GATT rejection separately from a successful fresh picker connection', async () => {
  document.body.innerHTML = '<div id="probe"></div>';
  const saved = new EventTarget() as BluetoothDevice;
  const connect = vi.fn().mockRejectedValueOnce(2).mockResolvedValue({ getPrimaryServices: async () => [] });
  Object.assign(saved, { id: 'watch-id', name: 'fenix 6 Pro', gatt: { connect, disconnect: vi.fn(), connected: false } });
  const requestDevice = vi.fn().mockResolvedValue(saved);
  vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { getDevices: async () => [saved], requestDevice } });
  await import('./main');
  const click = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!.click();
  click('Check saved devices');
  await vi.waitFor(() => expect(document.querySelector('select')?.value).toBe('watch-id'));
  click('Connect selected saved device');
  await vi.waitFor(() => expect(document.body.textContent).toContain('non-Error rejection: 2 (number)'));
  expect(requestDevice).not.toHaveBeenCalled(); expect(connect).toHaveBeenCalledTimes(1);
  click('Pick HR');
  await vi.waitFor(() => expect(document.body.textContent).toContain('GATT connected'));
  expect(requestDevice).toHaveBeenCalledTimes(1); expect(connect).toHaveBeenCalledTimes(2);
});

it('falls back only when the full-UUID HR picker fails and omits optional services', async () => {
  document.body.innerHTML = '<div id="probe"></div>';
  const watch = new EventTarget();
  const connect = vi.fn().mockResolvedValue({ getPrimaryServices: async () => [] });
  Object.assign(watch, { id: 'hr', gatt: { connect, connected: false } });
  const requestDevice = vi.fn().mockRejectedValueOnce(2).mockResolvedValue(watch);
  vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { requestDevice } });
  await import('./main');
  [...document.querySelectorAll('button')].find(b => b.textContent === 'Pick HR')!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('GATT connected'));
  expect(requestDevice.mock.calls.map(c => c[0])).toEqual([
    { filters: [{ services: ['0000180d-0000-1000-8000-00805f9b34fb'] }] },
    { filters: [{ services: [0x180d] }] },
  ]);
  expect(document.body.textContent).toContain('PICK-ERROR');
  expect(connect).toHaveBeenCalledTimes(1);
});

it('waits for an advertisement before saved GATT and stops the scan without a picker', async () => {
  document.body.innerHTML = '<div id="probe"></div>';
  const watch = new EventTarget() as BluetoothDevice;
  const connect = vi.fn().mockResolvedValue({});
  let signal: AbortSignal;
  const watchAdvertisements = vi.fn().mockImplementation((opts: { signal: AbortSignal }) => {
    signal = opts.signal;
    return Promise.resolve();
  });
  Object.assign(watch, { id: 'hr', watchAdvertisements, gatt: { connect, connected: false } });
  const requestDevice = vi.fn();
  vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { getDevices: async () => [watch], requestDevice } });
  await import('./main');
  const click = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!.click();
  click('Check saved devices');
  await vi.waitFor(() => expect(document.querySelector('select')?.value).toBe('hr'));
  click('Discover then connect saved device');
  await vi.waitFor(() => expect(watchAdvertisements).toHaveBeenCalledOnce());
  expect(connect).not.toHaveBeenCalled();
  watch.dispatchEvent(Object.assign(new Event('advertisementreceived'), { device: watch, rssi: -55 }));
  await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(signal!.aborted).toBe(true);
  expect(requestDevice).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('sameObject=true rssi=-55');
});

it('reports advertisement API rejection without attempting GATT or picker', async () => {
  document.body.innerHTML = '<div id="probe"></div>';
  const watch = new EventTarget();
  const connect = vi.fn();
  Object.assign(watch, { id: 'hr', watchAdvertisements: () => Promise.reject(2), gatt: { connect } });
  const requestDevice = vi.fn();
  vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { getDevices: async () => [watch], requestDevice } });
  await import('./main');
  const click = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!.click();
  click('Check saved devices');
  await vi.waitFor(() => expect(document.querySelector('select')?.value).toBe('hr'));
  click('Discover then connect saved device');
  await vi.waitFor(() => expect(document.body.textContent).toContain('waiting for advertisement: non-Error rejection: 2'));
  expect(connect).not.toHaveBeenCalled(); expect(requestDevice).not.toHaveBeenCalled();
});
