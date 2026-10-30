import { describe, expect, it } from 'vitest';
import { ESCAPE_LINES } from '../sim/catalogue';
import { STORY } from '../sim/story';

const LIFE_S = 4 + 1; // seaside.monologueS + monologueGapS defaults
const lines = STORY.flatMap((s) => s.monologue.map((l) => ({ scene: s.id, text: l.text })));
const all = [...lines.map((l) => l.text), ...Object.values(ESCAPE_LINES).flat()];
const words = (t: string) => t.split(/\s+/).filter((w) => /\w/.test(w)).length;

describe('narrative pass (#196)', () => {
  it('keeps every line short and never names Lou', () => {
    for (const t of all) {
      expect(words(t), t).toBeLessThanOrEqual(8);
      expect(t, t).not.toMatch(/\blou\b/i);
    }
  });

  it('gives every scene its lines, with silence on purpose for the title, the sinking, the surfacing, the fall, re-entry and the end', () => {
    const silent = STORY.filter((s) => s.monologue.length === 0).map((s) => s.id);
    expect(silent).toEqual(['title', 'under', 'breakthrough', 'fall', 'reentry', 'cliff', 'angel']);
    expect(STORY.find((s) => s.id === 'highway')!.monologue.at(-1)!.text).toBe('Big bird.'); // the loop seed
    expect(STORY.find((s) => s.id === 'sunset')!.monologue.map((l) => l.text)).toEqual(['Gone fishing.']);
  });

  it('times no line to land in (or just before) a planned sprint', () => {
    for (const s of STORY) for (const l of s.monologue) for (const p of s.pulls) {
      const t = l.at * s.planS;
      expect(t + LIFE_S <= p.atS || t >= p.atS + p.planS, `${s.id}: "${l.text}" at ${t.toFixed(0)} s`).toBe(true);
    }
  });
});
