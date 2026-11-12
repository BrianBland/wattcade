import '../chrome/chrome.css';
import { useEffect, useState } from 'preact/hooks';
import { ChromeHints } from '../chrome/ChromeHints';
import { Btn } from '../components/Bits';
import { formatDuration } from '../format';
import { useMenuNav } from '../useMenuNav';

/** What ending the warm-up ride right now would do. */
export type EndRideStatus =
  | { kind: 'demo' }
  | { kind: 'short'; activeS: number; leftS: number }
  | { kind: 'save'; activeS: number };

/** Pure copy for the confirmation, so the 2-minute rule reads the same everywhere (and is testable). */
export function endRideCopy(s: EndRideStatus, minS: number): { body: string; end: string } {
  if (s.kind === 'demo') return { body: 'Demo rides aren’t saved. Connect a trainer to count your rides.', end: 'End ride' };
  if (s.kind === 'short') return {
    body: `Rides count toward your stats after ${formatDuration(minS)} of pedalling. You’re at ${formatDuration(s.activeS)}: ${formatDuration(s.leftS)} more to save this one.`,
    end: 'End without saving',
  };
  return { body: `${formatDuration(s.activeS)} of pedalling will be saved to your stats, then you’ll see your ride summary.`, end: 'End & save →' };
}

/** "End ride?" over the arcade. Keep riding is focused first; B / Escape also keeps riding. */
export function EndRideConfirm({ status, minS, onEnd, onCancel }: { status: () => EndRideStatus; minS: number; onEnd: () => void; onCancel: () => void }) {
  const [s, setS] = useState(status);
  useEffect(() => { const id = setInterval(() => setS(status()), 1000); return () => clearInterval(id); }, [status]);
  const [idx] = useMenuNav(2, 2, (i) => (i === 0 ? onCancel() : onEnd()), onCancel);
  const copy = endRideCopy(s, minS);
  return (
    <div class="overlay-modal chrome-ui end-ride-confirm" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="end-ride-title" aria-describedby="end-ride-body">
        <div class="chrome-eyebrow">FINISHING UP</div>
        <h2 id="end-ride-title">End ride?</h2>
        <p id="end-ride-body">{copy.body}</p>
        <div class="end-ride-actions">
          <Btn primary={s.kind === 'short'} focused={idx === 0} onClick={onCancel}>Keep riding</Btn>
          <Btn primary={s.kind === 'save'} focused={idx === 1} onClick={onEnd}>{copy.end}</Btn>
        </div>
        <ChromeHints hints={[['lr', 'Move'], ['a', 'Select'], ['b', 'Keep riding']]} />
      </div>
    </div>
  );
}
