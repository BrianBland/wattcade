import { useEffect, useRef, useState } from 'preact/hooks';
import type { BikeState, GameHud, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { input } from '../services';
import { formatDuration } from '../format';
import { Hood } from './Pad';
import { buildPad } from './padModel';
import { ZoneWidget, type ZoneView } from './ZoneWidget';
import { History, boundsFor, effectiveSource, zonePosition, type Bar } from './zoneMath';

interface Frame { bike: BikeState; hud: GameHud; held: ReadonlySet<any>; paddles: [number, number]; view: ZoneView; bars: Bar[] }

/** One ride history for every HUD (lobby -> game -> lobby), so the chart doesn't reset between screens. */
const rideHistory = new History();

/**
 * Shared in-game HUD strip, laid out like the controller: left hood | stats, menu and gears | right hood.
 * The hoods double as touch buttons. DOM updates at ~10 Hz.
 */
export function HudLayer({ session, profile, paused, legendOn, fake, menu }: {
  fake?: boolean; session: SessionLike; profile: Profile; paused: boolean; legendOn: boolean;
  /** The centre button, read every HUD frame (defaults to the in-game Menu / pause). */
  menu?: () => { label: string; onClick: () => void; dim?: boolean };
}) {
  const [f, setF] = useState<Frame | null>(null);
  const center = useRef<HTMLDivElement>(null);
  // Keep renderer insets in sync when target copy or narrow screens grow the panel.
  useEffect(() => {
    const el = center.current;
    if (!el) return;
    const measure = () => document.documentElement.style.setProperty('--hud-content-h', `${el.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(el); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--hud-content-h'); };
  }, [!!f]);
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
      setF({ bike, hud, held: st.held, paddles: [st.paddleL, st.paddleR], view: { pos, source }, bars: hist.current.bars.slice() });
    }, 100);
    return () => clearInterval(id);
  }, [session, paused]);
  if (!f) return null;
  const gears = !!f.hud.gears;
  const pad = buildPad(f.hud.controls ?? [], gears);
  const mb = menu?.();
  return (
    <div class={`hud${legendOn ? '' : ' no-pad'}`}>
      {legendOn && <Hood side="L" model={pad.left} held={f.held} paddle={f.paddles[0]} gear={f.bike.gear} />}
      <div class="hud-center" ref={center}>
        <ZoneWidget ftp={profile.ftp} fake={fake} bike={f.bike} view={f.view} target={f.hud.targetZone} cadenceTarget={f.hud.targetCadence} bars={f.bars}
          lead={<button type="button" class={`hud-menu${mb?.dim ? ' dim' : ''}`} onClick={mb?.onClick ?? (() => input.system('pause'))}>{mb?.label ?? 'Menu'}</button>}
          footer={<div class="hud-time"><span title="Ride time (pedalling)">Ride {formatDuration(f.bike.activeSeconds)}</span></div>}
          trail={gears && <div class="hud-gear" title="Current virtual gear"><small>Gear</small><b>{f.bike.gear}</b></div>} />
      </div>
      {legendOn && <Hood side="R" model={pad.right} held={f.held} paddle={f.paddles[1]} gear={f.bike.gear} />}
    </div>
  );
}
