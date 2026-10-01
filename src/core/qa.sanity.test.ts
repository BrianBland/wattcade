import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../contracts';
import { games } from '../games/registry';
import { SCRIPTS, TimelineInput, TuningRegistry, createGameSession, testProfile } from './index';

/** Returns the path of the first non-finite number found, or null. */
function findBad(v: unknown, path = '$', depth = 0): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${path}=${v}`;
  if (v === null || typeof v !== 'object' || depth > 8) return null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const r = findBad(x, `${path}.${k}`, depth + 1);
    if (r) return r;
  }
  return null;
}

describe('QA sanity: no NaN/Infinity in snapshots or summaries', () => {
  for (const game of games) {
    for (const name of Object.keys(SCRIPTS)) {
      it(`${game.id} x ${name}`, () => {
        const profile = testProfile();
        const script = SCRIPTS[name];
        const s = createGameSession({
          game, profile, input: new TimelineInput(script.input), seed: 7,
          simOpts: { autopilot: true }, fake: { script: name },
          tuningRegistry: new TuningRegistry({ profileId: profile.id, storage: null }),
        });
        const total = Math.round(120 / FIXED_DT);
        const every = Math.round(3 / FIXED_DT);
        const bad: string[] = [];
        for (let i = 0; i < total && !s.sim.isOver(); i++) {
          s.step(1);
          if (i % every === 0) {
            const b = findBad(s.sim.snapshot(), 'snapshot');
            if (b) { bad.push(`t=${(i * FIXED_DT).toFixed(1)} ${b}`); break; }
          }
        }
        const b = findBad(s.sim.snapshot(), 'snapshot'); if (b) bad.push(`final ${b}`);
        const rec = s.finish();
        const sb = findBad(rec.gameSummary, 'summary') ?? findBad(rec.stats, 'stats');
        if (sb) bad.push(sb);
        expect(bad).toEqual([]);
        for (const c of s.commands) expect(findBad(c, 'cmd')).toBeNull();
      });
    }
  }
});
