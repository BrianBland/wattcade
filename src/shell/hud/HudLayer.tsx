import { useEffect, useRef, useState } from 'preact/hooks';
import type { BikeState, GameHud, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { getDifficulty, input } from '../services';
import { formatDuration } from '../format';
import { Hood, PadKey } from './Pad';
import { buildPad } from './padModel';
import { ZoneWidget, type ZoneView } from './ZoneWidget';
import { History, boundsFor, effectiveSource, zonePosition, type Bar } from './zoneMath';

interface Frame { bike: BikeState; hud: GameHud; held: ReadonlySet<any>; paddles: [number, number]; view: ZoneView; bars: Bar[]; diff: number }

const GEAR_KEYS = [
  { id: 'shiftDnL', glyph: '−', color: '#b07cff', mapped: true },
  { id: 'shiftUpL', glyph: '+', color: '#b07cff', mapped: true },
] as const;

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
  const [pulse, setPulse] = useState(0);
  const last = useRef({ gear: -1, diff: -1, t: performance.now() });
  useEffect(() => {
    const id = setInterval(() => {
      const bike = session.ctx.bike() as BikeState;
      const hud = session.sim.hud?.() ?? {};
      const source = effectiveSource(profile.settings.zoneSource, bike.hr5s, hud.targetZone);
      const frac = source === 'hr' ? (bike.hr5s ?? 0) / profile.maxHr : bike.ftpFraction;
      const pos = zonePosition(frac, boundsFor(source));
      const now = performance.now(); const dt = (now - last.current.t) / 1000; last.current.t = now;
      if (!paused) hist.current.push(dt, bike.power3s, bike.hr5s, pos.zone);
      const diff = getDifficulty();
      if (last.current.gear !== bike.gear || last.current.diff !== diff) {
        if (last.current.gear !== -1) setPulse((n) => n + 1);
        last.current.gear = bike.gear; last.current.diff = diff;
      }
      const st = input.state();
      setF({ bike, hud, held: st.held, paddles: [st.paddleL, st.paddleR], view: { pos, source }, bars: hist.current.bars.slice(), diff });
    }, 100);
    return () => clearInterval(id);
  }, [session, paused]);
  if (!f) return null;
  const gears = !!f.hud.gears;
  const pad = buildPad(f.hud.controls ?? [], gears);
  const mb = menu?.();
  return (
    <div class={`hud${legendOn ? '' : ' no-pad'}`}>
      {legendOn && <Hood side="L" model={pad.left} held={f.held} paddle={f.paddles[0]} />}
      <div class="hud-center" ref={center}>
        <ZoneWidget ftp={profile.ftp} fake={fake} bike={f.bike} view={f.view} target={f.hud.targetZone} cadenceTarget={f.hud.targetCadence} bars={f.bars}
          lead={<button type="button" class={`hud-menu${mb?.dim ? ' dim' : ''}`} onClick={mb?.onClick ?? (() => input.system('pause'))}>{mb?.label ?? 'Menu'}</button>}
          footer={<div class="hud-time"><span title="Ride time (pedalling)">Ride {formatDuration(f.bike.activeSeconds)}</span><small title="Resistance difficulty multiplier">Diff {f.diff.toFixed(2)}</small></div>}
          trail={<>
            {gears && (
              <div class="gearbox" key={pulse}>
                <div class="pc-btns">{GEAR_KEYS.map((b) => <PadKey b={b} held={f.held} />)}</div>
                <small>Gear {f.bike.gear}</small>
              </div>
            )}
          </>} />
      </div>
      {legendOn && <Hood side="R" model={pad.right} held={f.held} paddle={f.paddles[1]} />}
    </div>
  );
}
