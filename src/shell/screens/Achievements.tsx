import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import type { AchievementView } from '../types';
import { Btn, Stat } from '../components/Bits';
import { CountUp, KeyHints } from '../components/ui';
import { formatDuration } from '../format';
import { achievementViews } from '../services';
import { onMenuPress } from '../menuInput';
import { useMenuNav } from '../useMenuNav';
import { closestGoals, groupAchievements } from '../achievementGroups';

function Badge({ a, i }: { a: AchievementView; i: number }) {
  const hidden = a.secret && !a.unlocked;
  return (
    <div class={`badge${a.unlocked ? ' on' : ''}${hidden ? ' secret' : ''}`} style={{ animationDelay: `${Math.min(i, 24) * 30}ms` }}>
      <span class="medal">{a.unlocked ? '★' : hidden ? '?' : '☆'}</span>
      <div><b>{hidden ? '???' : a.name}</b><div class="dim small">{hidden ? 'Secret achievement' : a.desc}</div>
        {a.progress && !hidden && <div class="badge-prog"><div class="bar"><i style={{ width: `${a.progress.frac * 100}%` }} /></div><small class="dim">{a.progress.label}</small></div>}
      </div>
    </div>
  );
}

export function Achievements({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  useMenuNav(1, 1, onBack, onBack);
  const scroller = useRef<HTMLDivElement>(null);
  // The list is long: the D-pad scrolls it.
  useEffect(() => onMenuPress((p) => {
    const el = scroller.current; if (!el) return;
    const step = el.clientHeight * 0.6;
    if (p.has('down')) el.scrollBy({ top: step, behavior: 'smooth' });
    if (p.has('up')) el.scrollBy({ top: -step, behavior: 'smooth' });
  }), []);
  const l = profile.lifetime;
  const list = achievementViews(profile);
  const done = list.filter((a) => a.unlocked).length;
  const next = closestGoals(list, 3);
  return (
    <div class="screen" ref={scroller}>
      <div class="screen-head">
        <div><h1>Achievements</h1><div class="sub">{done} of {list.length} unlocked</div></div>
        <span class="spacer" />
        <Btn focused onClick={onBack}>Back</Btn>
      </div>
      <div class="panel stats">
        <Stat label="Lifetime energy" value={<><CountUp to={l.kj} /> kJ</>} />
        <Stat label="Ride time" value={<CountUp to={l.seconds} format={formatDuration} />} delayMs={60} />
        <Stat label="Sessions" value={<CountUp to={l.sessions} />} delayMs={120} />
        <Stat label="Sprints" value={<CountUp to={l.sprints} />} delayMs={180} />
      </div>
      {next.length > 0 && <>
        <h2>Closest goals</h2>
        <div class="badge-grid">{next.map((a, i) => <Badge a={a} i={i} />)}</div>
      </>}
      {groupAchievements(list).map((g) => <>
        <h2 class="gap-top">{g.title} <small class="dim">{g.done}/{g.items.length}</small></h2>
        <div class="badge-grid">{g.items.map((a, i) => <Badge a={a} i={i} />)}</div>
      </>)}
      <KeyHints hints={[['ud', 'Scroll'], ['b', 'Back']]} />
    </div>
  );
}
