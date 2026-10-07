import type { Profile } from '../../contracts';
import { pickOptions, riderLook, withItem } from '../../cosmetics/unlocks';
import { SLOT_NAMES } from '../../cosmetics/types';
import { LAST_LEVEL } from '../../cosmetics/catalog';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { RiderAvatar } from '../components/RiderAvatar';
import { pendingPicks, pickReward } from '../services';
import { useMenuNav } from '../useMenuNav';
import { play } from '../../audio/sfx';

/** Choose one of three rewards for the lowest pick level reached. The other two come back in later picks. */
export function RewardPick({ profile, onProfile, onDone }: { profile: Profile; onProfile: (p: Profile) => void; onDone: () => void }) {
  const level = pendingPicks(profile)[0];
  const opts = level ? pickOptions(profile, level) : [];
  const take = async (i: number) => {
    const it = opts[i]; if (!it) return;
    play('levelup');
    const next = await pickReward(profile, level, it.id);
    onProfile(next);
    if (!pendingPicks(next).length) onDone();
  };
  const [idx, setIdx] = useMenuNav(opts.length, opts.length || 1, (i) => void take(i), onDone, true, { initial: 1 });
  if (!level) return null;
  const base = riderLook(profile);
  return (
    <div class="screen pick">
      <div class="screen-head">
        <div><h1>Level {level} reward</h1><div class="sub">Pick one. {level < LAST_LEVEL ? 'The others come back in a later pick.' : 'More come back every 5 levels.'}</div></div>
        <span class="spacer" />
        <Btn onClick={onDone}>Later</Btn>
      </div>
      <div class="pick-row">
        {opts.map((it, i) => (
          <div class={`card pick-card${idx === i ? ' focused' : ''}`} onClick={() => { setIdx(i); void take(i); }}>
            <RiderAvatar look={withItem(base, it)} size="hero" />
            <div class="dim small">{SLOT_NAMES[it.slot]}</div>
            <h3>{it.name}</h3>
            {it.flavor && <div class="dim small">{it.flavor}</div>}
          </div>
        ))}
      </div>
      <KeyHints hints={[['lr', 'Choose'], ['a', 'Take it'], ['b', 'Later']]} />
    </div>
  );
}
