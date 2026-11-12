// @vitest-environment jsdom
import {render} from 'preact';
import {act} from 'preact/test-utils';
import {expect,it,vi} from 'vitest';
import {deliverMenuPresses} from '../menuInput';
import {PauseMenu} from './PauseMenu';

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
