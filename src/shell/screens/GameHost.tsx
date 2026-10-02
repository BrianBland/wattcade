import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, GameRenderer, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { getDifficulty, debugActions, getFake, activeSession, input, onSystem, startSession } from '../services';
import { fakeKeyAdjust } from '../fakeKeys';
import { HudLayer } from '../hud/HudLayer';
import { loadFlag, saveFlag } from '../../debug/flag';
import { PauseMenu } from './PauseMenu';
import { unlockAudio } from '../../audio/sfx';

const isFake = () => getFake() || !!(activeSession() as any)?.fakeBike;
export function GameHost({ game, profile, onQuit, onSave }: { game: GameModule; profile: Profile; onQuit: () => void; onSave: (d: unknown) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const pausedRef = useRef(false);
  const sessionRef = useRef<SessionLike | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  const [legendOn, setLegendOn] = useState(() => loadFlag('wattcade.legend', true));
  const setPause = (p: boolean) => {
    pausedRef.current = p; setPaused(p);
    const s = sessionRef.current; if (!s) return;
    if (p) { s.pause(); debugActions.panic(true); } else { debugActions.panic(false); s.resume(); }
  };

  useEffect(() => {
    let raf = 0, disposed = false, ro: ResizeObserver | null = null, renderer: GameRenderer | null = null, lock: { release(): Promise<void> } | null = null;
    const detachKeys = input.attachKeyboard(window);
    const detachPad = input.attachGamepad();
    const detachTouch = mount.current ? input.attachTouch(mount.current) : () => {};
    const onFakeKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const a = fakeKeyAdjust(e.code);
      if (a && !e.ctrlKey && !e.metaKey && !e.altKey) debugActions.fakeAdjust(a.k, a.delta);
    };
    window.addEventListener('keydown', onFakeKey);
    unlockAudio(); // GameHost mounts from a menu press, which counts as a user gesture
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    const offSys = onSystem((a) => { if (a === 'pause') setPause(!pausedRef.current); else if (a === 'panic') debugActions.panic(true); });
    (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l; }).catch(() => {});
    (async () => {
      try {
        const session = startSession(game, profile, onSave);
        sessionRef.current = session; setSession(session);
        renderer = await game.loadRenderer();
        if (disposed) { renderer.unmount(); return; }
        renderer.mount(mount.current!, { profile, send: (a) => session.sim.receive?.(a) });
        const el = mount.current!;
        ro = new ResizeObserver(() => { if (!disposed) renderer?.resize?.(el.clientWidth, el.clientHeight); });
        ro.observe(el);
        let last = performance.now();
        const loop = (now: number) => {
          if (disposed) return;
          const dt = Math.min(0.25, (now - last) / 1000); last = now;
          if (!pausedRef.current) {
            session.frame(dt);
            if (session.sim.isOver()) { disposed = true; onQuit(); return; }
          }
          renderer!.render(session.sim.snapshot(), session.ctx.bike(), input.state());
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => {
      disposed = true; window.removeEventListener('keydown', onFakeKey); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); cancelAnimationFrame(raf); ro?.disconnect(); offSys(); detachKeys(); detachPad(); detachTouch();
      renderer?.unmount(); void lock?.release();
    };
  }, [game]);

  return (
    <div class="game-host">
      <div class="mount" ref={mount} />
      {error && <div class="modal" style={{ position: 'absolute', top: '30%', left: '20%' }}><b class="warn">{error}</b><button class="btn" onClick={onQuit}>Back</button></div>}
      {session && <HudLayer session={session} profile={profile} paused={paused} legendOn={legendOn} fake={isFake()} />}
      {paused && <PauseMenu legendOn={legendOn} onLegend={(v) => { setLegendOn(v); saveFlag('wattcade.legend', v); }} difficulty={getDifficulty()} onResume={() => setPause(false)} onQuit={onQuit} />}
    </div>
  );
}
