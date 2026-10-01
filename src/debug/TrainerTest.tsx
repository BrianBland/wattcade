import type { TrainerCommand } from '../contracts';

export const TRAINER_TESTS: Array<{ label: string; cmd: TrainerCommand }> = [
  { label: '0% grade', cmd: { mode: 'sim', gradePct: 0 } },
  { label: '5% grade', cmd: { mode: 'sim', gradePct: 5 } },
  { label: '150 W', cmd: { mode: 'erg', watts: 150 } },
  { label: '200 W', cmd: { mode: 'erg', watts: 200 } },
  { label: '20% level', cmd: { mode: 'resistance', levelPct: 20 } },
  { label: '50% level', cmd: { mode: 'resistance', levelPct: 50 } },
  { label: 'clear', cmd: { mode: 'none' } },
];

/** "Trainer test" panel: lets you feel sim / ERG / resistance modes on the real trainer. */
export function TrainerTest({ applyTest }: { applyTest: (cmd: TrainerCommand) => void }) {
  return (
    <div data-testid="trainer-test">
      <h4>Trainer test</h4>
      {TRAINER_TESTS.map((t) => <button onClick={() => applyTest(t.cmd)}>{t.label}</button>)}
    </div>
  );
}
