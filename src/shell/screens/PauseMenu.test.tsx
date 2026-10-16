// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PauseMenu } from './PauseMenu';

const input = vi.hoisted(() => ({ press: undefined as ((buttons: ReadonlySet<string>) => void) | undefined }));
vi.mock('../menuInput', () => ({ onMenuPress: (cb: typeof input.press) => { input.press = cb; return () => { input.press = undefined; }; } }));
vi.mock('../services', () => ({ debugActions: { setDifficulty: vi.fn() }, getDifficulty: () => 1 }));
vi.mock('../../audio/sfx', () => ({ play: vi.fn(), soundEnabled: () => true, setSoundEnabled: vi.fn() }));

let host: HTMLDivElement;
afterEach(() => { act(() => render(null, host)); host.remove(); });

function show(withAction = true) {
  host = document.createElement('div'); document.body.appendChild(host);
  const onBail = vi.fn(), onQuit = vi.fn(), onResume = vi.fn();
  act(() => render(<PauseMenu legendOn onLegend={() => {}} onResume={onResume} onHelp={() => {}}
    onRestart={() => {}} onQuit={onQuit}
    gameActions={withAction ? [{ label: 'Return to Garage · bank parts', onSelect: onBail }] : undefined} />, host));
  return { onBail, onQuit, onResume };
}

it('lets touch return to the Garage without finishing the ride', () => {
  const { onBail, onQuit } = show();
  act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Return to Garage'))!.click(); });
  expect(onBail).toHaveBeenCalledOnce();
  expect(onQuit).not.toHaveBeenCalled();
});

it('lets controller navigation select the game action and B resume', () => {
  const { onBail, onQuit, onResume } = show();
  // Four setting/control rows, then the game action below the standard action row.
  for (let i = 0; i < 5; i++) act(() => input.press!(new Set(['down'])));
  act(() => input.press!(new Set(['a'])));
  expect(onBail).toHaveBeenCalledOnce(); expect(onQuit).not.toHaveBeenCalled();
  act(() => input.press!(new Set(['b'])));
  expect(onResume).toHaveBeenCalledOnce();
});

it('keeps the ordinary pause menu for games without an action', () => {
  show(false);
  expect(host.textContent).toContain('Finish ride');
  expect(host.textContent).not.toContain('Return to Garage');
});
