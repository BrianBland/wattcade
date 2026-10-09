// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '../contracts';

const restore = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./services', () => ({ restoreSavedSetup: restore, listProfiles: async () => [], lastProfileId: async () => null,
  takePendingRide: () => null, bindDebugInput: () => () => {}, rememberProfile: vi.fn() }));
vi.mock('./drivein/store', () => ({ handleChannelPress: () => false, loadDriveIn: () => {}, setDriveInVisible: () => {} }));
vi.mock('./menuInput', () => ({ setMenuGate: () => {} }));
vi.mock('../audio/sfx', () => ({ play: () => {}, unlockAudio: () => {} }));
vi.mock('./warmup/WarmupStage', () => ({ WarmupStage: () => null }));
vi.mock('../debug/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('./components/FullscreenButton', () => ({ FullscreenButton: () => null }));
vi.mock('./components/Toasts', () => ({ Toasts: () => null, toast: () => {} }));
vi.mock('./screens/Connect', () => ({ Connect: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>device setup</button> }));
vi.mock('./screens/ProfilePicker', () => ({ ProfilePicker: ({ onPick }: { onPick: (p: Profile) => void }) => <button onClick={() => onPick({ id: 'rider' } as Profile)}>player selection</button> }));
vi.mock('./screens/ArcadeMenu', () => ({ ArcadeMenu: ({ onNav }: { onNav: (s: 'connect') => void }) => <button onClick={() => onNav('connect')}>arcade</button> }));
import { App } from './App';

describe('startup navigation', () => {
  it('connects before selecting a player, then goes to arcade; device revisits return to arcade', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const click = async () => { await act(() => host.querySelector('button')!.click()); };
    try {
      await act(() => render(<App />, host));
      expect(host.textContent).toContain('device setup'); expect(restore).toHaveBeenCalledTimes(1);
      await click(); expect(host.textContent).toContain('player selection');
      await click(); expect(host.textContent).toContain('arcade');
      await click(); expect(host.textContent).toContain('device setup');
      await click(); expect(host.textContent).toContain('arcade');
      expect(restore).toHaveBeenCalledTimes(1);
    } finally { await act(() => render(null, host)); host.remove(); }
  });
});
