import type { Profile } from '../../contracts';
import { Btn, Stat } from '../components/Bits';
import { formatDuration } from '../format';
import { achievementViews } from '../services';
import { useMenuNav } from '../useMenuNav';

export function Achievements({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  useMenuNav(1, 1, onBack, onBack);
  const l = profile.lifetime;
  return (
    <div class="screen">
      <h1>Achievements</h1>
      <div class="stats">
        <Stat label="Lifetime kJ" value={String(Math.round(l.kj))} /><Stat label="Ride time" value={formatDuration(l.seconds)} />
        <Stat label="Sessions" value={String(l.sessions)} /><Stat label="Sprints" value={String(l.sprints)} />
      </div>
      {achievementViews(profile).map((a) => (
        <div class="card" style={{ minHeight: 0, opacity: a.unlocked ? 1 : 0.45, cursor: 'default' }}>
          <b>{a.unlocked ? '★ ' : '☆ '}{a.name}</b> <span class="dim">{a.desc}</span>
        </div>
      ))}
      <div><Btn focused onClick={onBack}>Back</Btn></div>
    </div>
  );
}
