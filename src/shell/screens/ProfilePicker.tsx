import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { Btn } from '../components/Bits';
import { RiderAvatar } from '../components/RiderAvatar';
import { nextReward, titleOf } from '../../cosmetics/unlocks';
import { KeyHints } from '../components/ui';
import { levelView } from '../services';
import { timeAgo } from '../format';
import { useMenuNav } from '../useMenuNav';

/** "Lv 12: Penny-farthing" under the XP bar. */
function NextUp({ p }: { p: Profile }) {
  const n = nextReward(p);
  return n ? <div class="dim small">Lv {n.level}: {n.pick ? 'pick a reward' : n.items.map((i) => i.name).join(', ')}</div> : null;
}

const lastRide = (p: Profile) => Math.max(0, ...Object.values(p.lastPlayed));

export function ProfilePicker({ profiles, lastId, onPick, onNew, onEdit }: { profiles: Profile[]; lastId: string | null; onPick: (p: Profile) => void; onNew: () => void; onEdit: (p: Profile) => void }) {
  const count = profiles.length + 1;
  const [idx, setIdx] = useMenuNav(count, count, (i) => (i < profiles.length ? onPick(profiles[i]) : onNew()), undefined, true,
    { onY: (i) => { if (i < profiles.length) onEdit(profiles[i]); } });
  // profiles load async: focus the last rider once they arrive
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !profiles.length) return;
    placed.current = true;
    const i = profiles.findIndex((p) => p.id === lastId);
    if (i >= 0) setIdx(i);
  }, [profiles, lastId]);
  return (
    <div class="screen">
      <div class="screen-head"><div><h1>wattcade</h1><div class="sub">Who's riding?</div></div></div>
      <div class="rider-row">
        {profiles.map((p, i) => {
          const lv = levelView(p.xp);
          return (
            <div class={`card rider-card${idx === i ? ' focused' : ''}`} onClick={() => { setIdx(i); onPick(p); }}>
              <RiderAvatar profile={p} size="big" still={idx !== i} />
              <h3>{p.name}</h3>
              {titleOf(p) && <div class="rider-title">{titleOf(p)}</div>}
              <div class="dim">Lv {lv.level} · FTP {p.ftp} W</div>
              <div class="bar"><i style={{ width: `${lv.progress * 100}%` }} /></div>
              <NextUp p={p} />
              <div class="dim small">{lastRide(p) ? `Last ride ${timeAgo(lastRide(p)).toLowerCase()}` : 'No rides yet'}</div>
              <Btn small onClick={() => onEdit(p)}>Edit</Btn>
            </div>
          );
        })}
        <div class={`card rider-card new${idx === profiles.length ? ' focused' : ''}`} onClick={() => { setIdx(profiles.length); onNew(); }}>
          <span class="plus">+</span><h3>New rider</h3><div class="dim">Create a profile</div>
        </div>
      </div>
      <KeyHints hints={[['lr', 'Choose'], ['a', 'Ride'], ['y', 'Edit']]} />
    </div>
  );
}
