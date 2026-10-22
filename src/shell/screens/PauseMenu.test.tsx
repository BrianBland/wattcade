// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ press: null as null | ((buttons: Set<string>) => void) }));
vi.mock('../menuInput', () => ({ onMenuPress: (fn: typeof mocks.press) => { mocks.press = fn; return () => {}; } }));
vi.mock('../services', () => ({ getDifficulty: () => 1, debugActions: { setDifficulty: vi.fn() } }));
vi.mock('../../audio/sfx', () => ({ play: vi.fn(), soundEnabled: () => true, setSoundEnabled: vi.fn() }));
import { PauseMenu } from './PauseMenu';
import { TuningRegistry } from '../../core/tuning';

function paddleTuning() {
  const tuning = new TuningRegistry({ storage: null }), t = tuning.scoped('cadenza');
  t.choice('paddleMode', 'continuous', ['stepped', 'continuous']);
  t.choice('paddleCurve', 'linear', ['linear', 'quadratic']);
  t.num('paddleDeadzone', 15, 0, 60, 1);
  t.num('paddleSwitchThreshold', 30, 5, 90, 1);
  return tuning;
}

it('adjusts saved paddle settings by controller without resuming, and returns to the selected pause action', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const tuning = paddleTuning(), onResume = vi.fn();
  const press = async (button: string) => { await act(async () => mocks.press?.(new Set([button]))); };
  try {
    await act(async () => render(<PauseMenu initial={7} legendOn onLegend={() => {}} onResume={onResume} onHelp={() => {}} onRestart={() => {}} onQuit={() => {}} onExtension={() => {}} tuning={tuning} />, container));
    await press('a'); expect(container.querySelector('h2')?.textContent).toBe('Paddle steering');
    await press('right'); expect(tuning.get('cadenza.paddleMode')).toBe('stepped');
    await press('down'); await press('a'); expect(tuning.get('cadenza.paddleCurve')).toBe('quadratic');
    await press('down'); await press('left'); expect(tuning.get('cadenza.paddleDeadzone')).toBe(14);
    await press('down'); await press('right'); expect(tuning.get('cadenza.paddleSwitchThreshold')).toBe(31);
    expect(onResume).not.toHaveBeenCalled();
    await press('b'); expect(container.querySelector('h2')?.textContent).toBe('Paused');
    expect(container.querySelector('button.focused')?.textContent).toBe('Paddle steering');
    await press('a'); expect(container.querySelector<HTMLInputElement>('input[aria-label="Paddle deadzone"]')?.value).toBe('14');
    await press('down'); await press('down'); await press('down'); await press('down'); await press('right'); await press('a');
    expect(onResume).toHaveBeenCalledOnce();
  } finally { await act(async () => render(null, container)); container.remove(); }
});

it('offers touch changes, clamps numeric settings and keeps stepped threshold available in continuous mode', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const tuning = paddleTuning();
  const click = async (label: string) => { const b = [...container.querySelectorAll('button')].find(b => b.textContent === label)!; await act(async () => b.click()); };
  try {
    await act(async () => render(<PauseMenu legendOn onLegend={() => {}} onResume={() => {}} onHelp={() => {}} onRestart={() => {}} onQuit={() => {}} onExtension={() => {}} tuning={tuning} />, container));
    await click('Paddle steering');
    expect(container.textContent).toContain('Applies only in stepped mode');
    await click('Continuous'); await click('Linear');
    expect(tuning.get('cadenza.paddleMode')).toBe('stepped'); expect(tuning.get('cadenza.paddleCurve')).toBe('quadratic');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Paddle deadzone"]')!;
    await act(async () => { input.value = '99'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(tuning.get('cadenza.paddleDeadzone')).toBe(60);
    const threshold = container.querySelector<HTMLInputElement>('input[aria-label="Lane switch threshold"]')!;
    await act(async () => { threshold.value = '-1'; threshold.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(tuning.get('cadenza.paddleSwitchThreshold')).toBe(5);
    await click('Back'); await click('Paddle steering');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Paddle deadzone"]')!.value).toBe('60');
  } finally { await act(async () => render(null, container)); container.remove(); }
});

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
