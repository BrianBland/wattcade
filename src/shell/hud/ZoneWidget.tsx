import { formatDuration } from '../format';
import type { BikeState, GameHud } from '../../contracts';
import { type Bar, type ZonePos, ZONE_COLORS, cadenceRange, cadenceStatus, zoneFloorWatts } from './zoneMath';

// Anchor low targets at their start and high targets at their end to keep text inside the meter.
const labelAnchor = (t: { min: number; max: number }) => t.min <= 2
  ? { marginLeft: `${(t.min - 1) * 20}%` }
  : { marginLeft: 'auto', marginRight: `${(5 - t.max) * 20}%`, textAlign: 'right' as const };

export interface ZoneView { pos: ZonePos; source: 'power' | 'hr' }

function MetricIcon({ source }: { source: 'power' | 'hr' | 'cadence' | 'clock' | 'gear' }) {
  return <svg class="zw-metric-icon" viewBox="0 0 24 24" aria-hidden="true">
    {source === 'clock'
      ? <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></g>
      : source === 'gear'
      ? <g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></g>
      : source === 'cadence'
      ? <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m0 5v-5h-5" /><circle cx="12" cy="12" r="2" /></g>
      : <path fill="currentColor" d={source === 'hr' ? 'M12 21 3.6 12.8C-2 7.2 5.8-.6 12 5.6 18.2-.6 26 7.2 20.4 12.8Z' : 'M13 2 3 14h7l-1 8 12-14h-8l1-6Z'} />}
  </svg>;
}

export function ZoneWidget({ bike, view, target, cadenceTarget, bars, ftp, fake, gears }: {
  gears?: boolean; ftp: number; fake?: boolean; bike: Readonly<BikeState>; view: ZoneView; target?: GameHud['targetZone']; cadenceTarget?: GameHud['targetCadence']; bars: Bar[];
}) {
  const maxP = Math.max(1.6 * ftp, 100, ...bars.map((b) => b.power));
  const hrs = bars.map((b) => b.hr).filter((h): h is number => h != null);
  const hrMin = Math.min(...hrs, 200), hrMax = Math.max(...hrs, 40);
  const cad = cadenceStatus(bike.cadence3s, cadenceTarget);
  // power-judged targets (short efforts) say how many watts they need, since the bar has switched to power
  const floorW = target?.source === 'power' ? zoneFloorWatts(target.min, ftp) : null;
  const label = target?.label && floorW != null ? `${target.label} · ${floorW}+ W` : target?.label;
  const missing = view.source === 'hr' && bike.hr5s == null;
  const status = missing ? 'Waiting for HR' : !target ? `Current Z${view.pos.zone}` : view.pos.zone < target.min ? '↑ Below target' : view.pos.zone > target.max ? '↓ Above target' : '✓ In target';
  const range = target ? (target.min === target.max ? `Z${target.min}` : `Z${target.min}–${target.max}`) : 'Zones';
  const hrPts = bars.map((b, i) => b.hr == null ? null : `${(i / 89) * 100},${100 - ((b.hr - hrMin + 5) / (hrMax - hrMin + 10)) * 100}`).filter(Boolean).join(' ');
  return (
    <div class={`zw${gears ? ' has-gears' : ''}`}>
      <div class="zw-main">
        <div class={`zw-zone ${view.source}`}>
          <div class="zw-meter">
            <svg class={`zw-icon${missing ? ' missing' : target && (view.pos.zone < target.min || view.pos.zone > target.max) ? ' off-target' : ' on-target'}`} viewBox="0 0 24 24" role="img" aria-label={`${view.source === 'hr' ? 'Heart rate' : 'Power'}: ${status}`}>
              <path fill="currentColor" d={view.source === 'hr' ? 'M12 21 3.6 12.8C-2 7.2 5.8-.6 12 5.6 18.2-.6 26 7.2 20.4 12.8Z' : 'M13 2 3 14h7l-1 8 12-14h-8l1-6Z'} />
            </svg>
          <div class="zw-bar" role="img" aria-label={`${view.source === 'hr' ? 'Heart rate' : 'Power'} zones. ${status}${target ? `. Target ${range}` : ''}`}>
            {ZONE_COLORS.map((c, i) => <i class={target && (i + 1 < target.min || i + 1 > target.max) ? 'outside' : ''} style={{ background: c }}>Z{i + 1}</i>)}
            {target && <u class="zw-target" style={{ left: `${(target.min - 1) * 20}%`, width: `${(target.max - target.min + 1) * 20}%` }} />}
            {!missing && <s class="zw-marker" style={{ left: `${Math.min(.98, Math.max(.02, view.pos.pos)) * 100}%` }} />}
          </div>
          </div>
          {label && <div class="zw-label-track"><div class="zw-label" style={target ? labelAnchor(target) : undefined} title={label}>{label}</div></div>}
        </div>
        <div class="zw-nums">
          <div class={view.source === 'power' ? 'primary' : ''}><div class="zw-reading" aria-label={`${Math.round(bike.power3s)} watts`} title="Power (watts)"><MetricIcon source="power" /><b>{Math.round(bike.power3s)}</b></div><span class="zw-ftp">{Math.round(bike.ftpFraction * 100)}% FTP</span></div>
          <div class={view.source === 'hr' ? 'primary' : ''}><div class="zw-reading" aria-label={bike.hr5s == null ? 'Heart rate unavailable' : `${Math.round(bike.hr5s)} beats per minute`} title="Heart rate (bpm)"><MetricIcon source="hr" /><b>{bike.hr5s == null ? '--' : Math.round(bike.hr5s)}</b></div></div>
          <div class={`zw-cad${cad ? ` ${cad}` : ''}`}>
            <div class="zw-reading" aria-label={`${Math.round(bike.cadence3s)} revolutions per minute`} title="Cadence (rpm)"><MetricIcon source="cadence" /><b>{Math.round(bike.cadence3s)}</b></div>
            {cadenceTarget && <em class="zw-cad-guide" title={cadenceTarget.label} aria-label={`Cadence target ${cadenceRange(cadenceTarget)} rpm`}>{cad === 'low' ? '↑ ' : cad === 'high' ? '↓ ' : ''}{cadenceRange(cadenceTarget)}</em>}
          </div>
          <div class="zw-clock"><div class="zw-reading" aria-label={`Ride time ${formatDuration(bike.activeSeconds)}`} title="Ride time (pedalling)"><MetricIcon source="clock" /><b>{formatDuration(bike.activeSeconds)}</b></div></div>
          {gears && <div class="zw-gear"><div class="zw-reading" aria-label={`Gear ${bike.gear}`} title="Current virtual gear"><MetricIcon source="gear" /><b>{bike.gear}</b></div></div>}
        </div>
      </div>
      <div class="zw-history">
      <div class="zw-chart">
        {bars.map((b) => <i style={{ height: `${Math.max(2, (b.power / maxP) * 100)}%`, background: ZONE_COLORS[b.zone - 1] }} />)}
        {hrPts && <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={hrPts} fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>}
      </div>
      </div>
      {fake && <div class="dim" style={{ fontSize: '11px' }}>Fake bike: W/S cadence · E/D power · R/F HR</div>}
    </div>
  );
}
