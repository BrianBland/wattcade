// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultProfile } from '../../progression';
import { deliverMenuPresses } from '../menuInput';
vi.mock('../components/RiderAvatar',()=>({RiderAvatar:()=>null}));
import { ProfilePicker } from './ProfilePicker';
let host:HTMLDivElement;
afterEach(async()=>{if(host)await act(()=>render(null,host));});
const profiles=[{...defaultProfile('Mika'),id:'mika'},{...defaultProfile('Jules'),id:'jules'}];
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text))!;
it('previews a rider before starting and edits the selected rider',async()=>{
 host=document.createElement('div');const onPick=vi.fn(),onEdit=vi.fn();
 await act(()=>render(<ProfilePicker profiles={profiles} lastId="mika" onPick={onPick} onEdit={onEdit} onNew={()=>{}}/>,host));
 await act(()=>host.querySelectorAll<HTMLButtonElement>('.rider-entry')[1].click());
 expect(host.querySelector('.rider-details h2')?.textContent).toBe('Jules');expect(onPick).not.toHaveBeenCalled();
 await act(()=>button('Edit rider').click());expect(onEdit).toHaveBeenCalledWith(profiles[1]);
 await act(()=>button('Ride as Jules').click());expect(onPick).toHaveBeenCalledExactlyOnceWith(profiles[1]);
});
it('starts at the last rider and keeps controller Ride, Edit and New rider actions',async()=>{
 host=document.createElement('div');const onPick=vi.fn(),onEdit=vi.fn(),onNew=vi.fn();
 await act(()=>render(<ProfilePicker profiles={profiles} lastId="jules" onPick={onPick} onEdit={onEdit} onNew={onNew}/>,host));
 expect(host.querySelector('.rider-details h2')?.textContent).toBe('Jules');
 await act(()=>deliverMenuPresses(new Set(['y'])));expect(onEdit).toHaveBeenCalledWith(profiles[1]);
 await act(()=>deliverMenuPresses(new Set(['a'])));expect(onPick).toHaveBeenCalledWith(profiles[1]);
 await act(()=>deliverMenuPresses(new Set(['down'])));await act(()=>deliverMenuPresses(new Set(['a'])));expect(onNew).toHaveBeenCalledOnce();
});
it('offers a new rider when no profiles exist',async()=>{
 host=document.createElement('div');const onNew=vi.fn();
 await act(()=>render(<ProfilePicker profiles={[]} lastId={null} onPick={()=>{}} onEdit={()=>{}} onNew={onNew}/>,host));
 await act(()=>button('Create rider').click());expect(onNew).toHaveBeenCalledOnce();
});
