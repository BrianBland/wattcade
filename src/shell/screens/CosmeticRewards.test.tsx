// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { testProfile } from '../../core/testProfile';
import { choosePick,equip } from '../../cosmetics/unlocks';
import { RewardPick } from './RewardPick';
import { UnlockReveal } from './UnlockReveal';
const mocks=vi.hoisted(()=>({pick:vi.fn(),equip:vi.fn(),press:null as null|((s:Set<string>)=>void)}));
vi.mock('../services',async()=>{const {pendingPicks}=await import('../../cosmetics/unlocks');return {pendingPicks,pickReward:mocks.pick,equipItem:mocks.equip};});
vi.mock('../menuInput',()=>({onMenuPress:(f:(s:Set<string>)=>void)=>{mocks.press=f;return()=>{mocks.press=null;};}}));
vi.mock('../../audio/sfx',()=>({play:vi.fn()}));
vi.mock('../components/RiderAvatar',()=>({ItemArt:()=> <span>item art</span>,RiderAvatar:()=> <span>outfit preview</span>}));
let host:HTMLDivElement;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);mocks.pick.mockReset().mockImplementation(async(p,l,id)=>choosePick(p,l,id));mocks.equip.mockReset().mockImplementation(async(p,s,id)=>equip(p,s,id));});
afterEach(()=>{act(()=>render(null,host));host.remove();});
const button=(name:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(name))!;

it('browsing previews without claiming; confirmation owns and equips once',async()=>{
  const onProfile=vi.fn(),onDone=vi.fn();const p=testProfile({level:5});
  act(()=>render(<RewardPick profile={p} onProfile={onProfile} onDone={onDone}/>,host));
  await act(()=>button('Beach Cruiser').click());
  expect(mocks.pick).not.toHaveBeenCalled();expect(onProfile).not.toHaveBeenCalled();
  await act(()=>{button('Choose & equip').click();button('Choose & equip').click();});
  expect(mocks.pick).toHaveBeenCalledTimes(1);expect(onProfile.mock.calls[0][0].cosmetics.loadout.bike).toBe('cruiser');expect(onDone).toHaveBeenCalledTimes(1);
});
it('deferring a pick preserves ownership; a failed save remains retryable',async()=>{
  const onProfile=vi.fn(),onDone=vi.fn();
  act(()=>render(<RewardPick profile={testProfile({level:5})} onProfile={onProfile} onDone={onDone}/>,host));
  await act(()=>button('Decide later').click());expect(mocks.pick).not.toHaveBeenCalled();expect(onDone).toHaveBeenCalledTimes(1);
  onDone.mockClear();mocks.pick.mockRejectedValueOnce(new Error('storage full'));
  await act(async()=>{button('Choose & equip').click();await Promise.resolve();});
  expect(onProfile).not.toHaveBeenCalled();expect(onDone).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('try again');
  await act(async()=>{button('Choose & equip').click();await Promise.resolve();});expect(onProfile).toHaveBeenCalledTimes(1);
});
it('a fixed unlock is already owned; keeping the current outfit never equips',async()=>{
  const onProfile=vi.fn(),onDone=vi.fn();
  act(()=>render(<UnlockReveal profile={testProfile({level:7})} items={[{slot:'pet',id:'corgi',name:'Corgi'}]} onProfile={onProfile} onDone={onDone}/>,host));
  await act(()=>button('Keep current look').click());expect(mocks.equip).not.toHaveBeenCalled();expect(onProfile).not.toHaveBeenCalled();expect(onDone).toHaveBeenCalledTimes(1);
});
it('controller equip persists the earned item and then continues',async()=>{
  const onProfile=vi.fn(),onDone=vi.fn();
  act(()=>render(<UnlockReveal profile={testProfile({level:7})} items={[{slot:'pet',id:'corgi',name:'Corgi'}]} onProfile={onProfile} onDone={onDone}/>,host));
  await act(()=>mocks.press?.(new Set(['a'])));
  expect(onProfile.mock.calls[0][0].cosmetics.loadout.pet).toBe('corgi');expect(onDone).toHaveBeenCalledTimes(1);
});
