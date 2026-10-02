import type { SessionRecord } from '../../contracts';
import type { AwardView } from '../types';
import { Btn, Stat, ZoneBar } from '../components/Bits';
import { formatDuration, formatNum, formatValue } from '../format';
import { useMenuNav } from '../useMenuNav';

export function Summary({ record, award, onDone }: { record: SessionRecord; award: AwardView; onDone: () => void }) {
  useMenuNav(1, 1, onDone, onDone);
  const s = record.stats;
  return (
    <div class="screen">
      <h1>Session complete</h1>
      <div class="stats">
        <Stat label="Duration" value={formatDuration(record.durationS)} /><Stat label="Avg power" value={`${formatNum(s.avgPower)} W`} />
        <Stat label="Max power" value={`${formatNum(s.maxPower)} W`} /><Stat label="Energy" value={`${formatNum(s.kj)} kJ`} />
        <Stat label="Avg HR" value={s.avgHr == null ? '--' : `${formatNum(s.avgHr)} bpm`} /><Stat label="Sprints" value={String(s.sprints)} />
      </div>
      <h2>Time in zone</h2>
      <ZoneBar zoneSeconds={s.zoneSeconds} />
      <h2>Game</h2>
      <div class="stats">{Object.entries(record.gameSummary).map(([k, v]) => <Stat label={k} value={formatValue(v)} />)}</div>
      <h2>Rewards</h2>
      <div style={{ fontSize: '32px' }}>+{award.xpGained} XP</div>
      {award.levelAfter > award.levelBefore && <div class="levelup">LEVEL UP! {award.levelBefore} → {award.levelAfter}</div>}
      {award.newAchievements.map((a) => <div class="card" style={{ minHeight: 0, cursor: 'default' }}>★ {a.name}</div>)}
      <div><Btn primary focused onClick={onDone}>Continue</Btn></div>
    </div>
  );
}
