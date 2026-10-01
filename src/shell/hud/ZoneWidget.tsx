import type { BikeState, GameHud } from '../../contracts';
import { type Bar, type ZonePos, ZONE_COLORS } from './zoneMath';

export interface ZoneView { pos: ZonePos; source: 'power' | 'hr' }

export function ZoneWidget({ bike, view, target, bars, ftp, fake }: { ftp: number; fake?: boolean; bike: Readonly<BikeState>; view: ZoneView; target?: GameHud['targetZone']; bars: Bar[] }) {
  const maxP = Math.max(1.6 * ftp, 100, ...bars.map((b) => b.power));
  const hrs = bars.map((b) => b.hr).filter((h): h is number => h != null);
  const hrMin = Math.min(...hrs, 200), hrMax = Math.max(...hrs, 40);
  const hrPts = bars.map((b, i) => b.hr == null ? null : `${(i / 89) * 100},${100 - ((b.hr - hrMin + 5) / (hrMax - hrMin + 10)) * 100}`).filter(Boolean).join(' ');
  return (
    <div class="zw">
      <div class="zw-nums">
        <div><b>{Math.round(bike.power3s)}</b><small>W</small></div>
        <div><b>{Math.round(bike.ftpFraction * 100)}</b><small>%FTP</small></div>
        <div><b>{bike.hr5s == null ? '--' : Math.round(bike.hr5s)}</b><small>HR</small></div>
        <div class="zw-src dim">{view.source === 'hr' ? 'zones: HR' : 'zones: power'}</div>
      </div>
      {target?.label && <div class="zw-label" style={{ color: ZONE_COLORS[target.min - 1], marginLeft: `${(target.min - 1) * 20}%` }}>{target.label}</div>}
      <div class="zw-bar">
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
