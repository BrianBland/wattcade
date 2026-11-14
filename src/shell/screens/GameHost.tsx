import { UiMessage, UiPanel } from '../../ui';
import { Btn } from '../components/Bits';
import { MediaTimingStats } from '../media/MediaTimingStats';
import { BufferProgress } from '../media/BufferProgress';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, GameRenderer, Insets, MusicFx, Profile } from '../../contracts';
import type { MediaRun, SessionLike } from '../types';
import { ProgramSync } from '../../media/clock';
import { canPause, openingPhase, startTarget } from '../countGate';
import { debugActions, getFake, activeSession, hasConnectedController, input, mediaEngine, onSystem, previewAward, startSession, takeLobbyFrame } from '../services';
import { attachFakeKeys } from '../fakeKeysDom';
import { HudLayer, PauseHistory } from '../hud/HudLayer';
import { HUD_LAYOUT_EVENT, readHudInsets } from '../hud/insets';
import { loadHudLayout, resolveHudLayout, saveHudLayout } from '../hud/layout';
import { controlsSignature, needsControls, playControls } from '../game/controlsSeen';
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

type Phase = 'intro' | 'menu' | 'play' | 'ending';
const isFake = () => getFake() || !!(activeSession() as any)?.fakeBike;

/**
 * Runs a game: controls card (first play, or when the controls/input changed) -> the game's own pre-game menu, if any
 * (trainer held neutral) -> GO: resistance ramps in at once, no countdown -> play (pause menu, mid-ride toasts) ->
 * optional recap -> a short result banner -> onQuit (summary).
 */
export function GameHost({ game, profile, media, onQuit, onAbandon, onRestart, onSave, onControlsSeen }: {
  game: GameModule; profile: Profile; media?: MediaRun; onQuit: () => void; onAbandon: () => void; onRestart: () => void; onSave: (d: unknown) => void;
  /** The rider started from the full controls card: remember this signature so it isn't shown again. */
  onControlsSeen?: (signature: string) => void;
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
  // The overworld's last frame stays up while the game loads; the "Preparing" card only appears if loading is slow.
  const backdrop = useRef<HTMLDivElement>(null);
  const [frame] = useState(takeLobbyFrame);
  const [slow, setSlow] = useState(!frame);
  useEffect(() => {
    if (!frame) return;
    if (backdrop.current) { frame.style.cssText = 'width:100%;height:100%;display:block'; backdrop.current.appendChild(frame); }
    const id = setTimeout(() => setSlow(true), 900);
    return () => clearTimeout(id);
  }, []);
  const loadingRef = useRef(true);
  const [musicWait, setMusicWait] = useState('');
  const musicWaitRef = useRef('');
  const [phase, setPhaseState] = useState<Phase>('intro');
  const [ending, setEnding] = useState<{ over: boolean; durationS: number; summary: Record<string, number | string>; xp: number | null } | null>(null);
  const phaseRef = useRef<Phase>('intro');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const pausedRef = useRef(false);
  const sessionRef = useRef<SessionLike | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  const [layout, setLayout] = useState(loadHudLayout);
  const timers = useRef({ ending: 0, hold: 0, playS: 0 });
  const controlsSig = useRef<string | null>(null); // set while the controls card is owed this session
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
  const shownControls = useRef(false); // the full card was shown this session (skip the "controls are in Menu" hint)
  /** GO: release the trainer, ease the game's resistance in and start the music. No splash: the ride just starts (a short sound marks it). */
  const go = () => {
    const session = sessionRef.current; if (!session || phaseRef.current === 'play') return;
    session.idle(0); // drop the press that started it
    debugActions.panic(false); session.mixer?.rampIn();
    void music.current?.engine.start(0).catch((e) => toast(`Music: ${e instanceof Error ? e.message : e}`));
    setPhase('play'); play('go');
    toast(shownControls.current ? 'Tap Menu for ride options' : 'Controls and ride options: tap Menu');
  };
  /** Leaving the controls card: a game still showing its own pre-game menu (variant / loadout) is run through it before GO. */
  const startFromCard = () => {
    if (loadingRef.current) return;
    if (phaseRef.current === 'intro' && controlsSig.current) { onControlsSeen?.(controlsSig.current); controlsSig.current = null; shownControls.current = true; }
    const to = startTarget(phaseRef.current, !!sessionRef.current?.sim.inMenu?.());
    if (to === 'menu') { sessionRef.current?.idle(0); setPhase('menu'); }
    else if (to === 'go') go();
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
        const firstHud = session.sim.hud?.() ?? {};
        const sig = controlsSignature(playControls(firstHud), resolveHudLayout(loadHudLayout(), hasConnectedController()));
        const showCard = needsControls(profile, game.id, sig);
        controlsSig.current = showCard ? sig : null;
        const opening = openingPhase(showCard, !!session.sim.inMenu?.());
        if (opening === 'menu') setPhase('menu'); // seen these controls: straight into the game's own menu
        const goOnReady = opening === 'go';
        if (media && session.media) {
          const engine = mediaEngine(); engine.load(media.plan, media.rolling); engine.setVolume(1); engine.preload();
          music.current = { engine, sync: new ProgramSync() };
          duckAmbient('music', true); // the game's own ambience would fight the music
        }
        debugActions.panic(true); // trainer neutral through the controls card and the game's menu, until GO
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
        if (goOnReady) go();
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
            if (p.has('a')) startFromCard();
            else if (p.has('b')) { disposed = true; leave(cb.current.onAbandon); return; }
          } else if (ph === 'menu') { // the game's own pre-game menu: run the sim (trainer stays neutral), GO once it's dismissed
            if (!pausedRef.current) {
              session.frame(dt);
              if (session.sim.isOver()) toEnding(true);
              else if (!session.sim.inMenu?.()) go(); // the menu's own Start is GO
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

  const liveHud = session?.sim.hud?.() ?? {};
  const hud = { ...liveHud, controls: playControls(liveHud) }; // the card and help teach gameplay, also while a game menu is open
  return (
    <div class="game-host">
      {frame && <div ref={backdrop} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', transition: 'opacity 700ms ease-out', opacity: loading ? 1 : 0 }}
        onTransitionEnd={() => backdrop.current?.remove()} />}
      <div class="mount" ref={mount} />
      <div class="hud-probe" ref={probe} />
      {loading && slow && !error && <div class="game-loading chrome-ui"><UiMessage title={`Preparing ${game.title}`} busy action={<Btn onClick={()=>leave(onAbandon)}>Back</Btn>}>Your ride starts when the scene is ready.</UiMessage></div>}
      {(musicWait || (profile.settings?.debugStats && media?.timings)) && <div class="game-message chrome-ui">
        {musicWait ? <UiMessage title="Preparing music" busy>
          {musicWait}<BufferProgress read={() => music.current?.engine.bufferProgress() ?? null} />
          <MediaTimingStats timings={profile.settings?.debugStats ? media?.timings : undefined} />
        </UiMessage> : <UiPanel><MediaTimingStats timings={media?.timings} /></UiPanel>}
      </div>}
      {error && <div class="game-loading chrome-ui"><UiMessage title="Could not start the ride" tone="error" action={<Btn onClick={()=>leave(onAbandon)}>Back</Btn>}>{error}</UiMessage></div>}
      {session && <HudLayer session={session} profile={profile} paused={paused || loading || phase === 'intro' || phase === 'ending'} layout={layout} fake={isFake()}
        onControls={() => { if (canPause(phaseRef.current)) { setPause(true); setHelp(true); } }} />}
      {session && !loading && !error && phase === 'intro' && (
        <GameIntro game={game} hud={hud} profile={profile} fake={isFake()} scrollRef={introScroll} mode="pre" count={null}
          startLabel={session.sim.inMenu?.() ? 'Next: choose your setup →' : undefined}
          onStart={startFromCard} onBack={() => leave(onAbandon)} />
      )}
      {paused && help && session && <IntroHelp game={game} hud={hud} profile={profile} fake={isFake()} onClose={() => setHelp(false)} />}
      {paused && history && <PauseHistory ftp={profile.ftp} onClose={() => setHistory(false)} />}
      {paused && !help && !history && (
        <PauseMenu tuning={session?.tuning} fake={isFake()} onHistory={() => { setPauseFocus(6); setHistory(true); }} layout={layout} onLayout={(v) => { setLayout(v); saveHudLayout(v); }}
          onResume={() => setPause(false)} onHelp={() => { setPauseFocus(5); setHelp(true); }} initial={pauseFocus} onRestart={onRestart}
          extensions={session?.sim.menuActions?.() ?? []} onExtension={(action) => { session?.sim.receive?.(action); setPause(false); }}
          {...(phase === 'menu' || session?.sim.inMenu?.() ? { quitLabel: 'Exit game', onQuit: () => leave(onAbandon) }
            : { onQuit: () => toEnding(false) })} />
      )}
      {phase === 'ending' && ending && !recap && <ResultBanner {...ending} profile={profile} onContinue={() => leave(onQuit)} />}
    </div>
  );
}
