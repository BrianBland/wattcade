import { UiListRow } from '../../ui';
import '../chrome/chrome.css';
import { ChromeHints } from '../chrome/ChromeHints';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { Btn } from '../components/Bits';
import { RiderAvatar } from '../components/RiderAvatar';
import { nextReward, titleOf } from '../../cosmetics/unlocks';
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
  const roster = useRef<HTMLDivElement>(null);
  const count = profiles.length + 1;
  const [idx, setIdx] = useMenuNav(count, 1, (i) => (i < profiles.length ? onPick(profiles[i]) : onNew()), undefined, true,
    { onAdjust: (i, d) => { setIdx((i + d + count) % count); return true; }, onY: (i) => { if (i < profiles.length) onEdit(profiles[i]); } });
  // profiles load async: focus the last rider once they arrive
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !profiles.length) return;
    placed.current = true;
    const i = profiles.findIndex((p) => p.id === lastId);
    if (i >= 0) setIdx(i);
  }, [profiles, lastId]);
  useLayoutEffect(() => { roster.current?.querySelector<HTMLElement>('.focused')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [idx]);
  const selected = profiles[idx];
  const selectedLevel = selected ? levelView(selected.xp) : null;
  return (
    <div class="screen chrome-ui riders-screen">
      <header class="screen-head chrome-head"><div><div class="chrome-eyebrow">WATTCADE / RIDERS</div><h1>Who's riding?</h1><div class="sub">Pick up where you left off.</div></div></header>
      <div class="rider-selector">
        <div class="rider-roster" ref={roster} role="group" aria-label="Choose rider">
          {profiles.map((p, i) => <UiListRow selected={idx===i} focused={idx===i} key={p.id} class={`rider-entry${idx === i ? ' focused selected' : ''}`} aria-pressed={idx === i} onFocus={() => setIdx(i)} onClick={() => setIdx(i)}>
            <RiderAvatar profile={p} size="thumb" still road={false} />
            <span><b>{p.name}</b><small>Level {levelView(p.xp).level} · {lastRide(p) ? `Last ride ${timeAgo(lastRide(p)).toLowerCase()}` : 'Ready for a first ride'}</small></span>
            <span class="roster-arrow" aria-hidden="true">→</span>
          </UiListRow>)}
          <button type="button" class={`rider-entry new${idx === profiles.length ? ' focused' : ''}`} onFocus={() => setIdx(profiles.length)} onClick={onNew}><span class="new-rider-icon" aria-hidden="true">+</span><span><b>New rider</b><small>Make this ride your own</small></span></button>
        </div>
        <section class="rider-showcase" aria-label="Selected rider">
          {selected && selectedLevel ? <>
            <div class="rider-portrait"><RiderAvatar profile={selected} size="hero" /></div>
            <div class="rider-details"><div class="chrome-eyebrow">LEVEL {selectedLevel.level}{titleOf(selected) ? ` / ${titleOf(selected)}` : ''}</div><h2>{selected.name}</h2>
              <div class="rider-readings"><span><b>{selected.ftp}</b> W FTP</span><span><b>{Math.round(selectedLevel.progress * 100)}%</b> to next level</span></div>
              <div class="bar"><i style={{ width: `${selectedLevel.progress * 100}%` }} /></div><NextUp p={selected} />
              <div class="row"><Btn primary onClick={() => onPick(selected)}>Ride as {selected.name} →</Btn><Btn onClick={() => onEdit(selected)}>Edit rider</Btn></div>
            </div>
          </> : <div class="new-rider-prompt"><span class="new-rider-icon" aria-hidden="true">+</span><h2>A new road awaits.</h2><p>Choose your name and make a rider.</p><Btn primary onClick={onNew}>Create rider →</Btn></div>}
        </section>
      </div>
      <ChromeHints hints={[['dpad', 'Choose'], ['a', 'Ride'], ['y', 'Edit']]} />
    </div>
  );
}
