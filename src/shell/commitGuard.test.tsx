// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { deliverMenuPresses } from './menuInput';
import { setShellCommitGuard, shellCommit, SHELL_COMMIT_GUARD_S } from './commitGuard';
import { PauseMenu } from './screens/PauseMenu';
import { Btn } from './components/Bits';

afterEach(() => setShellCommitGuard(0));

it('swallows a second commit inside the hold and passes one after it', () => {
  setShellCommitGuard(SHELL_COMMIT_GUARD_S);
  expect(shellCommit(10)).toBe(true);
  expect(shellCommit(10.1)).toBe(false);
  expect(shellCommit(10 + SHELL_COMMIT_GUARD_S)).toBe(true);
});

it('a double press of A, or a double tap on a button, acts once; shared across both paths', () => {
  setShellCommitGuard(SHELL_COMMIT_GUARD_S);
  const el = document.createElement('div'); document.body.append(el);
  const onResume = vi.fn(), onClick = vi.fn();
  try {
    act(() => render(<PauseMenu layout="auto" onLayout={() => {}} onResume={onResume} onQuit={() => {}} onHelp={() => {}} onRestart={() => {}} onExtension={() => {}} />, el));
    act(() => deliverMenuPresses(new Set(['a'])));
    act(() => deliverMenuPresses(new Set(['a'])));
    expect(onResume).toHaveBeenCalledOnce();
    act(() => render(<Btn onClick={onClick}>Go</Btn>, el));
    el.querySelector('button')!.click(); // right after the A: the same press reaching the next screen
    expect(onClick).not.toHaveBeenCalled();
    setShellCommitGuard(SHELL_COMMIT_GUARD_S); // a fresh hold, as if the rider waited
    el.querySelector('button')!.click(); el.querySelector('button')!.click();
    expect(onClick).toHaveBeenCalledOnce();
  } finally { act(() => render(null, el)); el.remove(); }
});
