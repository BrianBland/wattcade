import { useEffect, useState } from 'preact/hooks';
import type { SessionRecord } from '../../contracts';
import type { AwardView } from '../types';
import { Btn, Stat, ZoneBar } from '../components/Bits';
import { CountUp, KeyHints } from '../components/ui';
import { downsample, formatDuration, formatValue, prettyKey } from '../format';
import { levelView } from '../services';
import { getGame } from '../../games/registry';
import { ZONE_COLORS } from '../hud/zoneMath';
import { play } from '../../audio/sfx';
import { useMenuNav } from '../useMenuNav';

const N = 120;
/** Power bars coloured by zone + HR line over the ride. */
function RideChart({ record, ftp }: { record: SessionRecord; ftp: number }) {
  const pw = downsample(record.samples.map((s) => s.power), N) as Array<number | null>;
  const hr = downsample(record.samples.map((s) => s.hr), N);
  if (pw.length < 2) return null;
  const maxP = Math.max(1.6 * ftp, ...pw.map((p) => p ?? 0));
  const hs = hr.filter((h): h is number => h != null), lo = Math.min(...hs, 200) - 5, hi = Math.max(...hs, 60) + 5;
  const w = 100 / pw.length;
  const zone = (p: number) => { const f = p / ftp; return f < 0.55 ? 0 : f < 0.75 ? 1 : f < 0.9 ? 2 : f < 1.05 ? 3 : 4; };
  const hrPts = hr.map((h, i) => (h == null ? null : `${(i + 0.5) * w},${40 - ((h - lo) / (hi - lo)) * 38}`)).filter(Boolean).join(' ');
  return (
    <svg class="ride-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
      {pw.map((p, i) => p == null ? null : <rect x={i * w} y={40 - (p / maxP) * 40} width={w * 0.85} height={(p / maxP) * 40} fill={ZONE_COLORS[zone(p)]} />)}
      {hrPts && <polyline points={hrPts} fill="none" stroke="#fff" stroke-width="1.6" vector-effect="non-scaling-stroke" />}
    </svg>
  );
}

/** Staged reveal: stats -> chart & zones -> rewards (XP count-up, bar fill, level-up, achievements). */
export function Summary({ record, award, xpAfter, ftp, onDone }: { record: SessionRecord; award: AwardView; xpAfter: number; ftp: number; onDone: () => void }) {
  useMenuNav(1, 1, onDone, onDone);
  const s = record.stats;
  const game = getGame(record.gameId);
  const warm = record.gameId === 'warmup';
  const leveled = award.levelAfter > award.levelBefore;
  const before = levelView(Math.max(0, xpAfter - award.xpGained)), after = levelView(xpAfter);
  const [bar, setBar] = useState(leveled ? 0 : before.progress);
  useEffect(() => {
    const ts = [
      setTimeout(() => { play('reward'); setBar(after.progress); }, 1300),
      leveled ? setTimeout(() => play('levelup'), 2300) : 0,
      ...award.newAchievements.map((_a, i) => setTimeout(() => play('unique'), 2600 + i * 500)),
    ];
    return () => ts.forEach((t) => t && clearTimeout(t));
  }, []);
  const stats: Array<[string, number, (n: number) => string]> = [
    ['Duration', record.durationS, formatDuration], ['Avg power', s.avgPower, (n) => `${Math.round(n)} W`],
    ['Max power', s.maxPower, (n) => `${Math.round(n)} W`], ['Energy', s.kj, (n) => `${Math.round(n)} kJ`],
    ['Avg HR', s.avgHr ?? NaN, (n) => (Number.isFinite(n) ? `${Math.round(n)} bpm` : '--')], ['Sprints', s.sprints, (n) => String(Math.round(n))],
  ];
  return (
    <div class="screen summary">
      <div class="screen-head">
        <div><h1>{warm ? 'Warm-up done' : 'Ride complete'}</h1><div class="sub">{game?.title ?? record.gameId}</div></div>
        <span class="spacer" />
        <Btn primary focused onClick={onDone}>Continue ▶</Btn>
      </div>
      <div class="summary-grid">
        <div class="panel">
          <div class="stats">{stats.map(([l, v, f], i) => <Stat label={l} value={<CountUp to={v} format={f} delayMs={i * 80} />} delayMs={i * 80} />)}</div>
          <h2 class="gap-top">Your ride</h2>
          <div class="reveal" style={{ animationDelay: '500ms' }}><RideChart record={record} ftp={ftp} /><ZoneBar zoneSeconds={s.zoneSeconds} /></div>
          {Object.keys(record.gameSummary).length > 0 && <>
            <h2 class="gap-top">{warm ? 'Route' : 'Game'}</h2>
            <div class="stats compact">{Object.entries(record.gameSummary).map(([k, v], i) => <Stat label={prettyKey(k)} value={formatValue(v)} delayMs={700 + i * 60} />)}</div>
          </>}
        </div>
        <div class="panel rewards reveal" style={{ animationDelay: '1100ms' }}>
          <h2>Rewards</h2>
          <div class="xp-gain">+<CountUp to={award.xpGained} delayMs={1300} ms={1100} tick /> XP</div>
          <div class="row"><b>Level {after.level}</b><span class="spacer" /><span class="dim">{Math.round(after.xp)} / {after.nextXp}</span></div>
          <div class="bar big"><i style={{ width: `${bar * 100}%` }} /></div>
          {leveled && <div class="levelup reveal" style={{ animationDelay: '2300ms' }}>LEVEL UP! {award.levelBefore} → {award.levelAfter}</div>}
          {award.newAchievements.map((a, i) => <div class="badge on reveal" style={{ animationDelay: `${2600 + i * 500}ms` }}><span class="medal">★</span><b>{a.name}</b></div>)}
        </div>
      </div>
      <KeyHints hints={[['a', 'Continue']]} />
    </div>
  );
}
