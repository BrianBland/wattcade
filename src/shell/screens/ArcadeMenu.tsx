import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, Profile } from '../../contracts';
import { Avatar, Btn, Dot, XpBar } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { achievementViews, getDeviceStatus, levelView, lobbyHills, missingRequirement, setLobbyHills, subscribeDevices } from '../services';
import { toast } from '../components/Toasts';
import { play } from '../../audio/sfx';
import { timeAgo } from '../format';
import { useMenuNav } from '../useMenuNav';

const TAG_LABEL: Record<string, string> = { zone2: 'Zone 2', sprint: 'Sprint', intervals: 'Intervals', erg: 'ERG' };
const ACCENTS = ['#00f0ff', '#ff2bd6', '#b6ff3b', '#ffb020', '#7a5cff', '#2de2a6'];
const accentFor = (id: string) => ACCENTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length];

/** The game's banner art; animates only while its card is focused (still frame otherwise). */
function CardArt({ game, color, live }: { game: GameModule; color: string; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, draw = game.drawCard;
    if (!c || !draw) return;
    const g = c.getContext('2d'); if (!g) return;
    let raf = 0;
    const size = () => { const dpr = Math.min(2, globalThis.devicePixelRatio || 1); c.width = Math.max(1, Math.round(c.clientWidth * dpr)); c.height = Math.max(1, Math.round(c.clientHeight * dpr)); };
    const t0 = performance.now();
    const frame = (now: number) => {
      try { g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height, 2 + (live ? (now - t0) / 1000 : 0), color); } catch { /* art must never break the menu */ }
      if (live) raf = requestAnimationFrame(frame);
    };
    size(); frame(performance.now());
    const ro = new ResizeObserver(() => { size(); if (!live) frame(performance.now()); });
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [game, color, live]);
  return game.drawCard ? <canvas class="card-art" ref={ref} /> : null;
}

/** Index of the most recently played game (focused first), else 0. */
export function lastPlayedIndex(games: readonly GameModule[], p: Profile): number {
  let best = 0, t = -1;
  games.forEach((g, i) => { const v = p.lastPlayed[g.id] ?? -1; if (v > t) { t = v; best = i; } });
  return best;
}

export function ArcadeMenu({ games, profile, onPlay: launch, onNav, onBack }: { games: GameModule[]; profile: Profile; onPlay: (g: GameModule) => void; onNav: (to: 'connect' | 'achievements') => void; onBack: () => void }) {
  const n = games.length;
  const onPlay = (g: GameModule) => { const why = missingRequirement(g); if (why) { toast(`⚠ ${why}`); play('deny'); } else launch(g); };
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((x) => x + 1)), []);
  const [hills, setHills] = useState(lobbyHills);
  const toggleHills = () => { const v = !lobbyHills(); setLobbyHills(v); setHills(v); };
  const bar = [toggleHills, () => onNav('connect'), () => onNav('achievements'), onBack];
  const [idx, setIdx] = useMenuNav(bar.length + n, [bar.length, n], (i) => (i < bar.length ? bar[i]() : onPlay(games[i - bar.length])), onBack, true,
    { initial: bar.length + lastPlayedIndex(games, profile) });
  const st = getDeviceStatus();
  const ach = achievementViews(profile);
  return (
    <div class="screen menu">
      <div class="panel topbar">
        <Avatar color={profile.color} />
        <div class="who"><b>{profile.name}</b><XpBar lv={levelView(profile.xp)} compact /></div>
        <span class="spacer" />
        <Btn small focused={idx === 0} onClick={toggleHills}>{hills ? '⛰ Road: Hills' : '▬ Road: Flat'}</Btn>
        <Btn small focused={idx === 1} onClick={bar[1]}><Dot on={st.trainer.connected} busy={st.trainer.busy} /><Dot on={st.controller.connected} busy={st.controller.busy} /><Dot on={st.hr.connected} busy={st.hr.busy} />Devices</Btn>
        <Btn small focused={idx === 2} onClick={bar[2]}>★ {ach.filter((a) => a.unlocked).length}/{ach.length}</Btn>
        <Btn small focused={idx === 3} onClick={onBack}>Switch rider</Btn>
      </div>
      <div class="game-row">
        {games.map((g, i) => (
          <div class={`card game-card${idx === bar.length + i ? ' focused' : ''}`} style={{ '--accent': accentFor(g.id) } as Record<string, string>}
            onClick={() => { setIdx(bar.length + i); onPlay(g); }}>
            <CardArt game={g} color={profile.color} live={idx === bar.length + i} />
            <h3>{g.title}</h3>
            <div class="tags">{g.tags.map((t) => <span class={`tag ${t}`}>{TAG_LABEL[t] ?? t}</span>)}</div>
            <p class="blurb">{g.blurb}</p>
            {(() => { const why = missingRequirement(g); return why && <div class="progress-line needs">⚠ {why}</div>; })()}
            {(() => { let line: string | null = null; try { line = g.progressLine?.(profile.gameData[g.id]) ?? null; } catch { /* bad save */ } return line && <div class="progress-line">{line}</div>; })()}
            <div class="meta dim">{timeAgo(profile.lastPlayed[g.id])}</div>
          </div>
        ))}
      </div>
      <KeyHints hints={[['dpad', 'Move'], ['a', 'Play'], ['b', 'Switch rider'], ['shift', 'Gears']]} />
    </div>
  );
}
