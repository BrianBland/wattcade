import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readSavedSetup, rememberDevices, resolveSavedSetup, SAVED_SETUP_KEY } from './savedSetup';

const mocks = vi.hoisted(() => {
  const instance = (id: string) => ({ id, name: 'same name', bluetoothDevice: { id, name: 'same name' } as BluetoothDevice, onSample: () => () => {}, onStatus: () => () => {}, disconnect: vi.fn(), capabilities: {} });
  return {
    trainer: vi.fn(async (d: BluetoothDevice) => instance(d.id)),
    hr: vi.fn(async (d: BluetoothDevice) => instance(d.id)),
    trainerPicker: vi.fn(async () => instance('new-trainer')),
    hrPicker: vi.fn(async () => instance('new-hr')),
    ride: vi.fn(async (_d: BluetoothDevice) => {}),
    ridePicker: vi.fn(),
  };
});
vi.mock('../devices/ftms', () => ({ FtmsTrainer: { connectDevice: mocks.trainer, connect: mocks.trainerPicker } }));
vi.mock('../devices/hr', () => ({ HeartRateMonitor: { connectDevice: mocks.hr, connect: mocks.hrPicker } }));
vi.mock('../devices/zwiftRide', () => ({ RideControllerGroup: class {
  ids: string[] = [];
  get count() { return this.ids.length; }
  async addDevice(d: BluetoothDevice) { await mocks.ride(d); this.ids.push(d.id); }
  async addFromPicker() { mocks.ridePicker(); this.ids.push('new-side'); }
  onState() { return () => {}; } onStatus() { return () => {}; } onLog() { return () => {}; }
  async disconnect() {}
} }));
const device = (id: string, name = 'same name') => ({ id, name } as BluetoothDevice);
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  values = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  vi.stubGlobal('navigator', { bluetooth: { getDevices: vi.fn(async () => [device('trainer'), device('left'), device('right'), device('hr')]) } });
});
afterEach(() => vi.unstubAllGlobals());
function saveAll() {
  rememberDevices('trainer', ['trainer']); rememberDevices('controller', ['left', 'right']); rememberDevices('hr', ['hr']);
}

describe('saved setup', () => {
  it('validates stored IDs and survives corrupt or blocked storage', () => {
    values.set(SAVED_SETUP_KEY, '{'); expect(readSavedSetup()).toEqual({});
    values.set(SAVED_SETUP_KEY, JSON.stringify({ trainer: [null, '', 'trainer', 'extra'], controller: ['left', 'left', 'right'] }));
    expect(readSavedSetup()).toEqual({ trainer: ['trainer'], controller: ['left', 'right'] });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readSavedSetup()).toEqual({}); expect(() => rememberDevices('hr', ['hr'])).not.toThrow();
  });
  it('matches identical names by ID and ignores unrelated grants', () => {
    expect(resolveSavedSetup({ controller: ['right', 'left'] }, [device('left'), device('other')])).toEqual({ controller: [device('left')] });
  });
  it('restores all roles and both Ride sides once without opening a picker', async () => {
    saveAll(); const s = await import('./services');
    await Promise.all([s.restoreSavedSetup(), s.restoreSavedSetup()]);
    expect(navigator.bluetooth.getDevices).toHaveBeenCalledTimes(1);
    expect(mocks.trainer).toHaveBeenCalledWith(device('trainer'), expect.any(Function));
    expect(mocks.hr).toHaveBeenCalledWith(device('hr'), expect.any(Function));
    expect(mocks.ride.mock.calls.map(([d]) => d.id)).toEqual(['left', 'right']);
    expect(mocks.trainerPicker).not.toHaveBeenCalled(); expect(mocks.hrPicker).not.toHaveBeenCalled(); expect(mocks.ridePicker).not.toHaveBeenCalled();
    expect(s.controllerCount()).toBe(2); expect(s.getDeviceStatus().trainer.connected).toBe(true);
  });
  it('discovers each saved device before GATT and never opens a picker', async () => {
    saveAll();
    const granted = ['hr', 'trainer', 'left', 'right'].map(id => {
      const d = new EventTarget() as BluetoothDevice;
      const signals: AbortSignal[] = [];
      const watchAdvertisements = vi.fn(async (opts: { signal: AbortSignal }) => { signals.push(opts.signal); });
      Object.assign(d, { id, name: id, watchAdvertisements });
      return { d, watchAdvertisements, signals };
    });
    vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => granted.map(g => g.d) } });
    const s = await import('./services'); const restoring = s.restoreSavedSetup();
    for (const [i, g] of granted.entries()) {
      await vi.waitFor(() => expect(g.watchAdvertisements).toHaveBeenCalledOnce());
      const kind = i === 0 ? 'hr' : i === 1 ? 'trainer' : 'controller';
      expect(s.getDeviceStatus()[kind].detail).toContain('Waiting for device advertisement');
      expect([mocks.hr, mocks.trainer, mocks.ride].reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(i);
      g.d.dispatchEvent(new Event('advertisementreceived'));
      await vi.waitFor(() => expect(g.signals[0].aborted).toBe(true));
    }
    await restoring;
    expect(s.getDeviceStatus().hr.connected).toBe(true); expect(s.controllerCount()).toBe(2);
    expect(mocks.hrPicker).not.toHaveBeenCalled(); expect(mocks.trainerPicker).not.toHaveBeenCalled(); expect(mocks.ridePicker).not.toHaveBeenCalled();
  });
  it('tries another saved watch if discovery fails before GATT', async () => {
    rememberDevices('hr', ['mine', 'wife']);
    const mine = new EventTarget() as BluetoothDevice;
    Object.assign(mine, { id: 'mine', watchAdvertisements: () => Promise.reject(2) });
    vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => [mine, device('wife')] } });
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(mocks.hr.mock.calls.map(([d]) => d.id)).toEqual(['wife']);
    expect(s.getDeviceStatus().hr.connected).toBe(true); expect(readSavedSetup().hr).toEqual(['wife', 'mine']);
    expect(mocks.hrPicker).not.toHaveBeenCalled();
  });
  it('preserves missing sides and keeps successful devices when another fails', async () => {
    saveAll(); vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => [device('trainer'), device('left'), device('hr')] } });
    mocks.trainer.mockRejectedValueOnce(new Error('powered off'));
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(s.getDeviceStatus().trainer.error).toBe('powered off');
    expect(s.getDeviceStatus().hr.connected).toBe(true); expect(s.controllerCount()).toBe(1);
    expect(s.getDeviceStatus().controller.error).toContain('Add other side');
    expect(readSavedSetup().controller).toEqual(['left', 'right']);
  });
  it.each(['unsupported', 'revoked', 'rejected'])('allows manual selection after %s permissions', async (mode) => {
    rememberDevices('trainer', ['trainer']);
    vi.stubGlobal('navigator', { bluetooth: mode === 'unsupported' ? {} : { getDevices: async () => { if (mode === 'rejected') throw new Error('denied'); return []; } } });
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(s.getDeviceStatus().trainer.busy).toBeFalsy(); expect(mocks.trainerPicker).not.toHaveBeenCalled();
    await s.connectDevice('trainer'); expect(mocks.trainerPicker).toHaveBeenCalledTimes(1);
    expect(readSavedSetup().trainer).toEqual(['new-trainer']);
  });
  it('keeps multiple watches, promotes the last used, and deduplicates IDs', () => {
    rememberDevices('hr', ['wife']); rememberDevices('hr', ['mine']); rememberDevices('hr', ['wife']);
    expect(readSavedSetup().hr).toEqual(['wife', 'mine']);
    expect(resolveSavedSetup(readSavedSetup(), [device('mine'), device('wife')]).hr?.map(d => d.id)).toEqual(['wife', 'mine']);
  });
  it('tries the next watch if the last used watch is offline, without forgetting either', async () => {
    rememberDevices('hr', ['mine', 'wife']);
    vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => [device('mine'), device('wife')] } });
    mocks.hr.mockRejectedValueOnce(new Error('offline'));
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(mocks.hr.mock.calls.map(([d]) => d.id)).toEqual(['mine', 'wife']);
    expect(s.getDeviceStatus().hr.connected).toBe(true);
    expect(readSavedSetup().hr).toEqual(['wife', 'mine']);
    expect(mocks.hrPicker).not.toHaveBeenCalled();
    expect(s.savedHrWatches().map(w => [w.id, w.selected])).toEqual([['wife', true], ['mine', false]]);
  });
  it('switches saved watches and adds another while preserving the pool', async () => {
    rememberDevices('hr', ['mine', 'wife']);
    vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => [device('mine'), device('wife')] } });
    const s = await import('./services'); await s.restoreSavedSetup();
    await s.selectSavedHrWatch('wife');
    expect(mocks.hr.mock.calls.map(([d]) => d.id)).toEqual(['mine', 'wife']);
    expect(readSavedSetup().hr).toEqual(['wife', 'mine']);
    await s.selectSavedHrWatch('wife'); expect(mocks.hr).toHaveBeenCalledTimes(2);
    expect(mocks.hrPicker).not.toHaveBeenCalled();
    await s.connectDevice('hr');
    expect(readSavedSetup().hr).toEqual(['new-hr', 'wife', 'mine']);
    expect(s.savedHrWatches().find(w => w.id === 'new-hr')?.selected).toBe(true);
  });
  it('continues with the authorized watch when another grant is missing', async () => {
    rememberDevices('hr', ['mine', 'wife']);
    vi.stubGlobal('navigator', { bluetooth: { getDevices: async () => [device('wife')] } });
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(s.getDeviceStatus().hr.error).toBeUndefined();
    expect(readSavedSetup().hr).toEqual(['wife', 'mine']);
  });
  it('restores HR before a trainer that stalls, leaving watch selection usable', async () => {
    saveAll();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const original = mocks.trainer.getMockImplementation()!;
    mocks.trainer.mockImplementationOnce(async d => { await blocked; return original(d); });
    const s = await import('./services'); const restoring = s.restoreSavedSetup();
    try {
      await vi.waitFor(() => expect(s.getDeviceStatus().hr.connected).toBe(true));
      expect(s.getDeviceStatus().hr.busy).toBeFalsy();
      expect(s.getDeviceStatus().trainer.busy).toBe(true);
    } finally { release(); await restoring; }
  });
  it('distinguishes an automatic failure from each manual saved-watch retry', async () => {
    rememberDevices('hr', ['hr']);
    mocks.hr.mockRejectedValueOnce(2).mockRejectedValueOnce(2).mockRejectedValueOnce(2);
    const s = await import('./services'); await s.restoreSavedSetup();
    expect(s.getDeviceStatus().hr.detail).toBe('Automatic watch connection #1 failed');
    expect(s.getDeviceStatus().hr.error).toContain('Select watch again');
    await s.selectSavedHrWatch('hr');
    expect(s.getDeviceStatus().hr.detail).toBe('Saved watch retry #2 failed');
    await s.selectSavedHrWatch('hr');
    expect(s.getDeviceStatus().hr.detail).toBe('Saved watch retry #3 failed');
    expect(mocks.hrPicker).not.toHaveBeenCalled();
    await s.connectDevice('hr');
    expect(mocks.hrPicker).toHaveBeenCalledTimes(1);
    expect(s.getDeviceStatus().hr.connected).toBe(true);
  });
  it('blocks manual picker requests while saved permissions are loading', async () => {
    rememberDevices('trainer', ['trainer']);
    let release!: (d: BluetoothDevice[]) => void;
    vi.stubGlobal('navigator', { bluetooth: { getDevices: () => new Promise<BluetoothDevice[]>(r => { release = r; }) } });
    const s = await import('./services'); const restore = s.restoreSavedSetup();
    await s.connectDevice('trainer'); expect(mocks.trainerPicker).not.toHaveBeenCalled();
    release([device('trainer')]); await restore;
  });
});
