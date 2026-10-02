import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { Avatar, Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { levelView } from '../services';
import { timeAgo } from '../format';
import { useMenuNav } from '../useMenuNav';

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
              <Avatar color={p.color} big />
              <h3>{p.name}</h3>
              <div class="dim">Lv {lv.level} · FTP {p.ftp} W</div>
              <div class="bar"><i style={{ width: `${lv.progress * 100}%` }} /></div>
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
