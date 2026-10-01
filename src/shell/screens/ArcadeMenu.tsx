import type { GameModule, Profile } from '../../contracts';
import { Avatar, Btn, XpBar } from '../components/Bits';
import { levelView } from '../services';
import { useMenuNav } from '../useMenuNav';

export function ArcadeMenu({ games, profile, onPlay, onNav, onBack }: { games: GameModule[]; profile: Profile; onPlay: (g: GameModule) => void; onNav: (to: 'connect' | 'achievements') => void; onBack: () => void }) {
  const n = games.length;
  const [idx, setIdx] = useMenuNav(n + 3, 3, (i) => (i < n ? onPlay(games[i]) : i === n ? onNav('connect') : i === n + 1 ? onNav('achievements') : onBack()), onBack);
  return (
    <div class="screen">
      <div class="row"><Avatar color={profile.color} /><h1>{profile.name}</h1><span class="spacer" /></div>
      <XpBar lv={levelView(profile.xp)} />
      <div class="grid">
        {games.map((g, i) => (
          <div class={`card${idx === i ? ' focused' : ''}`} onClick={() => { setIdx(i); onPlay(g); }}>
            <h3>{g.title}</h3>
            <div>{g.tags.map((t) => <span class="tag">{t}</span>)}</div>
            <p class="dim">{g.blurb}</p>
          </div>
        ))}
      </div>
      <div class="row">
        <Btn focused={idx === n} onClick={() => onNav('connect')}>Devices</Btn>
        <Btn focused={idx === n + 1} onClick={() => onNav('achievements')}>Achievements</Btn>
        <Btn focused={idx === n + 2} onClick={onBack}>Switch rider</Btn>
      </div>
    </div>
  );
}
