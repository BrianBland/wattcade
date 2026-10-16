import { useEffect, useRef, useState } from 'preact/hooks';
import type { BikeState, GameHud, Profile, TrainerCommand } from '../../contracts';
import type { SessionLike } from '../types';
import { input } from '../services';
import { Hood, PadKey } from './Pad';
import { buildPad, type PadButton } from './padModel';
import { ZoneWidget, type ZoneView } from './ZoneWidget';
import { History, boundsFor, effectiveSource, zonePosition, type Bar } from './zoneMath';

interface Frame { bike: BikeState; hud: GameHud; command?: TrainerCommand | null; held: ReadonlySet<any>; paddles: [number, number]; view: ZoneView; bars: Bar[] }

/** One ride history for every HUD (lobby -> game -> lobby), so the chart doesn't reset between screens. */
const rideHistory = new History();

/**
 * Shared in-game HUD strip, laid out like the controller: left hood | stats, menu and gears | right hood.
 * The hoods double as touch buttons. DOM updates at ~10 Hz.
 */
export function HudLayer({ session, profile, paused, legendOn, fake, menu }: {
  fake?: boolean; session: SessionLike; profile: Profile; paused: boolean; legendOn: boolean;
  /** The centre HUD action, read every HUD frame (defaults to the in-game Menu / pause). */
  menu?: () => { label: string; onClick: () => void; dim?: boolean };
}) {
  const [f, setF] = useState<Frame | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Keep renderer insets in sync when target copy or narrow screens grow the panel.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => document.documentElement.style.setProperty('--hud-content-h', `${Math.max(0, ...[...el.children].map(c => c.getBoundingClientRect().height))}px`);
    const observer = new ResizeObserver(measure);
    for (const child of el.children) observer.observe(child); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--hud-content-h'); };
  }, [!!f, legendOn, f?.hud.touchControls?.join(), f?.hud.gears]);
  const hist = useRef(rideHistory);
  const last = useRef({ t: performance.now() });
  useEffect(() => {
    const id = setInterval(() => {
      const bike = session.ctx.bike() as BikeState;
      const hud = session.sim.hud?.() ?? {};
      const source = effectiveSource(profile.settings.zoneSource, bike.hr5s, hud.targetZone);
      const frac = source === 'hr' ? (bike.hr5s ?? 0) / profile.maxHr : bike.ftpFraction;
      const pos = zonePosition(frac, boundsFor(source));
      const now = performance.now(); const dt = (now - last.current.t) / 1000; last.current.t = now;
      if (!paused) hist.current.push(dt, bike.power3s, bike.hr5s, pos.zone);
      const st = input.state();
      setF({ bike, hud, command: session.mixer?.command, held: st.held, paddles: [st.paddleL, st.paddleR], view: { pos, source }, bars: hist.current.bars.slice() });
    }, 100);
    return () => clearInterval(id);
  }, [session, paused]);
  if (!f) return null;
  const gears = !!f.hud.gears;
  const pad = buildPad(f.hud.controls ?? [], gears);
  const gearShift = [pad.left.shift, pad.right.shift].find(shift => shift?.gears);
  const mb = menu?.();
  const send = (a: unknown) => session.sim.receive?.(a);
  const primary = f.hud.touchControls ?? [];
  const buttons = [...pad.left.stick.buttons, ...pad.right.stick.buttons];
  const touchSide = (side: 'L' | 'R') => {
    const selected = primary.map(id => buttons.find(b => b.id === id)).filter((b): b is PadButton => !!b?.mapped)
      .filter(b => side === 'R' ? ['b', 'y', 'z'].includes(b.id) : !['b', 'y', 'z'].includes(b.id));
    return selected.length > 0 && <div class="hud-actions" role="group" aria-label={`${side === 'L' ? 'Left' : 'Right'} touch controls`}>
      {selected.map(b => <PadKey key={b.id} b={b} held={f.held} send={send} disabled={paused} block />)}
    </div>;
  };
  return (
    <div ref={root} class={`hud${legendOn ? '' : ' no-pad'}`} key={legendOn ? 'controller' : 'touch'}>
      {legendOn && <Hood side="L" model={pad.left} held={f.held} paddle={f.paddles[0]} send={send} disabled={paused} />}
      {!legendOn && touchSide('L')}
      <div class="hud-center">
        <button type="button" class="hud-menu-hit" aria-label={mb?.label ?? 'Open game menu'} title={mb?.label ?? 'Open game menu'} onClick={mb?.onClick ?? (() => input.system('pause'))} />
        <ZoneWidget ftp={profile.ftp} fake={fake} bike={f.bike} view={f.view} target={f.hud.targetZone} cadenceTarget={f.hud.targetCadence} bars={f.bars} gears={gears} command={f.command}
          gearControls={gears && gearShift?.buttons.slice().reverse().map(b => <PadKey key={b.id} b={{ ...b, label: b.glyph === '+' ? 'Gear up' : 'Gear down' }} held={f.held} send={send} disabled={paused} merged />)} />
      </div>
      {legendOn && <Hood side="R" model={pad.right} held={f.held} paddle={f.paddles[1]} send={send} disabled={paused} />}
      {!legendOn && touchSide('R')}
    </div>
  );
}
