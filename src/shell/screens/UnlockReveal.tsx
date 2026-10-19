import { useRef, useState } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { item } from '../../cosmetics/catalog';
import { riderLook, withItem } from '../../cosmetics/unlocks';
import { SLOT_NAMES, type Slot } from '../../cosmetics/types';
import type { AwardView } from '../types';
import { ItemArt, RiderAvatar } from '../components/RiderAvatar';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { equipItem } from '../services';
import { useMenuNav } from '../useMenuNav';

/** Already earned items: equipping is optional and never interrupts a ride. */
export function UnlockReveal({profile,items,onProfile,onDone}:{profile:Profile;items:AwardView['newItems'];onProfile:(p:Profile)=>void;onDone:()=>void}) {
  const rewards=items.flatMap(it=>{const found=item(it.slot as Slot,it.id);return found?[found]:[];});
  const [index,setIndex]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const busy=useRef(false), reward=rewards[index];
  const advance=()=>{if(index+1<rewards.length)setIndex(index+1);else onDone();};
  const keep=()=>{if(!busy.current)advance();};
  const equip=async()=>{
    if(!reward||busy.current)return;busy.current=true;setSaving(true);setError('');
    try{onProfile(await equipItem(profile,reward.slot,reward.id));advance();}
    catch{setError('Could not save your outfit. Please try again.');}
    finally{busy.current=false;setSaving(false);}
  };
  const [idx]=useMenuNav(2,2,i=>{if(i===0)void equip();else keep();},keep);
  if(!reward)return null;
  const base=riderLook(profile);
  return <div class="screen cosmetic-ui reward-stage unlock-reveal" onKeyDown={e=>{if(e.key==='Enter'&&(e.target as HTMLElement).tagName==='BUTTON')e.stopPropagation();}}>
    <div class="reward-eyebrow">{('level' in reward.source?`LEVEL ${reward.source.level} REWARD`:'NEW COSMETIC')}{rewards.length>1?` · ${index+1} OF ${rewards.length}`:''}</div>
    <div class="unlock-layout"><div class="unlock-copy"><h1>{reward.name} unlocked</h1>{reward.flavor&&<p class="sub">{reward.flavor}</p>}<p>{SLOT_NAMES[reward.slot]} · Now in your Locker</p><div class="reward-actions"><Btn primary focused={idx===0} disabled={saving} onClick={()=>void equip()}>{saving?'Saving…':`Equip ${reward.name}`}</Btn><Btn focused={idx===1} disabled={saving} onClick={keep}>Keep current look →</Btn></div><p class="dim small">You can change your outfit in the Locker.</p>{error&&<p role="alert">{error}</p>}</div>
      <div class="unlock-art">{reward.slot==='title'?<div class="reward-title">{reward.name}</div>:<ItemArt it={reward} base={base} size="hero"/>}<div class="unlock-rider"><RiderAvatar look={withItem(base,reward)} size="hero"/></div></div>
    </div><KeyHints hints={[["a","Equip"],["b","Keep current look"]]}/>
  </div>;
}
