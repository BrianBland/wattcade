import type { Profile } from '../../contracts';
import { Btn, Stat } from '../components/Bits';
import { CountUp, KeyHints } from '../components/ui';
import { formatDuration } from '../format';
import { achievementViews } from '../services';
import { achievementProgress } from '../achievementProgress';
import { useMenuNav } from '../useMenuNav';

export function Achievements({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  useMenuNav(1, 1, onBack, onBack);
  const l = profile.lifetime;
  const list = achievementViews(profile);
  const done = list.filter((a) => a.unlocked).length;
  return (
    <div class="screen">
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
      <div class="badge-grid">
        {list.map((a, i) => {
          const pr = a.unlocked ? null : achievementProgress(a.id, profile);
          return (
            <div class={`badge${a.unlocked ? ' on' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
              <span class="medal">{a.unlocked ? '★' : '☆'}</span>
              <div><b>{a.name}</b><div class="dim small">{a.desc}</div>
                {pr && <div class="badge-prog"><div class="bar"><i style={{ width: `${pr.frac * 100}%` }} /></div><small class="dim">{pr.label}</small></div>}
              </div>
            </div>
          );
        })}
      </div>
      <KeyHints hints={[['b', 'Back']]} />
    </div>
  );
}
