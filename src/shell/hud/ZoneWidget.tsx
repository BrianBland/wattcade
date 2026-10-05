import type { ComponentChildren } from 'preact';
import type { BikeState, GameHud } from '../../contracts';
import { type Bar, type ZonePos, ZONE_COLORS, cadenceRange, cadenceStatus, zoneFloorWatts } from './zoneMath';

/** Low bands: label starts at the band's left edge. High bands: it ends at the band's right edge, so it never runs off the bar. */
const labelAnchor = (t: { min: number; max: number }) => (t.min <= 2
  ? { marginLeft: `${(t.min - 1) * 20}%` }
  : { marginLeft: 'auto', marginRight: `${(5 - t.max) * 20}%`, textAlign: 'right' as const });

export interface ZoneView { pos: ZonePos; source: 'power' | 'hr' }

export function ZoneWidget({ bike, view, target, cadenceTarget, bars, ftp, fake, lead, trail }: {
  lead?: ComponentChildren; trail?: ComponentChildren; ftp: number; fake?: boolean; bike: Readonly<BikeState>; view: ZoneView; target?: GameHud['targetZone']; cadenceTarget?: GameHud['targetCadence']; bars: Bar[];
}) {
  const maxP = Math.max(1.6 * ftp, 100, ...bars.map((b) => b.power));
  const hrs = bars.map((b) => b.hr).filter((h): h is number => h != null);
  const hrMin = Math.min(...hrs, 200), hrMax = Math.max(...hrs, 40);
  const cad = cadenceStatus(bike.cadence3s, cadenceTarget);
  // power-judged targets (short efforts) say how many watts they need, since the bar has switched to power
  const floorW = target?.source === 'power' ? zoneFloorWatts(target.min, ftp) : null;
  const label = target?.label && floorW != null ? `${target.label} · ${floorW}+ W` : target?.label;
  const hrPts = bars.map((b, i) => b.hr == null ? null : `${(i / 89) * 100},${100 - ((b.hr - hrMin + 5) / (hrMax - hrMin + 10)) * 100}`).filter(Boolean).join(' ');
  return (
    <div class="zw">
      <div class="zw-nums">
        {lead}
        <div><b>{Math.round(bike.power3s)}</b><small>W</small></div>
        <div><b>{Math.round(bike.ftpFraction * 100)}</b><small>%FTP</small></div>
        <div><b>{bike.hr5s == null ? '--' : Math.round(bike.hr5s)}</b><small>HR</small></div>
        <div class={`zw-cad${cad ? ` ${cad}` : ''}`}>
          <b>{Math.round(bike.cadence3s)}</b><small>rpm</small>
          {cadenceTarget && <em title={cadenceTarget.label}>{cad === 'low' ? '▲' : cad === 'high' ? '▼' : '✓'} {cadenceRange(cadenceTarget)}</em>}
        </div>
        {trail}
      </div>
      {(label || cadenceTarget?.label) && (
        <div class="zw-labels">
          {label && <div class="zw-label" style={{ color: ZONE_COLORS[target!.min - 1], ...labelAnchor(target!) }}>{label}</div>}
          {cadenceTarget?.label && <div class={`zw-label zw-cad-label${cad ? ` ${cad}` : ''}`}>{cadenceTarget.label}</div>}
        </div>
      )}
      <div class="zw-bar" title={view.source === 'hr' ? 'Zones from heart rate' : 'Zones from power'}>
        {ZONE_COLORS.map((c, i) => <i style={{ background: c }}>Z{i + 1}</i>)}
        {target && <u class="zw-target" style={{ left: `${(target.min - 1) * 20}%`, width: `${(target.max - target.min + 1) * 20}%` }}></u>}
        <s class="zw-marker" style={{ left: `${view.pos.pos * 100}%` }} />
      </div>
      <div class="zw-chart">
        {bars.map((b) => <i style={{ height: `${Math.max(2, (b.power / maxP) * 100)}%`, background: ZONE_COLORS[b.zone - 1] }} />)}
        {hrPts && <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={hrPts} fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>}
      </div>
      {fake && <div class="dim" style={{ fontSize: '11px' }}>Fake bike: W/S cadence · E/D power · R/F HR</div>}
    </div>
  );
}
