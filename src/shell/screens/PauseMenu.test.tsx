// @vitest-environment jsdom
import {render} from 'preact';
import {act} from 'preact/test-utils';
import {expect,it,vi} from 'vitest';
import {deliverMenuPresses} from '../menuInput';
import {PauseMenu} from './PauseMenu';
import { TuningRegistry } from '../../core/tuning';
import type { Button } from '../../contracts';

it('reaches History with the controller and keeps fake bike instructions in pause only when applicable', () => {
 const el=document.createElement('div'),onHistory=vi.fn();
 const show=(fake:boolean)=>act(()=>render(<PauseMenu fake={fake} layout="auto" onLayout={()=>{}} onResume={()=>{}} onQuit={()=>{}} onHelp={()=>{}} onRestart={()=>{}} onHistory={onHistory} onExtension={()=>{}}/>,el));
 try{
  show(true);expect(el.querySelector('.fake-bike-help')?.textContent).toContain('W / S');
  for(let i=0;i<5;i++)act(()=>deliverMenuPresses(new Set(['down'])));
  act(()=>deliverMenuPresses(new Set(['a'])));
  expect(onHistory).toHaveBeenCalledOnce();
  show(false);expect(el.querySelector('.fake-bike-help')).toBeNull();
 }finally{act(()=>render(null,el));}
});

it('puts End ride beside Resume and keeps game actions reachable below settings', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const onQuit = vi.fn(), onExtension = vi.fn();
  try {
    await act(async () => render(<PauseMenu layout="auto" onLayout={() => {}} onResume={() => {}} onHelp={() => {}} onRestart={() => {}} onQuit={onQuit}
      extensions={[{ id: 'custom', label: 'Game action', action: { type: 'custom' } }]} onExtension={onExtension} />, container));
    const rideActions = [...container.querySelectorAll('.pause-ride-actions button')];
    expect(rideActions.map(button => button.textContent)).toEqual(['Resume ride →', 'End ride']);
    expect(container.querySelector('.focused')?.textContent).toBe('Resume ride →');
    await act(async () => deliverMenuPresses(new Set(['right'])));
    await act(async () => deliverMenuPresses(new Set(['a'])));
    expect(onQuit).toHaveBeenCalledOnce();
    // Difficulty, layout, sound, utility actions, then the game action.
    for (let i = 0; i < 6; i++) await act(async () => deliverMenuPresses(new Set(['down'])));
    await act(async () => deliverMenuPresses(new Set(['a'])));
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

it('keeps Exit game as the top-level action in a game lobby and B resumes', () => {
  const el = document.createElement('div'), onQuit = vi.fn(), onResume = vi.fn();
  try {
    act(() => render(<PauseMenu quitLabel="Exit game" layout="auto" onLayout={() => {}} onResume={onResume} onQuit={onQuit} onHelp={() => {}} onRestart={() => {}} onExtension={() => {}} />, el));
    const exit = el.querySelectorAll<HTMLButtonElement>('.pause-ride-actions button')[1];
    expect(exit.textContent).toBe('Exit game');
    act(() => exit.click());
    expect(onQuit).toHaveBeenCalledOnce();
    act(() => deliverMenuPresses(new Set(['right'])));
    act(() => deliverMenuPresses(new Set(['b'])));
    expect(onResume).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  } finally { act(() => render(null, el)); }
});

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
  const press = async (button: Button) => { await act(async () => deliverMenuPresses(new Set([button]))); };
  try {
    await act(async () => render(<PauseMenu initial={7} layout="auto" onLayout={() => {}} onResume={onResume} onHelp={() => {}} onRestart={() => {}} onQuit={() => {}} onExtension={() => {}} tuning={tuning} />, container));
    await press('a'); expect(container.querySelector('h2')?.textContent).toBe('Paddle steering');
    await press('right'); expect(tuning.get('cadenza.paddleMode')).toBe('stepped');
    await press('down'); await press('a'); expect(tuning.get('cadenza.paddleCurve')).toBe('quadratic');
    await press('down'); await press('left'); expect(tuning.get('cadenza.paddleDeadzone')).toBe(14);
    await press('down'); await press('right'); expect(tuning.get('cadenza.paddleSwitchThreshold')).toBe(31);
    expect(onResume).not.toHaveBeenCalled();
    await press('b'); expect(container.querySelector('h2')?.textContent).toBe('Paused.');
    expect(container.querySelector('button.focused')?.textContent).toBe('Paddle steering');
    await press('a'); expect(container.querySelector<HTMLInputElement>('input[aria-label="Paddle deadzone"]')?.value).toBe('14');
    await press('down'); await press('down'); await press('down'); await press('down'); await press('down'); await press('a');
    expect(onResume).toHaveBeenCalledOnce();
  } finally { await act(async () => render(null, container)); container.remove(); }
});

it('offers touch changes, clamps numeric settings and keeps stepped threshold available in continuous mode', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const tuning = paddleTuning();
  const click = async (label: string) => { const b = [...container.querySelectorAll('button')].find(b => b.textContent === label)!; await act(async () => b.click()); };
  try {
    await act(async () => render(<PauseMenu layout="auto" onLayout={() => {}} onResume={() => {}} onHelp={() => {}} onRestart={() => {}} onQuit={() => {}} onExtension={() => {}} tuning={tuning} />, container));
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
