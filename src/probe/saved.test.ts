// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
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
