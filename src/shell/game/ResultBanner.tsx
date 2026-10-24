import type { Profile } from '../../contracts';
import { unitsFor } from '../../units';
import '../chrome/chrome.css';
import { ChromeHints } from '../chrome/ChromeHints';
import { UiReadout } from '../../ui';
import { Btn } from '../components/Bits';
import { CountUp } from '../components/ui';
import { formatDuration, rideMetricValue, rideMetricLabel } from '../format';

/** Short "GAME OVER" / "RIDE ENDED" moment between the game and the summary screen. */
export function ResultBanner({ over, durationS, summary, xp, onContinue, profile }: {
  over: boolean; durationS: number; summary: Record<string, number | string>; xp: number | null; onContinue: () => void; profile?: Profile;
}) {
  const top = Object.entries(summary).slice(0, 3);
  return (
    <div class="overlay-modal chrome-ui result" onClick={onContinue}>
      <div class="result-card" role="dialog" aria-label="Ride result" aria-modal="true"><div class="chrome-eyebrow">YOUR RIDE / COMPLETE</div>
        <h1>{over ? 'Game over' : 'Ride ended'}</h1>
        <div class="result-stats">
          <UiReadout label="Time" value={formatDuration(durationS)}/>
          {top.map(([k, v]) => <UiReadout key={k} label={rideMetricLabel(k)} value={rideMetricValue(k,v,unitsFor(profile))}/>)}
        </div>
        {xp != null && xp > 0 && <div class="result-xp">+<CountUp to={xp} ms={900} tick /> XP</div>}
        <Btn primary onClick={onContinue}>Continue →</Btn>
        <ChromeHints hints={[['a', 'Continue']]} />
      </div>
    </div>
  );
}
