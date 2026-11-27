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
import { endingStep, MAX_RECAP_S } from '../game/ending';
import { adoptWarm, disposeWarm, takeWarmGame } from '../game/prewarm';
import { rememberInsets } from '../game/gameInsets';
import { achievementToast, toast } from '../components/Toasts';
import { duckAmbient, play, unlockAudio } from '../../audio/sfx';
import { keepScreenAwake } from '../wakeLock';
import { live, resolveLiveRun } from '../../live/client';
import { LiveHost } from '../../live/host';
import { LiveStore } from '../../live/store';
import { LiveChip, LiveVersions } from '../../live/ui';
import type { TuneDefault } from '../../live/types';

/** Ride milestone toast every this many pedalling seconds. */
export const MILESTONE_S = 600;

type Phase = 'intro' | 'menu' | 'play' | 'ending';
const isFake = () => getFake() || !!(activeSession() as any)?.fakeBike;

/**
 * Runs a game: controls card (first play, or when the controls/input changed) -> the game's own pre-game menu, if any
 * (trainer held neutral) -> GO: resistance ramps in at once, no countdown -> play (pause menu, mid-ride toasts) ->
 * optional recap -> onQuit (the rider rides out onto the overworld, then the summary).
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
  const [versions, setVersions] = useState(false);
  const [liveHost, setLiveHost] = useState<LiveHost | null>(null);
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
  const phaseRef = useRef<Phase>('intro');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const pausedRef = useRef(false);
  const sessionRef = useRef<SessionLike | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  const [layout, setLayout] = useState(loadHudLayout);
  const timers = useRef({ ending: 0, hold: 0, playS: 0 });
  const controlsSig = useRef<string | null>(null); // set while the controls card is owed this session
  const rendererRef = useRef<GameRenderer | null>(null);
  const left = useRef(false); // leaving (quit/abandon) happens once
  const leave = (fn: () => void) => { if (left.current) return; left.current = true; fn(); };
  const cb = useRef({ onQuit, onAbandon }); cb.current = { onQuit, onAbandon };

  const setPause = (p: boolean) => {
    if (loadingRef.current) return;
    if (!canPause(phaseRef.current)) return;
    pausedRef.current = p; setPaused(p); if (!p) { setHelp(false); setHistory(false); setVersions(false); setPauseFocus(0); }
    const s = sessionRef.current; if (!s) return;
    if (phaseRef.current === 'menu') { if (p) s.pause(); else s.resume(); return; } // trainer stays neutral; no music yet
    if (p) { s.sim.receive?.({ type: 'inputCancel' }); s.pause(); debugActions.panic(true); music.current?.engine.pause(); } else { debugActions.panic(false); s.resume(); music.current?.engine.resume(); }
  };
  const shownControls = useRef(false); // the full card was shown this session (skip the "controls are in Menu" hint)
  /** GO: release the trainer, ease the game's resistance in and start the music. No splash or sound: the ride just starts (games that race can run their own countdowns). */
  const go = () => {
    const session = sessionRef.current; if (!session || phaseRef.current === 'play') return;
    session.idle(0); // drop the press that started it
    debugActions.panic(false); session.mixer?.rampIn();
    void music.current?.engine.start(0).catch((e) => toast(`Music: ${e instanceof Error ? e.message : e}`));
    setPhase('play');
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
    pausedRef.current = false; setPaused(false); setHelp(false); setHistory(false); setVersions(false);
    debugActions.panic(true);
    if (music.current) { music.current.engine.setVolume(0); setTimeout(() => music.current?.engine.stop(), 1500); }
    let hold = 0;
    try { hold = Math.min(MAX_RECAP_S, Math.max(0, Number(rendererRef.current?.ending?.({ over }) ?? 0) || 0)); } catch { /* best effort */ }
    timers.current.ending = 0; timers.current.hold = hold; setPhase('ending');
    if (hold === 0) play(over ? 'gameOver' : 'reward');
  };

  useEffect(() => {
    loadingRef.current = true; setLoading(true); setError('');
    const warmJob = takeWarmGame(game.id, profile.id);
    let raf = 0, disposed = false, ro: ResizeObserver | null = null, renderer: GameRenderer | null = null, warmHost: HTMLElement | null = null;
    const readInsets = (): Insets => readHudInsets(mount.current, probe.current);
    const remember = (i: Insets) => { const el = mount.current; if (el) rememberInsets(game.id, el.clientWidth, el.clientHeight, hasConnectedController(), i); return i; };
    const hudLayout = () => { if (!disposed) renderer?.setInsets?.(remember(readInsets())); };
    window.addEventListener(HUD_LAYOUT_EVENT, hudLayout);
    const detachKeys = input.attachKeyboard(window);
    const detachPad = input.attachGamepad();
    const detachTouch = mount.current ? input.attachTouch(mount.current) : () => {};
    const detachFakeKeys = attachFakeKeys();
    unlockAudio(); // GameHost mounts from a menu press, which counts as a user gesture
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    const offSys = onSystem((a) => { if (a === 'pause') setPause(!pausedRef.current); else if (a === 'panic') debugActions.panic(true); });
    const releaseWake = keepScreenAwake(); // re-acquired after the page hides; video fallback on iOS
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
        // Live updates (src/live): start from this game's pinned versions; back up the save when the logic changes
        const liveRun = live.isEnabled() ? await resolveLiveRun(game, profile).catch(() => null) : null; // no await when off
        if (disposed) return;
        liveRun?.notes.forEach((n) => toast(n));
        let startProfile = profile;
        if (live.isEnabled()) {
          const store = new LiveStore(profile.id), simSha = liveRun?.layers.sim ?? null, last = store.lastStartedSim(game.id);
          if (last !== undefined && last !== simSha && profile.gameData[game.id] !== undefined)
            store.backup(game.id, { time: Date.now(), beforeSim: last, afterSim: simSha, data: profile.gameData[game.id] });
          store.setStartedSim(game.id, simSha);
          const ri = store.pendingRestore(game.id), b = ri === null ? undefined : store.backups(game.id)[ri];
          store.setPendingRestore(game.id, null);
          if (b) { startProfile = { ...profile, gameData: { ...profile.gameData, [game.id]: b.data } }; onSave(b.data); toast('Save restored from backup'); }
        }
        const simGame = liveRun?.sim ?? game, renderGame = liveRun?.render ?? game;
        const session = startSession(simGame, startProfile, onSave, media ? { timeline: media.timeline, ...(media.rolling?.announce ? { announce: (id: string, t: number) => media.rolling?.announce?.(id, t) } : {}) } : undefined);
        sessionRef.current = session; setSession(session);
        const builtInTuning: Record<string, TuneDefault> = {}; // the built-in defaults, to roll tunables back to
        for (const e of session.tuning?.list(game.id) ?? []) builtInTuning[e.name] = { d: e.def, ...(e.min !== undefined ? { min: e.min, max: e.max } : {}) };
        if (liveRun?.tuning) session.tuning?.applyDefaults(game.id, liveRun.tuning);
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
        const musicFx = music.current ? (fx: MusicFx) => music.current?.engine.setFx(fx) : undefined;
        let warm = warmJob ? await warmJob : null; // loaded while the rider rode to the portal
        if (warm && renderGame !== game) { disposeWarm(warm); warm = null; } // a live-updated renderer: the warm one is the built-in
        const mountCtx = { profile, send: (a: unknown) => session.sim.receive?.(a), insets: readInsets(), musicFx, hudControls: true };
        if (warm) {
          if (disposed) { disposeWarm(warm); return; }
          warm.attach((a) => session.sim.receive?.(a), musicFx);
          adoptWarm(warm, mount.current!); warmHost = warm.host;
          renderer = warm.renderer; rendererRef.current = renderer;
          renderer.resize?.(mount.current!.clientWidth, mount.current!.clientHeight);
        } else {
          renderer = await renderGame.loadRenderer(); rendererRef.current = renderer;
          if (disposed) { renderer.unmount(); return; }
          renderer.mount(mount.current!, mountCtx);
        }
        renderer.setInsets?.(remember(readInsets()));
        const el = mount.current!;
        ro = new ResizeObserver(() => { if (!disposed) { renderer?.resize?.(el.clientWidth, el.clientHeight); renderer?.setInsets?.(readInsets()); } });
        ro.observe(el);
        if (probe.current) ro.observe(probe.current);
        // A game loaded ahead of time was readied then; readying it again only catches up with a size change (say the
        // game's HUD is shorter than the overworld's), which games redo lazily, so it never holds the Preparing screen.
        if (warm) void renderer.ready?.()?.catch?.(() => {});
        else await renderer.ready?.();
        if (disposed) return;
        if (!warm && renderer.prepare) { try { await renderer.prepare(session.sim.snapshot()); } catch { /* best effort */ } if (disposed) return; }
        session.idle(0); // discard presses made while loading before exposing game controls
        renderer.render(session.sim.snapshot(), session.ctx.bike(), input.state());
        loadingRef.current = false; setLoading(false);
        // mid-ride swaps for live updates: tunables move at once; a renderer is swapped while the sim keeps running
        const dropRenderer = () => { const old = renderer; renderer = null; rendererRef.current = null; try { old?.unmount(); } catch { /* best effort */ } };
        const swapRenderer = async (mod: GameModule, dropNow = false) => {
          if (dropNow) dropRenderer(); // the sim's snapshots just changed shape: stop drawing them with the old renderer
          const next = await mod.loadRenderer();
          if (disposed) { next.unmount(); return; }
          dropRenderer();
          warmHost?.remove(); warmHost = null;
          next.mount(mount.current!, { ...mountCtx, insets: readInsets() });
          next.setInsets?.(readInsets());
          await next.ready?.();
          if (next.prepare) { try { await next.prepare(session.sim.snapshot()); } catch { /* best effort */ } }
          if (disposed) { next.unmount(); return; }
          renderer = next; rendererRef.current = next;
        };
        // a logic change waiting for the sim's next checkpoint (GameSim.checkpoint); the loop hands over
        let queuedSim: { mod: GameModule; sha: string | null } | null = null;
        const host = live.isEnabled() ? new LiveHost(game, profile.id, liveRun?.layers ?? null, {
          swapRenderer: (mod, dropNow) => swapRenderer(mod, dropNow).catch(async (e) => { if (!renderer && !disposed) await swapRenderer(game); throw e; }),
          applyTuning: (d) => { session.tuning?.applyDefaults(game.id, d ?? builtInTuning); },
          queueSim: (q) => { if (q && typeof session.sim.checkpoint !== 'function') return false; queuedSim = q; return true; },
        }) : null;
        setLiveHost(host);
        const handOver = () => {
          const q = queuedSim; if (!q || !host || !session.swapSim) return;
          const state = session.sim.checkpoint?.();
          if (state === null || state === undefined) return;
          queuedSim = null;
          const store = new LiveStore(profile.id), before = store.lastStartedSim(game.id) ?? null, data = session.ctx.load?.();
          if (data !== undefined) store.backup(game.id, { time: Date.now(), beforeSim: before, afterSim: q.sha, data });
          try { session.swapSim(q.mod, state); store.setStartedSim(game.id, q.sha); } catch (e) { toast(`Logic didn't start: ${e instanceof Error ? e.message : e}`); return; }
          void host.simSwapped(q.sha, q.mod).then((msg) => { if (msg) toast(msg, 'good'); });
        };
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
              session.frame(dt); handOver();
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
              handOver();
              T.playS += dt;
              if ((T.playS >= seen.nextCheck)) { seen.nextCheck = T.playS + 10; celebrate(); }
              if (session.sim.isOver()) toEnding(true);
            }
          } else {
            const p = session.idle(dt);
            T.ending += dt;
            if (endingStep(T.ending, T.hold, p.has('a')).leave) { disposed = true; leave(cb.current.onQuit); return; }
          }
          renderer?.render(session.sim.snapshot(), session.ctx.bike(), input.state(), session.loop?.frameFraction);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) { if (!disposed) { setLoading(false); setError(e instanceof Error ? e.message : String(e)); } }
    })();
    return () => {
      disposed = true; window.removeEventListener(HUD_LAYOUT_EVENT, hudLayout); detachFakeKeys(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); cancelAnimationFrame(raf); ro?.disconnect(); offSys(); detachKeys(); detachPad(); detachTouch();
      renderer?.unmount(); rendererRef.current = null; releaseWake(); setLiveHost(null);
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
      {paused && versions && liveHost && <LiveVersions host={liveHost} onClose={() => setVersions(false)} />}
      <LiveChip host={liveHost} hidden={loading || phase === 'intro' || phase === 'ending' || paused} />
      {paused && !help && !history && !versions && (
        <PauseMenu tuning={session?.tuning} fake={isFake()} onVersions={liveHost ? () => { setPauseFocus(8); setVersions(true); } : undefined} onHistory={() => { setPauseFocus(6); setHistory(true); }} layout={layout} onLayout={(v) => { setLayout(v); saveHudLayout(v); }}
          onResume={() => setPause(false)} onHelp={() => { setPauseFocus(5); setHelp(true); }} initial={pauseFocus} onRestart={onRestart}
          extensions={session?.sim.menuActions?.() ?? []} onExtension={(action) => { session?.sim.receive?.(action); setPause(false); }}
          {...(phase === 'menu' || session?.sim.inMenu?.() ? { quitLabel: 'Exit game', onQuit: () => leave(onAbandon) }
            : { onQuit: () => toEnding(false) })} />
      )}
    </div>
  );
}
