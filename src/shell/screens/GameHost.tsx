import { UiMessage } from '../../ui';
import { Btn } from '../components/Bits';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, GameRenderer, Insets, MusicFx, Profile } from '../../contracts';
import type { MediaRun, SessionLike } from '../types';
import { ProgramSync } from '../../media/clock';
import { canPause, openingPhase, startTarget } from '../countGate';
import { debugActions, getFake, activeSession, input, mediaEngine, onSystem, previewAward, startSession } from '../services';
import { attachFakeKeys } from '../fakeKeysDom';
import { HudLayer, PauseHistory } from '../hud/HudLayer';
import { HUD_LAYOUT_EVENT, readHudInsets } from '../hud/insets';
import { loadHudLayout, saveHudLayout } from '../hud/layout';
import { PauseMenu } from './PauseMenu';
import { GameIntro, IntroHelp } from '../game/GameIntro';
import { ResultBanner } from '../game/ResultBanner';
import { endingStep, MAX_RECAP_S } from '../game/ending';
import { achievementToast, toast } from '../components/Toasts';
import { duckAmbient, play, unlockAudio } from '../../audio/sfx';

/** The result banner stays this long before the summary (A skips). */
export const RESULT_S = 4;
/** Ride milestone toast every this many pedalling seconds. */
export const MILESTONE_S = 600;
const COUNT_STEP_S = 0.9;

type Phase = 'intro' | 'menu' | 'count' | 'play' | 'ending';
const isFake = () => getFake() || !!(activeSession() as any)?.fakeBike;

/**
 * Runs a game: intro card (controls, target zone) -> 3-2-1-GO with the trainer held neutral, then resistance ramps in ->
 * play (pause menu, mid-ride toasts) -> a short result banner -> onQuit (summary).
 */
export function GameHost({ game, profile, media, onQuit, onAbandon, onRestart, onSave }: {
  game: GameModule; profile: Profile; media?: MediaRun; onQuit: () => void; onAbandon: () => void; onRestart: () => void; onSave: (d: unknown) => void;
}) {
  // music games: one player for the queue; the sim is locked to it during play (ProgramSync), the session idles while it buffers
  const music = useRef<{ engine: ReturnType<typeof mediaEngine>; sync: ProgramSync } | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null); // sized by --hud-h: the band the HUD covers
  const introScroll = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [history, setHistory] = useState(false);
  const [pauseFocus, setPauseFocus] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);
  const [musicWait, setMusicWait] = useState('');
  const musicWaitRef = useRef('');
  const [phase, setPhaseState] = useState<Phase>('intro');
  const [count, setCount] = useState<number | null>(null);
  const [ending, setEnding] = useState<{ over: boolean; durationS: number; summary: Record<string, number | string>; xp: number | null } | null>(null);
  const phaseRef = useRef<Phase>('intro');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const pausedRef = useRef(false);
  const sessionRef = useRef<SessionLike | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  const [layout, setLayout] = useState(loadHudLayout);
  const timers = useRef({ count: 0, ending: 0, hold: 0, playS: 0, shown: 3 });
  const rendererRef = useRef<GameRenderer | null>(null);
  const [recap, setRecap] = useState(false);
  const left = useRef(false); // leaving (quit/abandon) happens once
  const leave = (fn: () => void) => { if (left.current) return; left.current = true; fn(); };
  const cb = useRef({ onQuit, onAbandon }); cb.current = { onQuit, onAbandon };

  const setPause = (p: boolean) => {
    if (loadingRef.current) return;
    if (!canPause(phaseRef.current)) return;
    pausedRef.current = p; setPaused(p); if (!p) { setHelp(false); setHistory(false); setPauseFocus(0); }
    const s = sessionRef.current; if (!s) return;
    if (phaseRef.current === 'menu') { if (p) s.pause(); else s.resume(); return; } // trainer stays neutral; no music yet
    if (p) { s.sim.receive?.({ type: 'inputCancel' }); s.pause(); debugActions.panic(true); music.current?.engine.pause(); } else { debugActions.panic(false); s.resume(); music.current?.engine.resume(); }
  };
  /** The only way into the countdown: a game still showing its own pre-game menu (variant / loadout) is run through it first. */
  const startCount = () => {
    if (loadingRef.current) return;
    const to = startTarget(phaseRef.current, !!sessionRef.current?.sim.inMenu?.());
    if (to === 'menu') setPhase('menu');
    else if (to === 'count') { timers.current.count = 0; timers.current.shown = 3; setPhase('count'); setCount(3); play('count'); }
  };
  const toEnding = (over: boolean) => {
    if (phaseRef.current === 'ending') return;
    const s = sessionRef.current as (SessionLike & { sim: { summary?(): Record<string, number | string> } }) | null;
    pausedRef.current = false; setPaused(false); setHelp(false); setHistory(false);
    debugActions.panic(true);
    if (music.current) { music.current.engine.setVolume(0); setTimeout(() => music.current?.engine.stop(), 1500); }
    let summary: Record<string, number | string> = {};
    try { summary = s?.sim.summary?.() ?? {}; } catch { /* best effort */ }
    const pv = previewAward(profile);
    setEnding({ over, durationS: timers.current.playS, summary, xp: pv?.xp ?? null });
    let hold = 0;
    try { hold = Math.min(MAX_RECAP_S, Math.max(0, Number(rendererRef.current?.ending?.({ over }) ?? 0) || 0)); } catch { /* best effort */ }
    timers.current.ending = 0; timers.current.hold = hold; setRecap(hold > 0); setPhase('ending');
    if (hold === 0) play(over ? 'gameOver' : 'reward');
  };

  useEffect(() => {
    loadingRef.current = true; setLoading(true); setError('');
    let raf = 0, disposed = false, ro: ResizeObserver | null = null, renderer: GameRenderer | null = null, lock: { release(): Promise<void> } | null = null;
    const readInsets = (): Insets => readHudInsets(mount.current, probe.current);
    const hudLayout = () => { if (!disposed) renderer?.setInsets?.(readInsets()); };
    window.addEventListener(HUD_LAYOUT_EVENT, hudLayout);
    const detachKeys = input.attachKeyboard(window);
    const detachPad = input.attachGamepad();
    const detachTouch = mount.current ? input.attachTouch(mount.current) : () => {};
    const detachFakeKeys = attachFakeKeys();
    unlockAudio(); // GameHost mounts from a menu press, which counts as a user gesture
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    const offSys = onSystem((a) => { if (a === 'pause') setPause(!pausedRef.current); else if (a === 'panic') debugActions.panic(true); });
    (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l; }).catch(() => {});
    const seen = { ach: new Set<string>(), level: profile.level, milestone: 0, nextCheck: 10 };
    const celebrate = () => {
      const pv = previewAward(profile); if (!pv) return;
      for (const a of pv.achievements) if (!seen.ach.has(a.id)) { seen.ach.add(a.id); achievementToast(a.name, a.description, a.bonusXp); play('unique'); }
      if (pv.level > seen.level) { seen.level = pv.level; toast(`LEVEL UP! You're level ${pv.level}`, 'good'); play('levelup'); }
      const m = Math.floor(pv.activeS / MILESTONE_S);
      if (m > seen.milestone) { seen.milestone = m; toast(`⏱ ${(m * MILESTONE_S) / 60} min ridden · ${Math.round(pv.kj)} kJ`); play('milestone'); }
    };
    (async () => {
      try {
        const session = startSession(game, profile, onSave, media ? { timeline: media.timeline, ...(media.rolling?.announce ? { announce: (id: string, t: number) => media.rolling?.announce?.(id, t) } : {}) } : undefined);
        sessionRef.current = session; setSession(session);
        if (openingPhase(!!session.sim.inMenu?.()) === 'menu') setPhase('menu'); // the game's own menu replaces the intro card
        if (media && session.media) {
          const engine = mediaEngine(); engine.load(media.plan, media.rolling); engine.setVolume(1); engine.preload();
          music.current = { engine, sync: new ProgramSync() };
          duckAmbient('music', true); // the game's own ambience would fight the music
        }
        debugActions.panic(true); // trainer neutral through the intro and countdown
        renderer = await game.loadRenderer(); rendererRef.current = renderer;
        if (disposed) { renderer.unmount(); return; }
        const musicFx = music.current ? (fx: MusicFx) => music.current?.engine.setFx(fx) : undefined;
        renderer.mount(mount.current!, { profile, send: (a) => session.sim.receive?.(a), insets: readInsets(), musicFx, hudControls: true });
        renderer.setInsets?.(readInsets());
        const el = mount.current!;
        ro = new ResizeObserver(() => { if (!disposed) { renderer?.resize?.(el.clientWidth, el.clientHeight); renderer?.setInsets?.(readInsets()); } });
        ro.observe(el);
        if (probe.current) ro.observe(probe.current);
        await renderer.ready?.();
        if (disposed) return;
        session.idle(0); // discard presses made while loading before exposing game controls
        renderer.render(session.sim.snapshot(), session.ctx.bike(), input.state());
        loadingRef.current = false; setLoading(false);
        let last = performance.now();
        const T = timers.current;
        const loop = (now: number) => {
          if (disposed) return;
          const dt = Math.min(0.25, (now - last) / 1000); last = now;
          const ph = phaseRef.current;
          const audioEngine = music.current?.engine;
          const waiting = ph === 'play' && !pausedRef.current && audioEngine && ['starting', 'buffering'].includes(audioEngine.getState());
          const wait = waiting ? audioEngine.lastError ? `Music is waiting · ${audioEngine.lastError}` : 'Buffering music…' : '';
          if (wait !== musicWaitRef.current) { musicWaitRef.current = wait; setMusicWait(wait); }
          if (ph === 'intro') {
            const p = session.idle(dt);
            if (p.has('down')) introScroll.current?.scrollBy({ top: 140, behavior: 'smooth' });
            if (p.has('up')) introScroll.current?.scrollBy({ top: -140, behavior: 'smooth' });
            if (p.has('a')) startCount();
            else if (p.has('b')) { disposed = true; leave(cb.current.onAbandon); return; }
          } else if (ph === 'menu') { // the game's own pre-game menu: run the sim (trainer stays neutral), count down once it's dismissed
            if (!pausedRef.current) {
              session.frame(dt);
              if (session.sim.isOver()) toEnding(true);
              else if (!session.sim.inMenu?.()) { session.idle(0); setPhase('intro'); }
            }
          } else if (ph === 'count') {
            session.idle(dt);
            T.count += dt;
            const step = Math.floor(T.count / COUNT_STEP_S); // 0,1,2 -> 3,2,1 ; 3 -> GO
            const shown = Math.max(0, 3 - step);
            if (shown !== T.shown) { T.shown = shown; setCount(shown); play(shown === 0 ? 'go' : 'count'); }
            if (step >= 3) { // GO: release the trainer and ease the game's resistance in (and start the music)
              debugActions.panic(false); session.mixer?.rampIn();
              void music.current?.engine.start(0).catch((e) => toast(`Music: ${e instanceof Error ? e.message : e}`));
              setPhase('play');
              toast('Tap Menu for ride options');
              setTimeout(() => setCount(null), 700);
            }
          } else if (ph === 'play') {
            if (!pausedRef.current) {
              const m = music.current;
              if (m && session.media && m.engine.getState() === 'ended') {
                // the music has finished: the heard position stops short of the end by the output latency, so let the sim run out on its own clock
                session.media.setTrim(null); session.frame(dt);
              } else if (m && session.media) {
                const trim = m.sync.update(m.engine.positionS(), session.media.positionS(), m.engine.playing());
                session.media.setTrim(trim);
                if (trim > 0) session.frame(dt); else session.idle(dt); // hold the sim (not the bike) while the music buffers
                if ((T.playS % 0.5) < dt) { for (const [k, v] of Object.entries(m.engine.debug())) session.ctx.debug?.(`music.${k}`, v); session.ctx.debug?.('music.err', +m.sync.errS.toFixed(3)); }
              } else session.frame(dt);
              T.playS += dt;
              if ((T.playS >= seen.nextCheck)) { seen.nextCheck = T.playS + 10; celebrate(); }
              if (session.sim.isOver()) toEnding(true);
            }
          } else {
            const p = session.idle(dt);
            T.ending += dt;
            const wasRecap = T.ending - dt < T.hold;
            const e = endingStep(T.ending, T.hold, p.has('a'), RESULT_S);
            T.hold = e.holdS;
            if (wasRecap && e.show === 'banner') { setRecap(false); play('reward'); }
            if (e.leave) { disposed = true; leave(cb.current.onQuit); return; }
          }
          renderer!.render(session.sim.snapshot(), session.ctx.bike(), input.state());
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) { if (!disposed) { setLoading(false); setError(e instanceof Error ? e.message : String(e)); } }
    })();
    return () => {
      disposed = true; window.removeEventListener(HUD_LAYOUT_EVENT, hudLayout); detachFakeKeys(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); cancelAnimationFrame(raf); ro?.disconnect(); offSys(); detachKeys(); detachPad(); detachTouch();
      renderer?.unmount(); rendererRef.current = null; void lock?.release();
      music.current?.engine.setFx({ degrade: 0 }); music.current?.engine.stop(); music.current = null; duckAmbient('music', false);
    };
  }, [game]);

  const hud = session?.sim.hud?.() ?? {};
  return (
    <div class="game-host">
      <div class="mount" ref={mount} />
      <div class="hud-probe" ref={probe} />
      {loading && !error && <div class="game-loading chrome-ui"><UiMessage title={`Preparing ${game.title}`} busy action={<Btn onClick={()=>leave(onAbandon)}>Back</Btn>}>Your ride starts when the scene is ready.</UiMessage></div>}
      {musicWait && <div class="game-message chrome-ui"><UiMessage title="Preparing music" busy>{musicWait}</UiMessage></div>}
      {error && <div class="game-loading chrome-ui"><UiMessage title="Could not start the ride" tone="error" action={<Btn onClick={()=>leave(onAbandon)}>Back</Btn>}>{error}</UiMessage></div>}
      {session && <HudLayer session={session} profile={profile} paused={paused || loading || phase === 'intro' || phase === 'count' || phase === 'ending'} layout={layout} fake={isFake()}
        onControls={() => { if (canPause(phaseRef.current)) { setPause(true); setHelp(true); } }} />}
      {session && !loading && !error && (phase === 'intro' || count != null) && (
        <GameIntro game={game} hud={hud} profile={profile} fake={isFake()} scrollRef={introScroll} mode="pre" count={phase === 'intro' ? null : count}
          onStart={startCount} onBack={() => leave(onAbandon)} />
      )}
      {paused && help && session && <IntroHelp game={game} hud={hud} profile={profile} fake={isFake()} onClose={() => setHelp(false)} />}
      {paused && history && <PauseHistory ftp={profile.ftp} onClose={() => setHistory(false)} />}
      {paused && !help && !history && (
        <PauseMenu fake={isFake()} onHistory={() => { setPauseFocus(5); setHistory(true); }} layout={layout} onLayout={(v) => { setLayout(v); saveHudLayout(v); }}
          onResume={() => setPause(false)} onHelp={() => { setPauseFocus(4); setHelp(true); }} initial={pauseFocus} onRestart={onRestart}
          extensions={session?.sim.menuActions?.() ?? []} onExtension={(action) => { session?.sim.receive?.(action); setPause(false); }}
          {...(phase === 'menu' || session?.sim.inMenu?.() ? { quitLabel: 'Exit game', onQuit: () => leave(onAbandon) }
            : { onQuit: () => toEnding(false) })} />
      )}
      {phase === 'ending' && ending && !recap && <ResultBanner {...ending} profile={profile} onContinue={() => leave(onQuit)} />}
    </div>
  );
}
