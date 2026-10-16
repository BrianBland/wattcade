// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { SHIFT_CHARS, encodeGear, encodeShiftHello } from '../devices/zwiftTrainer/codec';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.resetModules(); });
const click = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label)!.click();
async function fixture() {
  document.body.innerHTML = '<div id="shift-probe"></div>';
  const control = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  const response = new EventTarget();
  const data = new EventTarget();
  const bike = new EventTarget();
  for (const c of [control, response, data, bike]) Object.assign(c, { startNotifications: vi.fn().mockResolvedValue(c) });
  const write = vi.fn().mockResolvedValue(undefined);
  const writer = { uuid: SHIFT_CHARS.write, properties: { write: true }, writeValueWithResponse: write };
  const ftmsWrite = vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    Object.assign(control, { value: new DataView(Uint8Array.of(0x80, bytes[0], 1).buffer) });
    control.dispatchEvent(new Event('characteristicvaluechanged'));
  });
  Object.assign(control, { uuid: 'ftms-control', properties: { write: true }, writeValueWithResponse: ftmsWrite });
  const nativeService = { uuid: 'native', getCharacteristic: async (uuid: string) => ({
    [SHIFT_CHARS.write]: writer, [SHIFT_CHARS.response]: response, [SHIFT_CHARS.data]: data,
  })[uuid] };
  const ftms = { getCharacteristic: async (uuid: number) => uuid === 0x2ad9 ? control : bike };
  const server = { getPrimaryService: async (uuid: number) => {
    if (uuid === 0x180a) throw new Error('No device info');
    return uuid === 0x1826 ? ftms : nativeService;
  } };
  const device = new EventTarget();
  const gatt = { connected: false, connect: vi.fn().mockImplementation(async () => { gatt.connected = true; return server; }),
    disconnect: vi.fn().mockImplementation(() => { gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }) };
  Object.assign(device, { name: 'KICKR CORE', id: 'core', gatt });
  vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) } });
  await import('./shift');
  click('Connect KICKR');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Connected. Enable'));
  return { write, ftmsWrite, gatt, response };
}
it('connects without trainer writes, then sends an explicit handshake and selected ratio', async () => {
  const { write, ftmsWrite } = await fixture();
  expect(write).not.toHaveBeenCalled(); expect(ftmsWrite).not.toHaveBeenCalled();
  click('Enable native shifting');
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect([...write.mock.calls[0][0]]).toEqual([...encodeShiftHello()]);
  await vi.waitFor(() => expect(document.querySelector('select')!.disabled).toBe(false));
  click('Send selected gear');
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(3));
  expect([...write.mock.calls[1][0]]).toEqual([...encodeGear(12)]);
  expect(document.body.textContent).toContain('Requested gear 12');
});
it('waits for FTMS acknowledgements and requests control only once per connection', async () => {
  const { ftmsWrite } = await fixture();
  click('FTMS hill 2%');
  await vi.waitFor(() => expect(document.body.textContent).toContain('2% accepted'));
  expect(ftmsWrite.mock.calls.map(call => call[0][0])).toEqual([0, 7, 0x11]);
  click('FTMS hill 0%');
  await vi.waitFor(() => expect(document.body.textContent).toContain('0% accepted'));
  expect(ftmsWrite.mock.calls.map(call => call[0][0])).toEqual([0, 7, 0x11, 0x11]);
});
it('disconnect clears native initialization and removes notification listeners', async () => {
  const { write, response } = await fixture();
  click('Enable native shifting');
  await vi.waitFor(() => expect(document.querySelector('select')!.disabled).toBe(false));
  click('Disconnect');
  Object.assign(response, { value: new DataView(Uint8Array.of(1, 2, 3).buffer) });
  response.dispatchEvent(new Event('characteristicvaluechanged'));
  expect(document.body.textContent).not.toContain('NATIVE-RX');
  click('Connect KICKR');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Connected. Enable'));
  click('Send selected gear');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Enable native shifting first'));
  expect(write).toHaveBeenCalledTimes(1);
});
