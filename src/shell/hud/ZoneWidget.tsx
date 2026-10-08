import type { ComponentChildren } from 'preact';
import type { BikeState, GameHud } from '../../contracts';
import { type Bar, type ZonePos, ZONE_COLORS, cadenceRange, cadenceStatus, zoneFloorWatts } from './zoneMath';

export interface ZoneView { pos: ZonePos; source: 'power' | 'hr' }

export function ZoneWidget({ bike, view, target, cadenceTarget, bars, ftp, fake, lead, trail, footer }: {
  lead?: ComponentChildren; trail?: ComponentChildren; footer?: ComponentChildren; ftp: number; fake?: boolean; bike: Readonly<BikeState>; view: ZoneView; target?: GameHud['targetZone']; cadenceTarget?: GameHud['targetCadence']; bars: Bar[];
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
    <div class="zw">
      <div class="zw-menu">{lead}</div>
      <div class="zw-actions">{trail}</div>
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
          {label && <div class="zw-label" title={label}>{label}</div>}
        </div>
        <div class="zw-nums">
          <div class={view.source === 'power' ? 'primary' : ''}><div><b>{Math.round(bike.power3s)}</b><small>W</small></div><span class="zw-ftp">{Math.round(bike.ftpFraction * 100)}% FTP</span></div>
          <div class={view.source === 'hr' ? 'primary' : ''}><b>{bike.hr5s == null ? '--' : Math.round(bike.hr5s)}</b><small>bpm</small></div>
          <div class={`zw-cad${cad ? ` ${cad}` : ''}`}>
            <div><b>{Math.round(bike.cadence3s)}</b><small>rpm</small></div>
            {cadenceTarget && <em class="zw-cad-guide" title={cadenceTarget.label} aria-label={`Cadence target ${cadenceRange(cadenceTarget)} rpm`}>{cad === 'low' ? '↑ ' : cad === 'high' ? '↓ ' : ''}{cadenceRange(cadenceTarget)}</em>}
          </div>
        </div>
      </div>
      <div class="zw-history">
        {footer}
      <div class="zw-chart">
        {bars.map((b) => <i style={{ height: `${Math.max(2, (b.power / maxP) * 100)}%`, background: ZONE_COLORS[b.zone - 1] }} />)}
        {hrPts && <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={hrPts} fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>}
      </div>
      </div>
      {fake && <div class="dim" style={{ fontSize: '11px' }}>Fake bike: W/S cadence · E/D power · R/F HR</div>}
    </div>
  );
}
