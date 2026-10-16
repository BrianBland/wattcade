// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { GameModule, Profile } from '../../contracts';

const setup = vi.hoisted(() => ({ system: undefined as ((action: string) => void) | undefined }));
vi.mock('../services', () => ({
  debugActions: { panic: vi.fn() }, getFake: () => true, activeSession: () => null, previewAward: () => null,
  saveFailureMessage: () => "Couldn't save your ride; keep it open and retry.",
  mediaEngine: vi.fn(), input: { attachKeyboard: () => () => {}, attachGamepad: () => () => {}, attachTouch: () => () => {}, state: () => ({}) },
  onSystem: (cb: typeof setup.system) => { setup.system = cb; return () => {}; },
  startSession: () => ({ idle: () => new Set(), ctx: { bike: () => ({}) }, sim: { inMenu: () => true, hud: () => ({}), snapshot: () => ({}) }, pause: vi.fn(), resume: vi.fn() }),
}));
vi.mock('../fakeKeysDom', () => ({ attachFakeKeys: () => () => {} }));
vi.mock('../hud/HudLayer', () => ({ HudLayer: () => null }));
vi.mock('../../audio/sfx', () => ({ duckAmbient: vi.fn(), play: vi.fn(), unlockAudio: vi.fn() }));
vi.mock('./PauseMenu', () => ({ PauseMenu: ({ onRestart }: { onRestart: () => void }) => <button onClick={onRestart}>Restart</button> }));
import { GameHost } from './GameHost';

let host: HTMLDivElement;
afterEach(() => { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); });

it('keeps a failed ride save visible and lets the rider retry the same finish action', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  const onRestart = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined), onAbandon = vi.fn();
  const game = { id: 'toy', title: 'Toy', loadRenderer: async () => ({ mount() {}, unmount() {}, render() {} }) } as unknown as GameModule;
  host = document.createElement('div'); document.body.append(host);
  await act(async () => { render(<GameHost game={game} profile={{ level: 1 } as Profile} onRestart={onRestart}
    onAbandon={onAbandon} onQuit={() => {}} onSave={() => {}} />, host); });
  await act(async () => { await Promise.resolve(); });
  await act(() => setup.system!('pause'));
  expect(host.textContent).toContain('Restart');
  await act(async () => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Restart')!.click(); await Promise.resolve(); });
  expect(onRestart).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('keep it open');
  expect(onAbandon).not.toHaveBeenCalled();
  await act(async () => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry save')!.click(); await Promise.resolve(); });
  expect(onRestart).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
