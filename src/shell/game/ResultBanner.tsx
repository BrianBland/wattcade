import { CountUp, KeyHints } from '../components/ui';
import { formatDuration, formatValue, prettyKey } from '../format';

/** Short "GAME OVER" / "RIDE ENDED" moment between the game and the summary screen. */
export function ResultBanner({ over, durationS, summary, xp, onContinue }: {
  over: boolean; durationS: number; summary: Record<string, number | string>; xp: number | null; onContinue: () => void;
}) {
  const top = Object.entries(summary).slice(0, 3);
  return (
    <div class="overlay-modal result" onClick={onContinue}>
      <div class="result-card">
        <h1>{over ? 'Game over' : 'Ride ended'}</h1>
        <div class="result-stats">
          <div><small>Time</small><b>{formatDuration(durationS)}</b></div>
          {top.map(([k, v]) => <div><small>{prettyKey(k)}</small><b>{formatValue(v)}</b></div>)}
        </div>
        {xp != null && xp > 0 && <div class="result-xp">+<CountUp to={xp} ms={900} tick /> XP</div>}
        <KeyHints hints={[['a', 'Continue']]} />
      </div>
    </div>
  );
}
