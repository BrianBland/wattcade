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
  for(let i=0;i<4;i++)act(()=>deliverMenuPresses(new Set(['down'])));
  act(()=>deliverMenuPresses(new Set(['right'])));
  act(()=>deliverMenuPresses(new Set(['a'])));
  expect(onHistory).toHaveBeenCalledOnce();
  show(false);expect(el.querySelector('.fake-bike-help')).toBeNull();
 }finally{act(()=>render(null,el));}
});

it('keeps exit selectable and navigates to additional game actions', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const onQuit = vi.fn(), onExtension = vi.fn();
  try {
    await act(async () => render(<PauseMenu initial={6} layout="auto" onLayout={() => {}} onResume={() => {}} onHelp={() => {}} onRestart={() => {}} onQuit={onQuit}
      extensions={[{ id: 'custom', label: 'Game action', action: { type: 'custom' } }]} onExtension={onExtension} />, container));
    await act(async () => deliverMenuPresses(new Set(['a'])));
    expect(onQuit).toHaveBeenCalledOnce();
    await act(async () => deliverMenuPresses(new Set(['down'])));
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
