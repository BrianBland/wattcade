import { useState } from 'preact/hooks';
import { Btn } from '../components/Bits';
import { debugActions } from '../services';
import { useMenuNav } from '../useMenuNav';

export function PauseMenu({ difficulty, onResume, onQuit, legendOn, onLegend }: { legendOn: boolean; onLegend: (v: boolean) => void; difficulty: number; onResume: () => void; onQuit: () => void }) {
  const [diff, setDiff] = useState(difficulty);
  const adjust = (d: number) => { const v = Math.min(1.5, Math.max(0.5, +(diff + d).toFixed(2))); setDiff(v); debugActions.setDifficulty(v); };
  const [idx] = useMenuNav(4, 1, (i) => (i === 0 ? onResume() : i === 2 ? onLegend(!legendOn) : i === 3 ? onQuit() : adjust(0.05)), onResume);
  return (
    <div class="overlay-modal">
      <div class="modal">
        <h2>Paused</h2>
        <Btn primary focused={idx === 0} onClick={onResume}>Resume</Btn>
        <div class="row">
          <Btn small focused={idx === 1} onClick={() => adjust(-0.05)}>-</Btn>
          <span>Difficulty {diff.toFixed(2)}</span>
          <Btn small onClick={() => adjust(0.05)}>+</Btn>
        </div>
        <Btn focused={idx === 2} onClick={() => onLegend(!legendOn)}>{legendOn ? 'Hide' : 'Show'} controls legend</Btn>
        <Btn focused={idx === 3} onClick={onQuit}>Quit to summary</Btn>
      </div>
    </div>
  );
}
