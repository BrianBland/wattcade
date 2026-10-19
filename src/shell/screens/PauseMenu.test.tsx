// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ press: null as null | ((buttons: Set<string>) => void) }));
vi.mock('../menuInput', () => ({ onMenuPress: (fn: typeof mocks.press) => { mocks.press = fn; return () => {}; } }));
vi.mock('../services', () => ({ getDifficulty: () => 1, debugActions: { setDifficulty: vi.fn() } }));
vi.mock('../../audio/sfx', () => ({ play: vi.fn(), soundEnabled: () => true, setSoundEnabled: vi.fn() }));
import { PauseMenu } from './PauseMenu';

it('keeps exit selectable and navigates to additional game actions', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const onQuit = vi.fn(), onExtension = vi.fn();
  try {
    await act(async () => render(<PauseMenu initial={6} legendOn onLegend={() => {}} onResume={() => {}} onHelp={() => {}} onRestart={() => {}} onQuit={onQuit}
      extensions={[{ id: 'custom', label: 'Game action', action: { type: 'custom' } }]} onExtension={onExtension} />, container));
    await act(async () => mocks.press?.(new Set(['a'])));
    expect(onQuit).toHaveBeenCalledOnce();
    await act(async () => mocks.press?.(new Set(['down'])));
    await act(async () => mocks.press?.(new Set(['a'])));
    expect(onExtension).toHaveBeenCalledWith({ type: 'custom' });
    expect(onQuit).toHaveBeenCalledOnce();
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Game action')!;
    onExtension.mockClear();
    await act(async () => button.click());
    expect(onExtension).toHaveBeenCalledWith({ type: 'custom' });
  } finally {
    await act(async () => render(null, container)); container.remove();
  }
});
