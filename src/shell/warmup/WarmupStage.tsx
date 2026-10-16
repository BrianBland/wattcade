import { FrameGate } from './frameGate';
import { VisualSnapshot } from './visualSnapshot';
import type { WarmupSnapshot } from '../../games/warmup/sim/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameRenderer, Insets, Profile, SessionRecord } from '../../contracts';
import type { SessionLike } from '../types';
import { lobbyGame } from '../../games/registry';
import { riderLook } from '../../cosmetics/unlocks';
import {
  checkpointLobby, getDeviceStatus, getFake, input, lobbyActiveSeconds, lobbyIsReal, lobbySession, startLobby, stopLobby,
  subscribeDevices, takeLobbyPresses, WARMUP_CREDIT_S,
} from '../services';
import { deliverMenuPresses, setExternalMenuDriver } from '../menuInput';
import { attachFakeKeys } from '../fakeKeysDom';
import { DriveInScreen, type DriveInApi } from '../drivein/DriveInScreen';
import { getDriveIn } from '../drivein/store';

/** Stop pedalling this long after a creditable ride and it is saved on its own (a fresh ride starts). */
export const AUTO_SAVE_IDLE_S = 180;
const CHECKPOINT_S = 20;

const deviceKey = () => { const s = getDeviceStatus(); return `${getFake()}|${s.trainer.connected}|${s.hr.connected}|${s.controller.connected}`; };

/**
 * The Warm-up Ride behind every menu: runs the lobby session, draws the scenery full-bleed, and drives the
 * shared InputHub for the menus. Restarts the ride (keeping the road position) when the rider or devices change.
 */
export function WarmupStage({ profile, hud, restartKey, driveInVisible, onSession, onRideEnded }: {
  profile: Profile | null; hud: boolean; restartKey: number;
  /** The lobby menu screen is up, so the Drive-In screen may show. */
  driveInVisible: boolean;
  onSession: (s: SessionLike | null) => void;
  /** A creditable ride ended because of a restart, rider change, auto-save or leaving for a game. */
  onRideEnded: (r: SessionRecord) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const renderer = useRef<(GameRenderer & { setScreen?(r: { x: number; y: number; w: number; h: number } | null): void }) | null>(null);
  const driveIn = useRef<DriveInApi | null>(null);
  const size = useRef({ w: 0, h: 0, inset: 0 });
  const [devKey, setDevKey] = useState(deviceKey);
  const [autoSaves, setAutoSaves] = useState(0);
  const cb = useRef({ onSession, onRideEnded }); cb.current = { onSession, onRideEnded };
  const remastered = useRef(true); remastered.current = profile?.settings.overworldArt !== 'legacy';
  const readInsets = (): Insets => ({ top: 0, right: 0, left: 0, bottom: probe.current?.offsetHeight ?? 0 });

  useEffect(() => subscribeDevices(() => setDevKey(deviceKey())), []);

  // ride lifecycle: cleanup credits the ride that is ending
  useEffect(() => {
    const s = startLobby(profile);
    cb.current.onSession(s);
    return () => {
      const rec = stopLobby();
      cb.current.onSession(null);
      if (rec) cb.current.onRideEnded(rec);
    };
  }, [profile?.id, devKey, restartKey, autoSaves]);

  // Remount on equipment or art-mode changes; the ride lifecycle above keeps its distance and credit.
  const lookKey = profile ? JSON.stringify(riderLook(profile)) : '';
  useEffect(() => {
    let disposed = false;
    void lobbyGame.loadRenderer().then((r) => {
      if (disposed || !mount.current) return;
      r.mount(mount.current, { profile: profile ?? { color: '#00f0ff' } as Profile, insets: readInsets() });
      renderer.current = r;
    });
    return () => { disposed = true; renderer.current?.unmount(); renderer.current = null; };
  }, [profile?.id, lookKey, profile?.settings.units]);
  useEffect(() => { renderer.current?.setInsets?.(readInsets()); }, [hud]);

  // frame loop, input, wake lock (once)
  useEffect(() => {
    setExternalMenuDriver(true);
    const detachKeys = input.attachKeyboard(window);
    const detachPad = input.attachGamepad();
    const detachFake = attachFakeKeys();
    let lock: { release(): Promise<void> } | null = null;
    const wake = () => { if (!lock && document.visibilityState === 'visible') (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l; l.addEventListener?.('release', () => { lock = null; }); }).catch(() => {}); };
    const onVis = () => { if (document.visibilityState === 'hidden') checkpointLobby(); else wake(); };
    wake();
    window.addEventListener('pointerdown', wake); document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', checkpointLobby);
    const el = mount.current!;
    const ro = new ResizeObserver(() => { renderer.current?.resize?.(el.clientWidth, el.clientHeight); renderer.current?.setInsets?.(readInsets()); size.current = { w: el.clientWidth, h: el.clientHeight, inset: probe.current?.offsetHeight ?? 0 }; });
    ro.observe(el); if (probe.current) ro.observe(probe.current);

    size.current = { w: el.clientWidth, h: el.clientHeight, inset: probe.current?.offsetHeight ?? 0 };
    let raf = 0, last = performance.now(), still = 0, sinceCheck = 0, sentTo: unknown = null, sentOn = false;
    const draws = new FrameGate(60);
    const visual = new VisualSnapshot();
    let drawDt = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const s = lobbySession();
      if (s) {
        s.frame(dt);
        deliverMenuPresses(takeLobbyPresses());
        const on = getDriveIn().on;
        if (s !== sentTo || on !== sentOn) { sentTo = s; sentOn = on; s.sim.receive?.({ type: 'driveIn', on }); } // the scenery blends in / out
        drawDt += dt;
        if (document.visibilityState !== 'hidden' && draws.ready(now)) {
          const raw = s.sim.snapshot() as WarmupSnapshot;
          const smooth = visual.sample(raw, s.loop?.interpolationAlpha ?? 1, s);
          const snap = remastered.current ? smooth : raw;
          const { w, h, inset } = size.current;
          // the DOM video and the canvas frame share one rect, computed before the canvas draws
          renderer.current?.setScreen?.(driveIn.current?.tick(Math.min(0.25, drawDt), w, h, inset, (snap as { driveIn?: number }).driveIn ?? 0) ?? null);
          renderer.current?.render(snap, s.ctx.bike(), input.state());
          drawDt = 0;
        }
        still = s.ctx.bike().cadence3s < 10 ? still + dt : 0;
        sinceCheck += dt;
        if (sinceCheck >= CHECKPOINT_S || (still > AUTO_SAVE_IDLE_S && sinceCheck >= 5)) {
          sinceCheck = 0;
          if (lobbyIsReal() && lobbyActiveSeconds() >= WARMUP_CREDIT_S) {
            if (still > AUTO_SAVE_IDLE_S) { still = 0; setAutoSaves((n) => n + 1); } else checkpointLobby();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); setExternalMenuDriver(false);
      detachKeys(); detachPad(); detachFake();
      window.removeEventListener('pointerdown', wake); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', checkpointLobby);
      void lock?.release();
    };
  }, []);

  return (
    <>
      <div class="game-host stage">
        <div class="mount" ref={mount} />
        <div class="hud-probe" ref={probe} style={hud ? undefined : { height: 0 }} />
      </div>
      <DriveInScreen api={driveIn} visible={driveInVisible} />
    </>
  );
}
