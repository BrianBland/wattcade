import type { Profile } from '../../contracts';
import { Avatar, Btn } from '../components/Bits';
import { useMenuNav } from '../useMenuNav';

export function ProfilePicker({ profiles, onPick, onNew, onEdit }: { profiles: Profile[]; onPick: (p: Profile) => void; onNew: () => void; onEdit: (p: Profile) => void }) {
  const count = profiles.length + 1;
  const [idx, setIdx] = useMenuNav(count, 3, (i) => (i < profiles.length ? onPick(profiles[i]) : onNew()));
  return (
    <div class="screen">
      <h1>wattcade</h1>
      <h2>Who's riding?</h2>
      <div class="grid">
        {profiles.map((p, i) => (
          <div class={`card${idx === i ? ' focused' : ''}`} onClick={() => { setIdx(i); onPick(p); }}>
            <div class="row"><Avatar color={p.color} /><div><h3>{p.name}</h3><span class="dim">Lv {p.level} · FTP {p.ftp} W</span></div></div>
            <div style={{ marginTop: '12px' }}><Btn small onClick={() => onEdit(p)}>Edit</Btn></div>
          </div>
        ))}
        <div class={`card${idx === profiles.length ? ' focused' : ''}`} onClick={onNew}><h3>+ New</h3><span class="dim">Create a rider profile</span></div>
      </div>
    </div>
  );
}
