import { useEffect, useRef, useState } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { pickOptions, riderLook, withItem } from '../../cosmetics/unlocks';
import { SLOT_NAMES } from '../../cosmetics/types';
import { LAST_LEVEL } from '../../cosmetics/catalog';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { ItemArt, RiderAvatar } from '../components/RiderAvatar';
import { pendingPicks, pickReward } from '../services';
import { useMenuNav } from '../useMenuNav';
import { play } from '../../audio/sfx';

/** Browsing only previews. A deliberate confirmation owns and equips one item. */
export function RewardPick({ profile, onProfile, onDone }: { profile: Profile; onProfile: (p: Profile) => void; onDone: () => void }) {
  const level = pendingPicks(profile)[0];
  const opts = level ? pickOptions(profile, level) : [];
  const [selected,setSelected]=useState(1), [saving,setSaving]=useState(false), [error,setError]=useState('');
  const busy=useRef(false);
  const take = async (i: number) => {
    const it = opts[i]; if (!it || busy.current) return;
    busy.current=true;setSaving(true);setError('');
    try {
      const next = await pickReward(profile, level, it.id);
      onProfile(next);play('levelup');
      if (!pendingPicks(next).length) onDone();
    } catch {setError('Could not save your choice. Please try again.');}
    finally {busy.current=false;setSaving(false);}
  };
  const later=()=>{if(!busy.current)onDone();};
  const [idx,setIdx]=useMenuNav(opts.length+2,[opts.length,2],i=>{if(i===opts.length+1)later();else void take(i<opts.length?i:selected);},later,true,{initial:1});
  useEffect(()=>{if(idx<opts.length)setSelected(idx);},[idx,level]);
  useEffect(()=>{setSelected(Math.min(1,opts.length-1));setIdx(Math.min(1,opts.length-1));},[level]);
  if (!level) return null;
  const base = riderLook(profile), chosen=opts[selected]??opts[0];
  return (
    <div class="screen pick cosmetic-ui reward-stage" onKeyDown={e=>{if(e.key==='Enter'&&(e.target as HTMLElement).tagName==='BUTTON')e.stopPropagation();}}>
      <div class="screen-head"><div><div class="reward-eyebrow">LEVEL {level} REWARD</div><h1>Choose your level {level} reward</h1><div class="sub">Pick one. {level < LAST_LEVEL ? 'The others return in a later pick.' : 'More return every 5 levels.'}</div></div></div>
      <div class="reward-showcase">
        <div class="pick-row">{opts.map((it,i)=><button type="button" key={it.id} class={`pick-card${selected===i?' selected':''}${idx===i?' focused':''}`} aria-pressed={selected===i} onFocus={()=>{setSelected(i);setIdx(i);}} onClick={()=>{if(!busy.current){setSelected(i);setIdx(i);}}} disabled={saving}>
          <ItemArt it={it} base={base} size="hero" still road={false}/><div class="dim small">{SLOT_NAMES[it.slot]}</div><h3>{it.name}</h3>{it.flavor&&<div class="dim small">{it.flavor}</div>}
        </button>)}</div>
        <div class="reward-outfit"><RiderAvatar look={withItem(base,chosen)} size="hero"/><span class="dim small">Preview on your rider</span></div>
      </div>
      <div class="reward-actions"><Btn primary focused={idx===opts.length} disabled={saving} onClick={()=>void take(selected)}>{saving?'Saving…':'Choose & equip'}</Btn><Btn focused={idx===opts.length+1} disabled={saving} onClick={later}>Decide later →</Btn></div>
      {error&&<p role="alert">{error}</p>}
      <KeyHints hints={[["lr","Preview"],["a","Choose & equip"],["b","Later"]]}/>
    </div>
  );
}
