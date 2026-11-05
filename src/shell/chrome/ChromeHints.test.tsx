// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({connected:false,update:()=>{}}));
vi.mock('../services',()=>({hasConnectedController:()=>state.connected,subscribeDevices:(update:()=>void)=>{state.update=update;return ()=>{};}}));
import { ChromeHints } from './ChromeHints';
it('only shows physical labels while a controller is attached, including changes mid-screen',async()=>{
 const host=document.createElement('div');
 try{
  await act(()=>render(<ChromeHints hints={[["a","Ride"]]}/>,host));expect(host.querySelector('.key-hints')).toBeNull();
  await act(()=>{state.connected=true;state.update();});expect(host.textContent).toContain('ARide');
  await act(()=>{state.connected=false;window.dispatchEvent(new Event('gamepaddisconnected'));});expect(host.querySelector('.key-hints')).toBeNull();
 }finally{await act(()=>render(null,host));}
});
