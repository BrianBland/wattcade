import { useEffect, useRef, useState } from 'preact/hooks';
import type { BikeState, GameHud, Profile } from '../../contracts';
import type { SessionLike } from '../types';
import { getDifficulty, input } from '../services';
import { CompactLegend } from './CompactLegend';
import { Legend } from './Legend';
import { ZoneWidget, type ZoneView } from './ZoneWidget';
import { History, boundsFor, effectiveSource, zonePosition, type Bar } from './zoneMath';

interface Frame { bike: BikeState; hud: GameHud; held: ReadonlySet<any>; paddles: [number, number]; view: ZoneView; bars: Bar[]; diff: number }

/** Shared in-game HUD strip (zone widget, gear/difficulty chip, controller legend). DOM updates at ~10 Hz. */
export function HudLayer({ session, profile, paused, legendOn, fake }: { fake?: boolean; session: SessionLike; profile: Profile; paused: boolean; legendOn: boolean }) {
  const hist = useRef(new History());
  const [f, setF] = useState<Frame | null>(null);
  const [expandedFirst, setExpandedFirst] = useState(true); // short start banner
  const [pulse, setPulse] = useState(0);
  const last = useRef({ gear: -1, diff: -1, t: performance.now() });
  useEffect(() => { const id = setTimeout(() => setExpandedFirst(false), 4000); return () => clearTimeout(id); }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const bike = session.ctx.bike() as BikeState;
      const hud = session.sim.hud?.() ?? {};
      const source = effectiveSource(profile.settings.zoneSource, bike.hr5s);
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
  const expanded = paused || expandedFirst;
  return (
    <div class="hud">
      {legendOn && <CompactLegend controls={f.hud.controls ?? []} held={f.held} paddles={f.paddles} />}
      <div class="hud-chips"><div class="chip" key={pulse}>{f.hud.gears && <span>Gear {f.bike.gear}</span>}<span>Diff {f.diff.toFixed(2)}</span></div></div>
      <ZoneWidget ftp={profile.ftp} fake={fake} bike={f.bike} view={f.view} target={f.hud.targetZone} bars={f.bars} />
      {legendOn && expanded && <div class="hud-expanded"><Legend controls={f.hud.controls ?? []} held={f.held} paddles={f.paddles} expanded /></div>}
    </div>
  );
}
