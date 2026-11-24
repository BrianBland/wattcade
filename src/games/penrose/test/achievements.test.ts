import { describe, expect, it } from 'vitest';
import type { AchievementDef, SessionRecord } from '../../../contracts';
import { ACHIEVEMENTS, achievementValue, defaultProfile } from '../../../progression';
import { isWip } from '../../registry';
import { achievements } from '../achievements';
import { CAMPAIGN } from '../campaign';
import { chaptersMask, MASTERY } from '../sim/sim';

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'r', profileId: 'x', gameId: 'penrose', startedAt: 0, durationS: 600, samples: [], events: [],
  stats: { avgPower: 150, maxPower: 200, kj: 90, avgHr: null, zoneSeconds: [0, 0, 0, 0, 0], sprints: 0 },
  gameSummary: {}, ...over,
});
const byId = (id: string) => achievements.find((a) => a.id === id)!;
const passes = (a: AchievementDef, r: SessionRecord) => !!a.check?.(defaultProfile(), r, []);
const counted = (a: AchievementDef, r: SessionRecord) => a.count!.of(r, defaultProfile());

describe('penrose achievements', () => {
  it('ids are prefixed and unique, and sized like the other games (about ten, under 1,000 XP)', () => {
    const ids = achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('pp_'))).toBe(true);
    expect(achievements.length).toBeLessThanOrEqual(12);
    expect(achievements.reduce((s, a) => s + a.bonusXp, 0)).toBeLessThan(1000);
  });

  it('stay off while Penrose is under construction', () => {
    expect(isWip('penrose')).toBe(true);
    expect(ACHIEVEMENTS.some((a) => a.id.startsWith('pp_'))).toBe(false);
  });

  it('chapter tiers read the cleared-chapter mask as bits', () => {
    const p = defaultProfile(); p.counters = { 'penrose.chapters': 0b101 };
    expect(achievementValue(byId('pp_cartographer'), p)).toBe(2);
    p.counters['penrose.chapters'] = 0b111;
    expect(achievementValue(byId('pp_cartographer'), p)).toBeGreaterThanOrEqual(byId('pp_cartographer').goal!);
    expect(byId('pp_monument').goal).toBe(CAMPAIGN.length);
    expect(counted(byId('pp_monument'), rec({ gameId: 'lighthouse', gameSummary: { chaptersDone: 7 } }))).toBe(0);
  });

  it('chaptersMask sets a bit only for chapters with every level done', () => {
    expect(chaptersMask([['a', 'b'], ['c'], []], new Set(['a', 'b']))).toBe(0b1);
    expect(chaptersMask([['a', 'b'], ['c']], new Set(['a', 'c']))).toBe(0b10);
  });

  it('one-ride feats need real work', () => {
    expect(passes(byId('pp_grand_tour'), rec({ gameSummary: { levelsRidden: 7 } }))).toBe(false);
    expect(passes(byId('pp_grand_tour'), rec({ gameSummary: { levelsRidden: 8 } }))).toBe(true);
    expect(passes(byId('pp_unbroken'), rec({ gameSummary: { bestStreak: 5 } }))).toBe(true);
    expect(passes(byId('pp_spring_tide'), rec({ gameSummary: { tideFullS: 59 } }))).toBe(false);
    expect(passes(byId('pp_cube'), rec({ events: [{ t: 1, type: 'level-cleared', data: { id: 'x-cube' } }] }))).toBe(true);
    expect(passes(byId('pp_cube'), rec({ gameId: 'dungeon', events: [{ t: 1, type: 'level-cleared', data: { id: 'x-cube' } }] }))).toBe(false);
  });

  it("Escher's Staircase counts virtual climb from the machine-load grade", () => {
    const samples = Array.from({ length: 600 }, (_, t) => ({ t, power: 220, cadence: 85, hr: null, grade: 4, mode: 'sim' as const }));
    const m = counted(byId('pp_escher'), rec({ samples }));
    expect(m).toBeGreaterThan(50);
    expect(counted(byId('pp_escher'), rec({ gameId: 'watershed', samples }))).toBe(0);
  });

  it('mastery thresholds skip the easy opening chapters', () => {
    expect(MASTERY.cleanFrom).toBeGreaterThanOrEqual(2);
    expect(MASTERY.streakFrom).toBeGreaterThanOrEqual(3);
    expect(MASTERY.unaidedTo).toBeLessThan(CAMPAIGN.length);
  });
});
