import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, Profile } from '../../contracts';
import { Avatar, Btn, Dot, XpBar } from '../components/Bits';
import { Key, KeyHints } from '../components/ui';
import { DOTS_H, carouselSizes, slotLeft, slotOf, wrapIndex } from '../carousel';
import { achievementViews, getDeviceStatus, levelView, lobbyHills, missingRequirement, setLobbyHills, subscribeDevices } from '../services';
import { toast } from '../components/Toasts';
import { play } from '../../audio/sfx';
import { timeAgo } from '../format';
import { useMenuNav } from '../useMenuNav';
import { getDriveIn, subscribeDriveIn, toggleDriveIn } from '../drivein/store';

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

/** Wrap-around carousel: the selected game is a large hero card, the rest are compact art + title cards either side. */
function GameCarousel({ games, profile, sel, focused, onSelect, onPlay }: { games: GameModule[]; profile: Profile; sel: number; focused: boolean; onSelect: (i: number) => void; onPlay: (g: GameModule) => void }) {
  const n = games.length;
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: globalThis.innerWidth || 1024, h: 420 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = carouselSizes(box.w, box.h);
  // a card wrapping from one end to the other jumps instead of sliding across the screen
  const prev = useRef<Record<string, number>>({});
  const slots = games.map((g, i) => slotOf(i, sel, n));
  const jumps = games.map((g, i) => prev.current[g.id] !== undefined && Math.abs(prev.current[g.id] - slots[i]) > 1);
  useEffect(() => { games.forEach((g, i) => { prev.current[g.id] = slots[i]; }); });
  // swipe to turn (touch); a swipe swallows the click that follows it
  const drag = useRef<{ x: number; swiped: boolean } | null>(null);
  const down = (e: PointerEvent) => { drag.current = { x: e.clientX, swiped: false }; };
  const up = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 50) { d.swiped = true; onSelect(wrapIndex(sel + (dx < 0 ? 1 : -1), n)); }
  };
  const click = (i: number) => {
    if (drag.current?.swiped) { drag.current = null; return; }
    drag.current = null;
    if (i === sel) onPlay(games[i]); else onSelect(i);
  };
  return (
    <div class="carousel" ref={ref} onPointerDown={down} onPointerUp={up}>
      {games.map((g, i) => {
        const d = slots[i], hero = d === 0, a = Math.abs(d);
        const why = hero ? missingRequirement(g) : null;
        let line: string | null = null;
        if (hero) try { line = g.progressLine?.(profile.gameData[g.id]) ?? null; } catch { /* bad save */ }
        return (
          <div key={g.id} class={`card game-card${hero ? ' hero' : ' side'}${hero && focused ? ' focused' : ''}${jumps[i] ? ' jump' : ''}`}
            style={{ '--accent': accentFor(g.id), width: `${hero ? s.heroW : s.sideW}px`, height: hero ? `${s.heroH}px` : undefined, transform: `translate(${slotLeft(d, s)}px, calc(-50% - ${DOTS_H / 2}px))`,
              opacity: String(a === 0 ? 1 : a === 1 ? 0.85 : a === 2 ? 0.45 : 0), pointerEvents: a > 2 ? 'none' : undefined, zIndex: String(10 - a) } as Record<string, string>}
            onClick={() => click(i)}>
            <CardArt game={g} color={profile.color} live={hero} />
            <h3>{g.title}</h3>
            {hero && (
              <div class="hero-details">
                <div class="tags">{g.tags.map((t) => <span class={`tag ${t}`}>{TAG_LABEL[t] ?? t}</span>)}</div>
                <p class="blurb">{g.blurb}</p>
                {why && <div class="progress-line needs">⚠ {why}</div>}
                {line && <div class="progress-line">{line}</div>}
                <div class="hero-foot"><span class="meta dim">{timeAgo(profile.lastPlayed[g.id])}</span><span class="spacer" /><span class="play-pill"><Key k="a" />Play</span></div>
              </div>
            )}
          </div>
        );
      })}
      <div class="carousel-dots" style={{ top: `calc(50% + ${(s.heroH - DOTS_H) / 2 + 10}px)` }}>{games.map((g, i) => <span class={i === sel ? 'on' : ''} onClick={(e) => { e.stopPropagation(); onSelect(i); }} />)}</div>
    </div>
  );
}

export function ArcadeMenu({ games, profile, onPlay: launch, onNav, onBack }: { games: GameModule[]; profile: Profile; onPlay: (g: GameModule) => void; onNav: (to: 'connect' | 'achievements') => void; onBack: () => void }) {
  const n = games.length;
  const onPlay = (g: GameModule) => { const why = missingRequirement(g); if (why) { toast(`⚠ ${why}`); play('deny'); } else launch(g); };
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((x) => x + 1)), []);
  const [hills, setHills] = useState(lobbyHills);
  const toggleHills = () => { const v = !lobbyHills(); setLobbyHills(v); setHills(v); };
  const [driveIn, setDriveIn] = useState(getDriveIn().on);
  useEffect(() => subscribeDriveIn(() => setDriveIn(getDriveIn().on)), []);
  const [sel, setSel] = useState(() => lastPlayedIndex(games, profile));
  const selRef = useRef(sel); selRef.current = sel;
  const bar = [toggleHills, () => onNav('connect'), () => onNav('achievements'), onBack, () => { toggleDriveIn(); }];
  const CAROUSEL = bar.length;
  // the carousel is a single nav stop; left/right on it turns it (wrapping)
  const [idx, setIdx] = useMenuNav(bar.length + 1, [bar.length, 1], (i) => (i < bar.length ? bar[i]() : onPlay(games[selRef.current])), onBack, true, {
    initial: CAROUSEL,
    onAdjust: (i, dir) => { if (i !== CAROUSEL || n < 2) return false; setSel(wrapIndex(selRef.current + dir, n)); return true; },
  });
  const pick = (i: number) => { if (i !== sel) play('uiMove'); setSel(i); setIdx(CAROUSEL); };
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
        <Btn small focused={idx === 4} onClick={bar[4]} class={`projector${driveIn ? ' on' : ''}`}>📽{driveIn ? ' Drive-In' : ''}</Btn>
      </div>
      <GameCarousel games={games} profile={profile} sel={sel} focused={idx === CAROUSEL} onSelect={pick} onPlay={(g) => { setIdx(CAROUSEL); onPlay(g); }} />
      <KeyHints hints={[['dpad', 'Browse'], ['a', 'Play'], ['b', 'Switch rider'], ['shift', 'Gears'], ...(driveIn ? [['y', 'Next channel'], ['z', 'Prev channel']] as [string, string][] : [])]} />
    </div>
  );
}
