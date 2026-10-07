import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameModule, Profile } from '../../contracts';
import { Avatar, Btn, Dot, XpBar } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { achievementViews, gameRides, getDeviceStatus, levelView, lobbyHills, missingRequirement, setLobbyHills, subscribeDevices } from '../services';
import { toast } from '../components/Toasts';
import { play } from '../../audio/sfx';
import { timeAgo } from '../format';
import { useMenuNav } from '../useMenuNav';
import { getDriveIn, subscribeDriveIn, toggleDriveIn } from '../drivein/store';
import { carouselDims, carouselSlots, orderGames, ridesLine, type GameRides } from '../arcade';

const TAG_LABEL: Record<string, string> = { zone2: 'Zone 2', sprint: 'Sprint', intervals: 'Intervals', erg: 'ERG' };
const ACCENTS: Record<string, string> = { cadenza: '#ff2bd6', hamster: '#ffb020', watershed: '#2de2a6', dungeon: '#b26bff', lighthouse: '#ffd23b', towerdefense: '#00f0ff', starfighter: '#5b8cff' };
const accentFor = (id: string) => ACCENTS[id] ?? '#00f0ff';
/** Clips recorded from the real renderers by `npm run capture:cards` (public/cards/<id>.mp4 + .webp poster). */
const clip = (id: string, ext: 'mp4' | 'webp') => `${import.meta.env.BASE_URL}cards/${id}.${ext}`;

/** Fallback banner when a game has no recorded clip: its drawCard art (animated only while focused). */
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
  return <canvas class="card-media" ref={ref} />;
}

/** The game's recorded clip: looping video on the focused card, still poster elsewhere. */
function CardMedia({ game, color, live }: { game: GameModule; color: string; live: boolean }) {
  const [missing, setMissing] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = vid.current; if (!v) return; v.muted = true; v.play?.()?.catch?.(() => { /* poster stays */ }); }, [live]); // iOS: muted inline autoplay
  if (missing) return <CardArt game={game} color={color} live={live} />;
  return live
    ? <video class="card-media" ref={vid} src={clip(game.id, 'mp4')} poster={clip(game.id, 'webp')} autoplay muted loop playsInline disablePictureInPicture onError={() => setMissing(true)} />
    : <img class="card-media" src={clip(game.id, 'webp')} alt="" draggable={false} onError={() => setMissing(true)} />;
}

function ActiveInfo({ game, profile, rides }: { game: GameModule; profile: Profile; rides?: GameRides }) {
  const why = missingRequirement(game);
  let progress: string | null = null;
  try { progress = game.progressLine?.(profile.gameData[game.id]) ?? null; } catch { /* bad save */ }
  const ridden = ridesLine(rides);
  return (
    <div class="gc-info" key={game.id}>
      <h3>{game.title}</h3>
      <div class="tags">{game.tags.map((t) => <span class={`tag ${t}`}>{TAG_LABEL[t] ?? t}</span>)}</div>
      <p class="blurb">{game.blurb}</p>
      <div class="gc-stats">
        {why && <span class="needs">⚠ {why}</span>}
        {progress && <b>{progress}</b>}
        {ridden && <span>{ridden}</span>}
        <span class="dim">{timeAgo(profile.lastPlayed[game.id])}</span>
      </div>
    </div>
  );
}

/** One looping row of games rolling past a centred, enlarged selection. Swipe or tap a side card to roll; tap the centre to play. */
function Carousel({ games, sel, focused, profile, rides, onSel, onPlay }: {
  games: GameModule[]; sel: number; focused: boolean; profile: Profile; rides: Record<string, GameRides>;
  onSel: (i: number) => void; onPlay: (g: GameModule) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const dims = carouselDims(W || 1000), slots = carouselSlots(games.length, sel, dims);
  const narrow = dims.activeW < 440; // portrait iPad: media above the info
  const swipeX = useRef<number | null>(null), swiped = useRef(false);
  // A card wrapping from one end of the loop to the other jumps there (off-screen) instead of sliding across the row.
  const lastK = useRef<Record<string, number>>({});
  const jumped = (id: string, k: number) => { const was = lastK.current[id]; lastK.current[id] = k; return was !== undefined && Math.abs(k - was) > games.length / 2; };
  return (
    <div class={`carousel${narrow ? ' narrow' : ''}`} ref={box}
      onPointerDown={(e) => { swipeX.current = e.clientX; swiped.current = false; }}
      onPointerUp={(e) => {
        const x0 = swipeX.current; swipeX.current = null;
        if (x0 == null || Math.abs(e.clientX - x0) < 40) return;
        swiped.current = true; // the click that follows is part of the swipe
        play('uiMove'); onSel((sel + (e.clientX < x0 ? 1 : -1) + games.length) % games.length);
      }}>
      {games.map((g, i) => {
        const s = slots[i], active = i === sel;
        return (
          <div class={`card gc${active ? ' active' : ''}${active && focused ? ' focused' : ''}`} key={g.id}
            style={{ transform: `translateX(${s.x}px)`, width: `${s.w}px`, opacity: s.opacity, zIndex: s.z, '--accent': accentFor(g.id), ...(jumped(g.id, s.k) ? { transition: 'none' } : {}) } as Record<string, string | number>}
            onClick={() => { if (swiped.current) return; if (active) onPlay(g); else { play('uiMove'); onSel(i); } }}>
            <div class="gc-media"><CardMedia game={g} color={profile.color} live={active} />{!active && missingRequirement(g) && <span class="gc-warn">⚠</span>}</div>
            {active ? <ActiveInfo game={g} profile={profile} rides={rides[g.id]} /> : <div class="gc-title">{g.title}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function ArcadeMenu({ games, profile, onPlay: launch, onNav, onBack }: { games: GameModule[]; profile: Profile; onPlay: (g: GameModule) => void; onNav: (to: 'connect' | 'achievements') => void; onBack: () => void }) {
  const list = useMemo(() => orderGames(games, profile), [games, profile.lastPlayed]);
  const n = list.length;
  const onPlay = (g: GameModule) => { const why = missingRequirement(g); if (why) { toast(`⚠ ${why}`); play('deny'); } else launch(g); };
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((x) => x + 1)), []);
  const [rides, setRides] = useState<Record<string, GameRides>>({});
  useEffect(() => { let live = true; void gameRides(profile.id).then((r) => { if (live) setRides(r); }); return () => { live = false; }; }, [profile.id]);
  const [hills, setHills] = useState(lobbyHills);
  const toggleHills = () => { const v = !lobbyHills(); setLobbyHills(v); setHills(v); };
  const [driveIn, setDriveIn] = useState(getDriveIn().on);
  useEffect(() => subscribeDriveIn(() => setDriveIn(getDriveIn().on)), []);
  const [sel, setSel] = useState(0); // most recently played
  const selRef = useRef(sel); selRef.current = sel;
  // Top bar, then one more row: the carousel (left/right roll it) or, while the Drive-In is on, its toggle alone.
  const bar = [toggleHills, () => onNav('connect'), () => onNav('achievements'), onBack, ...(driveIn ? [] : [toggleDriveIn])];
  const B = bar.length;
  const [idx, setIdx] = useMenuNav(B + 1, [B, 1], (i) => (i < B ? bar[i]() : driveIn ? toggleDriveIn() : onPlay(list[selRef.current])), onBack, true, {
    initial: B,
    onAdjust: (i, dir) => {
      if (i !== B || driveIn) return false;
      setSel((s) => (s + dir + n) % n); // the row loops
      return true;
    },
  });
  useEffect(() => { setIdx(B); }, [driveIn]); // focus the row that replaced the other
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
        {!driveIn && <Btn small focused={idx === 4} onClick={toggleDriveIn} class="projector">📽</Btn>}
      </div>
      {driveIn
        ? <div class="di-toggle-row"><Btn focused={idx === B} onClick={toggleDriveIn} class="projector on">📽 Drive-In · show games</Btn></div>
        : <Carousel games={list} sel={sel} focused={idx === B} profile={profile} rides={rides}
            onSel={(i) => { setSel(i); setIdx(B); }} onPlay={onPlay} />}
      <KeyHints hints={[['dpad', 'Move'], ['a', driveIn ? 'Show games' : 'Play'], ['b', 'Switch rider'], ['shift', 'Gears'], ...(driveIn ? [['y', 'Next channel'], ['z', 'Prev channel']] as [string, string][] : [])]} />
    </div>
  );
}
