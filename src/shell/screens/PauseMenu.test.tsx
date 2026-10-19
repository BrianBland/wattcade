// @vitest-environment jsdom
import {render} from 'preact';
import {act} from 'preact/test-utils';
import {expect,it,vi} from 'vitest';
import {deliverMenuPresses} from '../menuInput';
import {PauseMenu} from './PauseMenu';

it('reaches History with the controller and keeps fake bike instructions in pause only when applicable', () => {
 const el=document.createElement('div'),onHistory=vi.fn();
 const show=(fake:boolean)=>act(()=>render(<PauseMenu fake={fake} legendOn onLegend={()=>{}} onResume={()=>{}} onQuit={()=>{}} onHelp={()=>{}} onRestart={()=>{}} onHistory={onHistory}/>,el));
 try{
  show(true);expect(el.querySelector('.fake-bike-help')?.textContent).toContain('W / S');
  for(let i=0;i<4;i++)act(()=>deliverMenuPresses(new Set(['down'])));
  act(()=>deliverMenuPresses(new Set(['right'])));
  act(()=>deliverMenuPresses(new Set(['a'])));
  expect(onHistory).toHaveBeenCalledOnce();
  show(false);expect(el.querySelector('.fake-bike-help')).toBeNull();
 }finally{act(()=>render(null,el));}
});
